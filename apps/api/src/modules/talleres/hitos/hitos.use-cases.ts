import { randomUUID } from "node:crypto";
import type { AprobarPlanInput, PreviaAprobacionDTO } from "@pis/contracts";
import {
  type DbExecutor,
  db,
  entregasHito,
  fichaRegistros,
  hitosProyecto,
  pensionesAlumno,
  pensionesTaller,
  planTaller,
  proyectosTaller,
  proyectoTesistas,
  tallerAsistencias,
  talleres,
  tallerSesiones,
  usuarios,
} from "@pis/db";
import {
  alcanzaFaltasParaRetiro,
  assertTransicionHito,
  assertTransicionTesista,
  DomainError,
  esAsistenciaBaja,
  esProgramaOficial,
  estadoHitoTrasRevision,
  evaluarAprobacionPlan,
  FICHA_SEMANAS,
  FORMATOS_ENTREGA,
  fail,
  ok,
  type ParametrosTaller,
  porcentajeAsistenciaCurso,
  puedeAjustarFechaHito,
  puedeHabilitarHito,
  puedeReabrirHito,
  puedeRevisarEntrega,
  puedeSubirEntrega,
  type RegistroAsistenciaCurso,
  type Result,
  type TipoHito,
  validarArchivo,
} from "@pis/domain";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import type { AlmacenamientoPort } from "../../../infra/storage/almacenamiento.port.js";
import { GenerarDocumentosUseCase } from "../../documentos/use-cases/generar-documentos/generar-documentos.use-case.js";
import { InscribirPlanUseCase } from "../../expedientes/use-cases/inscribir-plan/inscribir-plan.use-case.js";
import { ValidarInscripcionUseCase } from "../../expedientes/use-cases/validar-inscripcion/validar-inscripcion.use-case.js";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";
import { hoyLima } from "../sesiones/sesiones.repository.js";
import { appendAuditoriaTaller } from "../taller-auditoria.js";
import {
  avisar,
  correoAsesor,
  correosProyecto,
  correosSecretaria,
  correosTaller,
} from "../taller-avisos.js";
import { fichaCompletaDe, hitoConProyecto, nombreHito } from "./hitos.repository.js";

/**
 * P6/P6b/P7/D3 (spec v1.0): plan del taller, hitos por proyecto, versiones
 * (nunca se editan ni se borran) y aprobación del plan, que crea el
 * expediente de titulación. Cada cambio queda en el historial del taller.
 */

export interface Actor {
  id: string;
  dni: string;
}

const idActor = (a: Actor) => (a.id === "" ? null : a.id);
const noEncontrado = (m: string) => fail(new DomainError("NO_ENCONTRADO", m));

async function auditar(
  tx: DbExecutor,
  tallerId: string,
  actor: Actor,
  accion: string,
  detalle: string,
) {
  await appendAuditoriaTaller(tx, {
    tallerId,
    actorId: idActor(actor),
    actorDni: actor.dni,
    accion,
    detalle,
  });
}

async function codigoProyecto(tx: DbExecutor, proyectoId: string): Promise<string> {
  const [p] = await tx
    .select({ codigo: proyectosTaller.codigo })
    .from(proyectosTaller)
    .where(eq(proyectosTaller.id, proyectoId))
    .limit(1);
  return p?.codigo ?? "";
}

// ── Plan del taller (P6) ───────────────────────────────────────────────

export class EditarSemanaPlanUseCase {
  async execute(
    tallerId: string,
    semana: number,
    input: { contenido: string; indicaciones?: string | null | undefined },
    actor: Actor,
  ): Promise<Result<true, DomainError>> {
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const [f] = await tx
        .select()
        .from(planTaller)
        .where(and(eq(planTaller.tallerId, tallerId), eq(planTaller.semana, semana)))
        .limit(1);
      if (!f) return noEncontrado("Semana no encontrada");
      const contenido = input.contenido.trim();
      const indicaciones = input.indicaciones?.trim() || null;
      if (contenido === f.contenido && indicaciones === f.indicaciones) return ok(false);
      await tx
        .update(planTaller)
        .set({ contenido, indicaciones, updatedAt: new Date() })
        .where(and(eq(planTaller.tallerId, tallerId), eq(planTaller.semana, semana)));
      await auditar(tx, tallerId, actor, "EDITAR_PLAN", `Semana ${semana}`);
      return ok(true);
    });
    if (!r.ok) return r;
    if (r.value)
      await avisar(
        await correosTaller(db, tallerId),
        `Se actualizó la semana ${semana} del plan del taller`,
        `Tu asesor actualizó el contenido o las indicaciones de la semana ${semana}. Revísalo en Mi Taller.`,
        "/mi-taller",
        "Ver Mi Taller",
      );
    return ok(true);
  }
}

// ── Hitos (P6, P6b) ────────────────────────────────────────────────────

async function estadosDelProyecto(tx: DbExecutor, proyectoId: string) {
  const filas = await tx
    .select({ tipo: hitosProyecto.tipo, estado: hitosProyecto.estado })
    .from(hitosProyecto)
    .where(eq(hitosProyecto.proyectoId, proyectoId));
  return new Map(filas.map((f) => [f.tipo, f.estado]));
}

async function habilitarEn(
  tx: DbExecutor,
  hito: typeof hitosProyecto.$inferSelect,
  actor: Actor,
): Promise<Result<true, DomainError>> {
  const gate = puedeHabilitarHito(hito.tipo, await estadosDelProyecto(tx, hito.proyectoId));
  if (!gate.ok) return gate;
  await tx
    .update(hitosProyecto)
    .set({
      estado: "HABILITADO",
      habilitadoPor: idActor(actor),
      habilitadoAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(hitosProyecto.id, hito.id));
  return ok(true);
}

export class HabilitarHitoUseCase {
  async execute(hitoId: string, actor: Actor): Promise<Result<string, DomainError>> {
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const h = await hitoConProyecto(tx, hitoId);
      if (!h) return noEncontrado("Hito no encontrado");
      const paso = await habilitarEn(tx, h.hito, actor);
      if (!paso.ok) return paso;
      const codigo = await codigoProyecto(tx, h.hito.proyectoId);
      await auditar(
        tx,
        h.tallerId,
        actor,
        "HABILITAR_HITO",
        `${codigo}: ${nombreHito(h.hito.tipo)}`,
      );
      return ok({ proyectoId: h.hito.proyectoId, tipo: h.hito.tipo, fecha: h.hito.fechaLimite });
    });
    if (!r.ok) return r;
    await avisar(
      await correosProyecto(db, r.value.proyectoId),
      `Ya puedes entregar: ${nombreHito(r.value.tipo)}`,
      `Tu asesor habilitó la entrega de «${nombreHito(r.value.tipo)}». Fecha límite: ${r.value.fecha}.`,
      "/mi-taller",
      "Ir a Mi Taller",
    );
    return ok(r.value.proyectoId);
  }
}

/** P6 "Habilitar" una columna: en cada proyecto que ya puede recibirla. */
export class HabilitarHitoEnTallerUseCase {
  async execute(
    tallerId: string,
    tipo: TipoHito,
    actor: Actor,
  ): Promise<Result<number, DomainError>> {
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const hitos = await tx
        .select({ hito: hitosProyecto, codigo: proyectosTaller.codigo })
        .from(hitosProyecto)
        .innerJoin(proyectosTaller, eq(proyectosTaller.id, hitosProyecto.proyectoId))
        .where(
          and(
            eq(proyectosTaller.tallerId, tallerId),
            eq(hitosProyecto.tipo, tipo),
            eq(hitosProyecto.estado, "NO_HABILITADO"),
          ),
        );
      const habilitados: { proyectoId: string; codigo: string }[] = [];
      for (const h of hitos) {
        const paso = await habilitarEn(tx, h.hito, actor);
        if (paso.ok) habilitados.push({ proyectoId: h.hito.proyectoId, codigo: h.codigo });
      }
      if (habilitados.length === 0)
        return fail(
          new DomainError(
            "REQUISITO_PENDIENTE",
            "Ningún proyecto puede recibir este hito todavía (el anterior debe estar aprobado)",
          ),
        );
      await auditar(
        tx,
        tallerId,
        actor,
        "HABILITAR_HITO",
        `${nombreHito(tipo)} en ${habilitados.map((x) => x.codigo).join(", ")}`,
      );
      return ok(habilitados);
    });
    if (!r.ok) return r;
    for (const p of r.value)
      await avisar(
        await correosProyecto(db, p.proyectoId),
        `Ya puedes entregar: ${nombreHito(tipo)}`,
        `Tu asesor habilitó la entrega de «${nombreHito(tipo)}». Revisa la fecha límite en Mi Taller.`,
        "/mi-taller",
        "Ir a Mi Taller",
      );
    return ok(r.value.length);
  }
}

export class AjustarFechaHitoUseCase {
  async execute(
    hitoId: string,
    fechaLimite: string,
    actor: Actor,
    reabrir = false,
  ): Promise<Result<string, DomainError>> {
    const hoy = hoyLima();
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const h = await hitoConProyecto(tx, hitoId);
      if (!h) return noEncontrado("Hito no encontrado");
      const gate = reabrir
        ? puedeReabrirHito(h.hito.tipo, h.hito.estado, fechaLimite, hoy)
        : puedeAjustarFechaHito(h.hito.tipo);
      if (!gate.ok) return gate;
      if (!reabrir && (h.hito.estado === "APROBADO" || h.hito.estado === "NO_ENTREGADO"))
        return fail(
          new DomainError(
            "TRANSICION_INVALIDA",
            h.hito.estado === "APROBADO"
              ? "El hito ya está aprobado"
              : "El hito no fue entregado: usa «Habilitar nueva entrega»",
          ),
        );
      if (reabrir) {
        const paso = assertTransicionHito(h.hito.estado, "HABILITADO");
        if (!paso.ok) return paso;
      }
      await tx
        .update(hitosProyecto)
        .set({
          fechaLimite,
          ...(reabrir
            ? {
                estado: "HABILITADO" as const,
                habilitadoPor: idActor(actor),
                habilitadoAt: new Date(),
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(hitosProyecto.id, hitoId));
      const codigo = await codigoProyecto(tx, h.hito.proyectoId);
      await auditar(
        tx,
        h.tallerId,
        actor,
        reabrir ? "REABRIR_HITO" : "AJUSTAR_FECHA_HITO",
        `${codigo}: ${nombreHito(h.hito.tipo)} ${h.hito.fechaLimite} → ${fechaLimite}`,
      );
      return ok({ proyectoId: h.hito.proyectoId, tipo: h.hito.tipo });
    });
    if (!r.ok) return r;
    await avisar(
      await correosProyecto(db, r.value.proyectoId),
      reabrir
        ? `Nueva entrega habilitada: ${nombreHito(r.value.tipo)}`
        : `Nueva fecha límite: ${nombreHito(r.value.tipo)}`,
      `La fecha límite de «${nombreHito(r.value.tipo)}» ahora es ${fechaLimite}.`,
      "/mi-taller",
      "Ir a Mi Taller",
    );
    return ok(r.value.proyectoId);
  }
}

// ── Entregas (P7 subir, P6b revisar) ───────────────────────────────────

export interface ArchivoSubido {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

/** Firma real del archivo: %PDF-, OLE (.doc) o ZIP (.docx). */
function firmaValida(mime: string, bytes: Uint8Array): boolean {
  const b = bytes;
  if (mime === "application/pdf") return new TextDecoder().decode(b.subarray(0, 5)) === "%PDF-";
  if (mime === "application/msword") return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11;
  return b[0] === 0x50 && b[1] === 0x4b;
}

const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export class SubirEntregaUseCase {
  constructor(private readonly storage: AlmacenamientoPort) {}

  async execute(
    hitoId: string,
    archivo: ArchivoSubido,
    comentario: string | null,
    actor: Actor,
  ): Promise<Result<string, DomainError>> {
    const parametros = await leerParametrosTaller();
    const v = validarArchivo(
      { mime: archivo.mime, bytes: archivo.bytes.byteLength },
      FORMATOS_ENTREGA,
      parametros.maxMbEntrega,
    );
    if (!v.ok) return v;
    if (!firmaValida(archivo.mime, archivo.bytes))
      return fail(new DomainError("DOCUMENTO_INVALIDO", "El archivo no coincide con su formato"));
    const h0 = await hitoConProyecto(db, hitoId);
    if (!h0) return noEncontrado("Hito no encontrado");
    const guardado = await this.storage.save(
      h0.hito.proyectoId,
      `${h0.hito.tipo.toLowerCase()}-${randomUUID()}.${EXTENSION[archivo.mime] ?? "bin"}`,
      archivo.bytes,
      "entregas-taller",
    );
    const hoy = hoyLima();
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const [h] = await tx
        .select()
        .from(hitosProyecto)
        .where(eq(hitosProyecto.id, hitoId))
        .limit(1)
        .for("update");
      if (!h) return noEncontrado("Hito no encontrado");
      const [t] = await tx
        .select({ estado: proyectoTesistas.estado })
        .from(proyectoTesistas)
        .where(
          and(
            eq(proyectoTesistas.proyectoId, h.proyectoId),
            eq(proyectoTesistas.alumnoId, actor.id),
          ),
        )
        .limit(1);
      if (!t) return fail(new DomainError("FUERA_DE_ALCANCE", "El proyecto no es tuyo"));
      const gate = puedeSubirEntrega(
        {
          tipo: h.tipo,
          estado: h.estado,
          fechaLimite: h.fechaLimite,
          hoy,
          fichaCompletaYFirmada: await fichaCompletaDe(tx, h.proyectoId),
          tesistaRetirado: t.estado === "RETIRADO",
        },
        parametros,
      );
      if (!gate.ok) return gate;
      const [m] = await tx
        .select({ v: max(entregasHito.version) })
        .from(entregasHito)
        .where(eq(entregasHito.hitoId, hitoId));
      const version = Number(m?.v ?? 0) + 1;
      await tx.insert(entregasHito).values({
        hitoId,
        version,
        ruta: guardado.ruta,
        sha256: guardado.sha256,
        nombreOriginal:
          archivo.filename.trim().slice(0, 255) || `entrega.${EXTENSION[archivo.mime]}`,
        mime: archivo.mime,
        bytes: archivo.bytes.byteLength,
        comentario: comentario?.trim() || null,
        entregadaPor: actor.id,
      });
      if (h.estado !== "ENTREGADO") {
        const paso = assertTransicionHito(h.estado, "ENTREGADO");
        if (!paso.ok) return paso;
        await tx
          .update(hitosProyecto)
          .set({ estado: "ENTREGADO", updatedAt: new Date() })
          .where(eq(hitosProyecto.id, hitoId));
      }
      const [p] = await tx
        .select({ codigo: proyectosTaller.codigo, tallerId: proyectosTaller.tallerId })
        .from(proyectosTaller)
        .where(eq(proyectosTaller.id, h.proyectoId))
        .limit(1);
      await auditar(
        tx,
        p?.tallerId ?? h0.tallerId,
        actor,
        "SUBIR_ENTREGA",
        `${p?.codigo}: ${nombreHito(h.tipo)} v${version}`,
      );
      return ok({ proyectoId: h.proyectoId, tipo: h.tipo, version, codigo: p?.codigo ?? "" });
    });
    if (!r.ok) return r;
    const asesor = await correoAsesor(db, h0.tallerId);
    if (asesor)
      await avisar(
        [asesor],
        `${r.value.codigo}: nueva entrega de ${nombreHito(r.value.tipo)}`,
        `El proyecto ${r.value.codigo} subió la versión ${r.value.version} de «${nombreHito(r.value.tipo)}». Revísala en el seguimiento del taller.`,
        `/proyectos/${r.value.proyectoId}/entregas`,
        "Revisar entrega",
      );
    return ok(r.value.proyectoId);
  }
}

export class RevisarEntregaUseCase {
  async execute(
    entregaId: string,
    input: { resultado: "CONFORME" | "OBSERVADA"; observaciones?: string | null | undefined },
    actor: Actor,
  ): Promise<Result<string, DomainError>> {
    const hoy = hoyLima();
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const [e] = await tx
        .select()
        .from(entregasHito)
        .where(eq(entregasHito.id, entregaId))
        .limit(1)
        .for("update");
      if (!e) return noEncontrado("Entrega no encontrada");
      const [h] = await tx
        .select()
        .from(hitosProyecto)
        .where(eq(hitosProyecto.id, e.hitoId))
        .limit(1)
        .for("update");
      if (!h) return noEncontrado("Hito no encontrado");
      const [ultima] = await tx
        .select({ v: max(entregasHito.version) })
        .from(entregasHito)
        .where(eq(entregasHito.hitoId, h.id));
      const gate = puedeRevisarEntrega(
        { estado: e.estado, esUltima: Number(ultima?.v ?? 0) === e.version },
        input.resultado,
        input.observaciones,
      );
      if (!gate.ok) return gate;
      const observaciones = input.observaciones?.trim() || null;
      const ahora = new Date();
      await tx
        .update(entregasHito)
        .set({
          estado: input.resultado,
          observaciones,
          revisadaPor: idActor(actor),
          revisadaAt: ahora,
        })
        .where(eq(entregasHito.id, entregaId));
      const nuevo = estadoHitoTrasRevision(h.tipo, input.resultado);
      if (nuevo !== h.estado) {
        const paso = assertTransicionHito(h.estado, nuevo);
        if (!paso.ok) return paso;
        await tx
          .update(hitosProyecto)
          .set({
            estado: nuevo,
            ...(nuevo === "APROBADO" ? { aprobadoPor: idActor(actor), aprobadoAt: ahora } : {}),
            updatedAt: ahora,
          })
          .where(eq(hitosProyecto.id, h.id));
      }
      // La revisión del avance alimenta la Ficha de Control (§9 P11).
      const semanaFicha = FICHA_SEMANAS.find((f) => f.semana === h.semana);
      if (semanaFicha)
        await tx
          .update(fichaRegistros)
          .set({
            fecha: hoy,
            estado: "REVISADO",
            observacionesAcuerdos: observaciones ?? `Versión ${e.version} revisada: conforme.`,
            revisadoPor: idActor(actor),
            updatedAt: ahora,
          })
          .where(
            and(
              eq(fichaRegistros.proyectoId, h.proyectoId),
              eq(fichaRegistros.semana, h.semana),
              eq(fichaRegistros.estado, "SIN_REVISION"),
            ),
          );
      const [p] = await tx
        .select({ codigo: proyectosTaller.codigo, tallerId: proyectosTaller.tallerId })
        .from(proyectosTaller)
        .where(eq(proyectosTaller.id, h.proyectoId))
        .limit(1);
      await auditar(
        tx,
        p?.tallerId ?? "",
        actor,
        "REVISAR_ENTREGA",
        `${p?.codigo}: ${nombreHito(h.tipo)} v${e.version} ${input.resultado}`,
      );
      return ok({ proyectoId: h.proyectoId, tipo: h.tipo, version: e.version });
    });
    if (!r.ok) return r;
    const { proyectoId, tipo, version } = r.value;
    await avisar(
      await correosProyecto(db, proyectoId),
      input.resultado === "OBSERVADA"
        ? `Tu entrega de ${nombreHito(tipo)} tiene observaciones`
        : `Tu entrega de ${nombreHito(tipo)} fue revisada: conforme`,
      input.resultado === "OBSERVADA"
        ? `Tu asesor observó la versión ${version}. Lee las observaciones y sube una nueva versión antes de la fecha límite.`
        : tipo === "PLAN"
          ? `Tu asesor dio conformidad a la versión ${version} de tu plan. Falta la aprobación del plan, que crea tu expediente de titulación.`
          : `Tu asesor dio conformidad a la versión ${version}.`,
      "/mi-taller",
      "Ver Mi Taller",
    );
    return ok(proyectoId);
  }
}

// ── Aprobar plan (D3) ──────────────────────────────────────────────────

interface ContextoD3 {
  proyecto: typeof proyectosTaller.$inferSelect;
  tallerId: string;
  asesorId: string | null;
  asesorDni: string | null;
  asesorNombre: string | null;
  tesistas: Array<{
    id: string;
    alumnoId: string;
    estado: "EN_TALLER" | "PLAN_APROBADO" | "ASESORIA_CERRADA" | "RETIRADO";
    dni: string;
    nombres: string;
    apellidos: string;
    email: string;
    cui: string | null;
    telefono: string | null;
  }>;
  advertencias: string[];
  motivo: string | null;
  versionAprobada: number | null;
}

async function contextoD3(
  tx: DbExecutor,
  proyectoId: string,
  parametros: ParametrosTaller,
): Promise<ContextoD3 | null> {
  const [p] = await tx
    .select({ proyecto: proyectosTaller, asesorId: talleres.asesorId })
    .from(proyectosTaller)
    .innerJoin(talleres, eq(talleres.id, proyectosTaller.tallerId))
    .where(eq(proyectosTaller.id, proyectoId))
    .limit(1);
  if (!p) return null;
  const [asesor] = p.asesorId
    ? await tx
        .select({ dni: usuarios.dni, nombres: usuarios.nombres, apellidos: usuarios.apellidos })
        .from(usuarios)
        .where(eq(usuarios.id, p.asesorId))
        .limit(1)
    : [];
  const tesistas = await tx
    .select({
      id: proyectoTesistas.id,
      alumnoId: proyectoTesistas.alumnoId,
      estado: proyectoTesistas.estado,
      dni: usuarios.dni,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
      email: usuarios.email,
      cui: usuarios.cui,
      telefono: usuarios.telefono,
    })
    .from(proyectoTesistas)
    .innerJoin(usuarios, eq(usuarios.id, proyectoTesistas.alumnoId))
    .where(eq(proyectoTesistas.proyectoId, proyectoId))
    .orderBy(asc(proyectoTesistas.orden));
  const activos = tesistas.filter((t) => t.estado !== "RETIRADO");

  const [hito] = await tx
    .select()
    .from(hitosProyecto)
    .where(and(eq(hitosProyecto.proyectoId, proyectoId), eq(hitosProyecto.tipo, "PLAN")))
    .limit(1);
  const versiones = hito
    ? await tx
        .select({ version: entregasHito.version, estado: entregasHito.estado })
        .from(entregasHito)
        .where(eq(entregasHito.hitoId, hito.id))
    : [];
  versiones.sort((a, b) => b.version - a.version);
  const ultima = versiones[0] ?? null;

  // Advertencias (§10 D3): faltas consecutivas, asistencia baja y pensión vencida.
  const ids = activos.map((t) => t.alumnoId);
  const sesiones = await tx
    .select({ id: tallerSesiones.id, fecha: tallerSesiones.fecha, nro: tallerSesiones.nro })
    .from(tallerSesiones)
    .where(
      and(eq(tallerSesiones.tallerId, p.proyecto.tallerId), eq(tallerSesiones.estado, "REALIZADA")),
    )
    .orderBy(asc(tallerSesiones.fecha), asc(tallerSesiones.nro));
  const marcas =
    ids.length && sesiones.length
      ? await tx
          .select({
            sesionId: tallerAsistencias.sesionId,
            usuarioId: tallerAsistencias.usuarioId,
            estado: tallerAsistencias.estado,
          })
          .from(tallerAsistencias)
          .where(
            and(
              inArray(tallerAsistencias.usuarioId, ids),
              inArray(
                tallerAsistencias.sesionId,
                sesiones.map((s) => s.id),
              ),
            ),
          )
      : [];
  let faltas = false;
  let baja = false;
  for (const t of activos) {
    const registros: RegistroAsistenciaCurso[] = sesiones.map((s) => ({
      sesion: "REALIZADA",
      marca: marcas.find((m) => m.sesionId === s.id && m.usuarioId === t.alumnoId)?.estado ?? null,
    }));
    if (alcanzaFaltasParaRetiro(registros, parametros)) faltas = true;
    if (esAsistenciaBaja(porcentajeAsistenciaCurso(registros, parametros), parametros)) baja = true;
  }
  const vencidas =
    ids.length === 0
      ? []
      : await tx
          .select({ id: pensionesAlumno.id })
          .from(pensionesAlumno)
          .innerJoin(pensionesTaller, eq(pensionesTaller.id, pensionesAlumno.pensionTallerId))
          .where(
            and(
              eq(pensionesTaller.tallerId, p.proyecto.tallerId),
              inArray(pensionesAlumno.alumnoId, ids),
              eq(pensionesAlumno.estado, "VENCIDA"),
            ),
          )
          .limit(1);

  const ev = evaluarAprobacionPlan(
    {
      estadoHitoPlan: hito?.estado ?? "NO_HABILITADO",
      ultimaVersion: ultima?.estado ?? null,
      tieneExpediente: p.proyecto.expedienteId !== null,
      faltasConsecutivas: faltas,
      asistenciaBaja: baja,
      pensionVencida: vencidas.length > 0,
    },
    parametros,
  );
  const advertencias = [
    ...(faltas ? ["Tiene faltas consecutivas"] : []),
    ...(baja ? ["Tiene asistencia baja"] : []),
    ...(vencidas.length > 0 ? ["Tiene una pensión vencida"] : []),
  ];
  let motivo = ev.ok ? null : ev.error.message;
  if (!motivo && activos.length === 0) motivo = "El proyecto no tiene tesistas activos";
  return {
    proyecto: p.proyecto,
    tallerId: p.proyecto.tallerId,
    asesorId: p.asesorId,
    asesorDni: asesor?.dni ?? null,
    asesorNombre: asesor ? `${asesor.nombres} ${asesor.apellidos}` : null,
    tesistas: activos,
    advertencias,
    motivo,
    versionAprobada: ultima?.version ?? null,
  };
}

export async function previaAprobacion(proyectoId: string): Promise<PreviaAprobacionDTO | null> {
  const parametros = await leerParametrosTaller();
  const c = await contextoD3(db, proyectoId, parametros);
  if (!c) return null;
  return {
    puede: c.motivo === null,
    motivo: c.motivo,
    advertencias: c.advertencias,
    bloquean: parametros.advertenciasPlanBloquean,
    titulo: c.proyecto.titulo,
    programa: c.proyecto.programa,
    modalidad: c.proyecto.modalidad,
    asesor: c.asesorNombre,
    tesistas: c.tesistas.map((t) => ({ dni: t.dni, nombre: `${t.nombres} ${t.apellidos}` })),
    versionAprobada: c.versionAprobada,
  };
}

export class AprobarPlanUseCase {
  constructor(
    private readonly inscribir = new InscribirPlanUseCase(),
    private readonly validar = new ValidarInscripcionUseCase(),
    private readonly generar = new GenerarDocumentosUseCase(),
  ) {}

  async execute(
    proyectoId: string,
    input: AprobarPlanInput,
    actor: Actor,
  ): Promise<Result<{ proyectoId: string; avisos: string[] }, DomainError>> {
    if (!esProgramaOficial(input.programa))
      return fail(new DomainError("VALIDACION_FALLIDA", "Elige uno de los programas oficiales"));
    const parametros = await leerParametrosTaller();
    const c = await contextoD3(db, proyectoId, parametros);
    if (!c) return noEncontrado("Proyecto no encontrado");
    if (c.proyecto.expedienteId)
      return fail(new DomainError("TRANSICION_INVALIDA", "El plan ya fue aprobado"));
    if (c.motivo) return fail(new DomainError("REQUISITO_PENDIENTE", c.motivo));
    const [t1, t2] = c.tesistas;
    if (!t1) return fail(new DomainError("REQUISITO_PENDIENTE", "Sin tesistas activos"));
    const participante = (t: NonNullable<typeof t1>) => ({
      nombres: t.nombres,
      apellidos: t.apellidos,
      dni: t.dni,
      email: t.email,
      ...(t.cui ? { cui: t.cui } : {}),
      ...(t.telefono ? { telefono: t.telefono } : {}),
    });

    // 1) Expediente de titulación (Etapa 1) con el flujo existente.
    const exp = await this.inscribir.execute(
      {
        modalidad: input.modalidad,
        programa: input.programa,
        titulo: input.titulo.trim(),
        participante1: participante(t1),
        ...(t2 ? { participante2: participante(t2) } : {}),
        ...(c.asesorDni && /^\d{8}$/.test(c.asesorDni) ? { asesorDni: c.asesorDni } : {}),
      },
      actor,
    );
    if (!exp.ok) return exp;

    // 2) Taller: hito APROBADO, ficha semana 2, tesistas PLAN_APROBADO y vínculo al expediente.
    const hoy = hoyLima();
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const [p] = await tx
        .select({ expedienteId: proyectosTaller.expedienteId })
        .from(proyectosTaller)
        .where(eq(proyectosTaller.id, proyectoId))
        .limit(1)
        .for("update");
      if (p?.expedienteId)
        return fail(new DomainError("TRANSICION_INVALIDA", "El plan ya fue aprobado"));
      const ahora = new Date();
      await tx
        .update(proyectosTaller)
        .set({
          expedienteId: exp.value.id,
          titulo: input.titulo.trim(),
          programa: input.programa,
          modalidad: input.modalidad,
          updatedAt: ahora,
        })
        .where(eq(proyectosTaller.id, proyectoId));
      const [h] = await tx
        .select()
        .from(hitosProyecto)
        .where(and(eq(hitosProyecto.proyectoId, proyectoId), eq(hitosProyecto.tipo, "PLAN")))
        .limit(1);
      if (h) {
        const paso = assertTransicionHito(h.estado, "APROBADO");
        if (!paso.ok) return paso;
        await tx
          .update(hitosProyecto)
          .set({
            estado: "APROBADO",
            aprobadoPor: idActor(actor),
            aprobadoAt: ahora,
            updatedAt: ahora,
          })
          .where(eq(hitosProyecto.id, h.id));
        // La última versión queda CONFORME si aún no se había revisado.
        await tx
          .update(entregasHito)
          .set({ estado: "CONFORME", revisadaPor: idActor(actor), revisadaAt: ahora })
          .where(and(eq(entregasHito.hitoId, h.id), eq(entregasHito.estado, "ENTREGADA")));
      }
      await tx
        .update(fichaRegistros)
        .set({
          fecha: hoy,
          estado: "REVISADO",
          observacionesAcuerdos: `Plan de tesis aprobado. Expediente ${exp.value.codigo}.`,
          revisadoPor: idActor(actor),
          updatedAt: ahora,
        })
        .where(
          and(
            eq(fichaRegistros.proyectoId, proyectoId),
            eq(fichaRegistros.semana, 2),
            eq(fichaRegistros.estado, "SIN_REVISION"),
          ),
        );
      for (const t of c.tesistas) {
        if (t.estado !== "EN_TALLER") continue;
        const paso = assertTransicionTesista(t.estado, "PLAN_APROBADO");
        if (!paso.ok) return paso;
        await tx
          .update(proyectoTesistas)
          .set({ estado: "PLAN_APROBADO", updatedAt: ahora })
          .where(eq(proyectoTesistas.id, t.id));
      }
      await auditar(
        tx,
        c.tallerId,
        actor,
        "APROBAR_PLAN",
        `${c.proyecto.codigo}: expediente ${exp.value.codigo}${
          c.advertencias.length ? ` (advertencias: ${c.advertencias.join(", ")})` : ""
        }`,
      );
      return ok(true);
    });
    if (!r.ok) return r;

    // 3) Validación de la inscripción (EN_PLAN) y Anexo 18 (E1). Si fallan,
    // el expediente ya existe y el área lo completa desde Titulación.
    const avisos: string[] = [];
    const val = await this.validar.execute(exp.value.id, actor);
    if (!val.ok) avisos.push(`No se pudo validar la inscripción: ${val.error.message}`);
    else {
      const docs = await this.generar.execute(exp.value.id, "E1", actor);
      if (!docs.ok) avisos.push(`No se generaron los documentos: ${docs.error.message}`);
    }

    await avisar(
      c.tesistas.map((t) => t.email),
      "Tu plan de tesis fue aprobado",
      `Tu asesor aprobó tu plan de tesis. Se creó tu expediente de titulación ${exp.value.codigo} (Etapa 1). Desde ahora sigues en el taller con los avances.`,
      "/mi-taller",
      "Ver Mi Taller",
    );
    await avisar(
      await correosSecretaria(),
      `${c.proyecto.codigo}: plan aprobado (expediente ${exp.value.codigo})`,
      `Se aprobó el plan del proyecto ${c.proyecto.codigo} y se creó el expediente ${exp.value.codigo}.`,
      `/taller/${c.tallerId}`,
      "Ver taller",
    );
    return ok({ proyectoId, avisos });
  }
}
