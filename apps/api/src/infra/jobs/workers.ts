import { db, expedientes, subetapas, usuarios } from "@pis/db";
import { evaluarPlazo } from "@pis/domain";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { enviarCorreo, urlPortal } from "../mail/correo.service.js";
import { renderizarCorreo } from "../mail/plantilla-correo.js";
import { COLA_CORREOS, COLA_RECORDATORIOS, COLA_REVISION_DOCUMENTOS, type CorreoPayload, type RevisionDocumentoPayload, enqueueCorreo } from "./colas.js";
import { getBoss } from "./pg-boss.client.js";

let registrados = false;

/**
 * Workers pg-boss: correos (SMTP real vía nodemailer) + revisión diaria de
 * plazos (HU-0055). Idempotentes y best-effort: nunca tumban la API.
 */
export async function iniciarWorkers(): Promise<void> {
  if (registrados) return;
  let boss: Awaited<ReturnType<typeof getBoss>>;
  try {
    boss = await getBoss();
  } catch (err) {
    console.error("[workers] pg-boss no disponible; workers desactivados", err);
    return;
  }
  // Las colas deben existir antes de programar el cron (schedule en
  // cola inexistente = "Queue not found"). createQueue es idempotente.
  await boss.createQueue(COLA_CORREOS);
  await boss.createQueue(COLA_RECORDATORIOS);
  await boss.createQueue(COLA_REVISION_DOCUMENTOS);
  await boss.work<CorreoPayload>(COLA_CORREOS, async (jobs) => {
    // Un error aquí hace que pg-boss reintente el job (retryLimit al encolar).
    for (const job of jobs) await procesarCorreo(job.data);
  });
  await boss.work<RevisionDocumentoPayload>(COLA_REVISION_DOCUMENTOS, async (jobs) => {
    for (const job of jobs) {
      await procesarRevisionDocumento(job.data);
    }
  });
  await boss.work(COLA_RECORDATORIOS, async () => {
    await revisarPlazos();
  });
  try {
    await boss.schedule(COLA_RECORDATORIOS, "0 7 * * 1-5", undefined, { tz: "America/Lima" });
  } catch (err) {
    console.error("[workers] no se pudo programar recordatorios", err);
  }
  registrados = true;
  console.log("[workers] correos + recordatorios activos");
}

/** Normaliza payloads antiguos (`{ expedienteId, codigo, texto }`) en cola. */
function normalizar(p: Partial<CorreoPayload> & { codigo?: string }): CorreoPayload {
  const texto = p.texto ?? "Hay novedades en tu trámite de titulación.";
  return {
    asunto: p.asunto ?? "Novedades en tu trámite de titulación",
    titulo: p.titulo ?? "Novedades en tu trámite",
    texto,
    ...(p.para ? { para: p.para } : {}),
    ...(p.expedienteId ? { expedienteId: p.expedienteId } : {}),
    ...(p.aParticipantes !== undefined ? { aParticipantes: p.aParticipantes } : {}),
    ...(p.enlace ? { enlace: p.enlace } : {}),
    ...(p.textoEnlace ? { textoEnlace: p.textoEnlace } : {}),
  };
}

/** Resuelve destinatarios + datos del expediente y envía. Exportada para specs/manual. */
export async function procesarCorreo(entrada: unknown): Promise<void> {
  const p = normalizar((entrada ?? {}) as Partial<CorreoPayload>);
  const para = [...(p.para ?? [])];
  let codigo: string | null = null;
  let estado: string | null = null;
  if (p.expedienteId) {
    const rows = await db
      .select({
        codigo: expedientes.codigo,
        estado: expedientes.estado,
        p1: expedientes.participante1Id,
        p2: expedientes.participante2Id,
      })
      .from(expedientes)
      .where(eq(expedientes.id, p.expedienteId))
      .limit(1);
    const exp = rows[0];
    if (exp) {
      codigo = exp.codigo;
      estado = exp.estado;
      const ids = [exp.p1, exp.p2].filter((x): x is string => !!x);
      if (p.aParticipantes !== false && ids.length > 0) {
        const gente = await db
          .select({ email: usuarios.email })
          .from(usuarios)
          .where(and(inArray(usuarios.id, ids), eq(usuarios.activo, true)));
        para.push(...gente.map((g) => g.email));
      }
    }
  }
  const correo = renderizarCorreo({
    titulo: p.titulo,
    texto: p.texto,
    codigo,
    estado,
    enlace: p.enlace ?? (p.expedienteId ? urlPortal("/mi-tramite") : null),
    textoEnlace: p.textoEnlace ?? "Ver mi trámite",
  });
  const r = await enviarCorreo({ para, asunto: p.asunto, html: correo.html, texto: correo.texto });
  console.log(
    JSON.stringify({ canal: "correo", modo: r.modo, enviado: r.enviado, asunto: p.asunto, codigo }),
  );
}

/**
 * Revisión de plazos (RN-PLZ-08, HU-0055): subetapas EN_CURSO cuyo plazo en
 * días hábiles ya venció. Notifica una sola vez (alertada_at) al responsable
 * y a los participantes. Devuelve cuántas alertas emitió.
 */
export async function revisarPlazos(ahora: Date = new Date()): Promise<number> {
  try {
    const rows = await db
      .select({
        id: subetapas.id,
        expedienteId: subetapas.expedienteId,
        etapa: subetapas.etapa,
        orden: subetapas.orden,
        nombre: subetapas.nombre,
        plazo: subetapas.plazo,
        inicio: subetapas.inicio,
        responsable: subetapas.responsable,
      })
      .from(subetapas)
      .where(
        and(
          eq(subetapas.estado, "EN_CURSO"),
          isNotNull(subetapas.inicio),
          isNull(subetapas.alertadaAt),
        ),
      );
    let alertas = 0;
    for (const r of rows) {
      if (!r.inicio) continue;
      const plazo = evaluarPlazo(r.inicio, r.plazo, ahora);
      if (!plazo?.vencido) continue;
      const vence = plazo.vencimiento.toISOString().slice(0, 10);
      await db.update(subetapas).set({ alertadaAt: ahora }).where(eq(subetapas.id, r.id));
      await enqueueCorreo({
        expedienteId: r.expedienteId,
        para: r.responsable ? [r.responsable] : [],
        asunto: `Plazo vencido: subetapa ${r.etapa}.${r.orden}`,
        titulo: "Subetapa con plazo vencido",
        texto: `La subetapa ${r.etapa}.${r.orden} «${r.nombre}» venció el ${vence} (${r.plazo ?? "sin plazo"}). El área responsable debe atenderla o derivarla.`,
      });
      alertas += 1;
    }
    return alertas;
  } catch (err) {
    console.error("[workers] revisarPlazos falló", err);
    return 0;
  }
}
export async function procesarRevisionDocumento(payload: RevisionDocumentoPayload): Promise<void> {
  const { documentoId, rutaPdf, expedienteId } = payload;
  
  try {
    console.log(`[workers] Iniciando análisis del documento ${documentoId}`);
    
    // TODO: 1. Importar y ejecutar el motor de análisis (Tarea 2)
    // const resultado = await motorAnalisisPdf(rutaPdf);

    // TODO: 2. Guardar el informe resultante con Drizzle ORM (Tarea 1)
    // await db.update(tablaTarea1).set({ informe: resultado }).where(eq(tablaTarea1.documentoId, documentoId));

    console.log(`[workers] Análisis completado para documento ${documentoId}`);
  } catch (err) {
    console.error(`[workers] Error al procesar documento ${documentoId}. Marcando como FALLIDO.`, err);
    
    // TODO: 3. Actualizar el estado a FALLIDO en Drizzle
    // await db.update(documentos).set({ estado: 'FALLIDO' }).where(eq(documentos.id, documentoId));
  }
}
