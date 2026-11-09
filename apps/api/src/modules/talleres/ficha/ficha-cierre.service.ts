import { randomUUID } from "node:crypto";
import type {
  CierreAsesoriaDTO,
  DatosCierreInput,
  FichaDTO,
  RegistrarFichaInput,
} from "@pis/contracts";
import {
  cierresAsesoria,
  type DbExecutor,
  db,
  documentos,
  entregasHito,
  expedientes,
  fichaFirmas,
  fichaRegistros,
  hitosProyecto,
  proyectosTaller,
  proyectoTesistas,
  talleres,
  usuarios,
} from "@pis/db";
import {
  assertTransicionFicha,
  assertTransicionTesista,
  type DocumentoRenderizado,
  DomainError,
  type EstadoTesistaTaller,
  fail,
  ok,
  puedeEmitirConformidad,
  type Result,
  resumenFicha,
  type Segmento,
  validarArchivo,
  validarRegistroFicha,
  validarSimilitudPreliminar,
} from "@pis/domain";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import { renderizarPdf } from "../../../infra/pdf/render-documento.js";
import type { AlmacenamientoPort } from "../../../infra/storage/almacenamiento.port.js";
import { appendAuditoria } from "../../expedientes/expedientes.auditoria.js";
import { appendAuditoriaTaller } from "../taller-auditoria.js";
import { avisar, correosProyecto, correosSecretaria } from "../taller-avisos.js";

/**
 * P11 Ficha de Control (Anexo 1) y P13 Cierre de asesoría (Anexo 21).
 * - Registrar una revisión deja la fila REVISADO; modificar una firmada
 *   exige motivo y reinicia la firma (vuelve a REVISADO).
 * - Subir la ficha firmada (PDF) marca FIRMADO las filas que cubre.
 * - El informe de conformidad se emite con borrador final, ficha completa y
 *   firmada y observaciones levantadas; subirlo firmado cierra la asesoría.
 */

export interface Actor {
  id: string;
  dni: string;
}

const idActor = (a: Actor) => (a.id === "" ? null : a.id);
const MAX_MB_FIRMADO = 10;

interface Cabecera {
  id: string;
  codigo: string;
  titulo: string | null;
  programa: string | null;
  tallerId: string;
  taller: string;
  asesor: string | null;
  expedienteCodigo: string | null;
  tesistas: Array<{
    id: string;
    alumnoId: string;
    nombre: string;
    dni: string;
    estado: EstadoTesistaTaller;
  }>;
}

async function cabecera(tx: DbExecutor, proyectoId: string): Promise<Cabecera | null> {
  const asesor = alias(usuarios, "asesor");
  const [p] = await tx
    .select({
      id: proyectosTaller.id,
      codigo: proyectosTaller.codigo,
      titulo: proyectosTaller.titulo,
      programa: proyectosTaller.programa,
      tallerId: talleres.id,
      taller: talleres.nombre,
      asesorNombres: asesor.nombres,
      asesorApellidos: asesor.apellidos,
      grado: asesor.grado,
      expedienteCodigo: expedientes.codigo,
    })
    .from(proyectosTaller)
    .innerJoin(talleres, eq(talleres.id, proyectosTaller.tallerId))
    .leftJoin(asesor, eq(asesor.id, talleres.asesorId))
    .leftJoin(expedientes, eq(expedientes.id, proyectosTaller.expedienteId))
    .where(eq(proyectosTaller.id, proyectoId))
    .limit(1);
  if (!p) return null;
  const tesistas = await tx
    .select({
      id: proyectoTesistas.id,
      alumnoId: proyectoTesistas.alumnoId,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
      dni: usuarios.dni,
      estado: proyectoTesistas.estado,
    })
    .from(proyectoTesistas)
    .innerJoin(usuarios, eq(usuarios.id, proyectoTesistas.alumnoId))
    .where(eq(proyectoTesistas.proyectoId, proyectoId))
    .orderBy(asc(proyectoTesistas.orden));
  return {
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo,
    programa: p.programa,
    tallerId: p.tallerId,
    taller: p.taller,
    asesor: p.asesorNombres
      ? `${p.grado ? `${p.grado} ` : ""}${p.asesorNombres} ${p.asesorApellidos}`
      : null,
    expedienteCodigo: p.expedienteCodigo,
    tesistas: tesistas.map((t) => ({
      id: t.id,
      alumnoId: t.alumnoId,
      nombre: `${t.nombres} ${t.apellidos}`,
      dni: t.dni,
      estado: t.estado,
    })),
  };
}

// ── Ficha (P11) ────────────────────────────────────────────────────────

export async function fichaDeProyecto(
  tx: DbExecutor,
  proyectoId: string,
  puedeEditar: boolean,
): Promise<FichaDTO | null> {
  const c = await cabecera(tx, proyectoId);
  if (!c) return null;
  const filas = await tx
    .select()
    .from(fichaRegistros)
    .where(eq(fichaRegistros.proyectoId, proyectoId))
    .orderBy(asc(fichaRegistros.semana));
  const firmas = await tx
    .select()
    .from(fichaFirmas)
    .where(eq(fichaFirmas.proyectoId, proyectoId))
    .orderBy(desc(fichaFirmas.createdAt));
  return {
    proyecto: {
      id: c.id,
      codigo: c.codigo,
      titulo: c.titulo,
      taller: c.taller,
      asesor: c.asesor,
      tesistas: c.tesistas.map((t) => t.nombre),
    },
    filas: filas.map((f) => ({
      id: f.id,
      semana: f.semana,
      fecha: f.fecha,
      avanceRevisado: f.avanceRevisado,
      observacionesAcuerdos: f.observacionesAcuerdos,
      estado: f.estado,
      firmaId: f.firmaId,
    })),
    resumen: resumenFicha(filas),
    firmas: firmas.map((x) => ({
      id: x.id,
      nombreArchivo: x.nombreOriginal,
      subidoAt: x.createdAt.toISOString(),
      semanas: filas.filter((f) => f.firmaId === x.id).map((f) => f.semana),
    })),
    puedeEditar,
  };
}

export async function proyectoDeFila(filaId: string): Promise<string | null> {
  const [f] = await db
    .select({ proyectoId: fichaRegistros.proyectoId })
    .from(fichaRegistros)
    .where(eq(fichaRegistros.id, filaId))
    .limit(1);
  return f?.proyectoId ?? null;
}

export class RegistrarFichaUseCase {
  async execute(
    filaId: string,
    input: RegistrarFichaInput,
    actor: Actor,
  ): Promise<Result<string, DomainError>> {
    return new DrizzleUnitOfWork(db).run(async (tx) => {
      const [f] = await tx
        .select()
        .from(fichaRegistros)
        .where(eq(fichaRegistros.id, filaId))
        .limit(1)
        .for("update");
      if (!f) return fail(new DomainError("NO_ENCONTRADO", "Registro no encontrado"));
      const v = validarRegistroFicha(f.semana, input.observacionesAcuerdos, f.estado, input.motivo);
      if (!v.ok) return v;
      if (f.estado === "SIN_REVISION" || f.estado === "FIRMADO") {
        const paso = assertTransicionFicha(f.estado, "REVISADO");
        if (!paso.ok) return paso;
      }
      await tx
        .update(fichaRegistros)
        .set({
          fecha: input.fecha,
          observacionesAcuerdos: input.observacionesAcuerdos.trim(),
          estado: "REVISADO",
          firmaId: null,
          revisadoPor: idActor(actor),
          updatedAt: new Date(),
        })
        .where(eq(fichaRegistros.id, filaId));
      const c = await cabecera(tx, f.proyectoId);
      await appendAuditoriaTaller(tx, {
        tallerId: c?.tallerId ?? "",
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: f.estado === "FIRMADO" ? "MODIFICAR_FICHA_FIRMADA" : "REGISTRAR_FICHA",
        detalle: `${c?.codigo}: semana ${f.semana}${f.estado === "FIRMADO" ? ` (motivo: ${input.motivo?.trim()})` : ""}`,
      });
      return ok(f.proyectoId);
    });
  }
}

const seg = (texto: string): Segmento[] => [{ texto, pendiente: false }];
const pendiente = (texto: string): Segmento[] => [{ texto, pendiente: true }];

function fechaTexto(d: Date): string {
  return d.toLocaleDateString("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Anexo 1: Ficha de Control de Asesoría (PDF para firmar). */
export async function pdfFicha(proyectoId: string, ahora = new Date()): Promise<Uint8Array | null> {
  const f = await fichaDeProyecto(db, proyectoId, false);
  const c = await cabecera(db, proyectoId);
  if (!f || !c) return null;
  const doc: DocumentoRenderizado = {
    tipo: "ANEXO_1",
    nombre: "Ficha de Control de Asesoría",
    estilo: "carta",
    titulo: seg("ANEXO 1 — FICHA DE CONTROL DE ASESORÍA"),
    parrafos: [
      seg(`Taller: ${c.taller}. Proyecto: ${c.codigo}.`),
      c.titulo ? seg(`Título: ${c.titulo}`) : pendiente("Título: <<TITULO>>"),
      seg(
        `Tesista(s): ${c.tesistas
          .filter((t) => t.estado !== "RETIRADO")
          .map((t) => `${t.nombre} (DNI ${t.dni})`)
          .join("; ")}.`,
      ),
      seg(`Asesor: ${c.asesor ?? "—"}.`),
      seg(`Registros: ${f.resumen.contador} · firmados: ${f.resumen.firmados}.`),
    ],
    tabla: {
      columnas: [
        { titulo: "Sem.", peso: 0.6 },
        { titulo: "Fecha", peso: 1.3 },
        { titulo: "Avance revisado", peso: 1.6 },
        { titulo: "Observaciones y acuerdos", peso: 3.6 },
        { titulo: "Firma asesor", peso: 1.3 },
        { titulo: "Firma tesista", peso: 1.3 },
      ],
      filas: f.filas.map((r) => {
        const sin = r.estado === "SIN_REVISION";
        return [
          { texto: String(r.semana) },
          { texto: r.fecha ?? "", pendiente: sin },
          { texto: r.avanceRevisado },
          { texto: sin ? "Sin revisión" : (r.observacionesAcuerdos ?? ""), pendiente: sin },
          { texto: r.estado === "FIRMADO" ? "Firmado" : " " },
          { texto: r.estado === "FIRMADO" ? "Firmado" : " " },
        ];
      }),
    },
    firmas: [
      seg(c.asesor ?? "Asesor"),
      ...c.tesistas.filter((t) => t.estado !== "RETIRADO").map((t) => seg(t.nombre)),
    ],
    pendientes: [],
  };
  return renderizarPdf(doc, {
    codigo: c.codigo,
    referencia: `${c.taller} · Proyecto`,
    versionPlantilla: "taller-v1",
    generadoEn: ahora,
  });
}

export interface ArchivoSubido {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

function esPdf(a: ArchivoSubido): Result<true, DomainError> {
  const v = validarArchivo(
    { mime: a.mime, bytes: a.bytes.byteLength },
    ["application/pdf"],
    MAX_MB_FIRMADO,
  );
  if (!v.ok) return v;
  if (new TextDecoder().decode(a.bytes.subarray(0, 5)) !== "%PDF-")
    return fail(new DomainError("DOCUMENTO_INVALIDO", "El archivo no es un PDF válido"));
  return ok(true);
}

export class SubirFichaFirmadaUseCase {
  constructor(private readonly storage: AlmacenamientoPort) {}

  async execute(
    proyectoId: string,
    semanas: number[],
    archivo: ArchivoSubido,
    actor: Actor,
  ): Promise<Result<string, DomainError>> {
    const v = esPdf(archivo);
    if (!v.ok) return v;
    if (semanas.length === 0)
      return fail(
        new DomainError("VALIDACION_FALLIDA", "Marca qué registros cubre la ficha firmada"),
      );
    const guardado = await this.storage.save(
      proyectoId,
      `ficha-firmada-${randomUUID()}.pdf`,
      archivo.bytes,
      "ficha",
    );
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const filas = await tx
        .select()
        .from(fichaRegistros)
        .where(
          and(eq(fichaRegistros.proyectoId, proyectoId), inArray(fichaRegistros.semana, semanas)),
        )
        .for("update");
      if (filas.length !== new Set(semanas).size)
        return fail(new DomainError("VALIDACION_FALLIDA", "Alguna semana no es de la ficha"));
      for (const f of filas) {
        if (f.estado !== "REVISADO")
          return fail(
            new DomainError(
              "REQUISITO_PENDIENTE",
              f.estado === "FIRMADO"
                ? `La semana ${f.semana} ya está firmada`
                : `Registra primero la revisión de la semana ${f.semana}`,
            ),
          );
      }
      const [firma] = await tx
        .insert(fichaFirmas)
        .values({
          proyectoId,
          ruta: guardado.ruta,
          sha256: guardado.sha256,
          nombreOriginal: archivo.filename.trim().slice(0, 255) || "ficha-firmada.pdf",
          mime: archivo.mime,
          bytes: archivo.bytes.byteLength,
          creadoPor: idActor(actor),
        })
        .returning({ id: fichaFirmas.id });
      if (!firma) return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo guardar la ficha"));
      await tx
        .update(fichaRegistros)
        .set({ estado: "FIRMADO", firmaId: firma.id, updatedAt: new Date() })
        .where(
          and(eq(fichaRegistros.proyectoId, proyectoId), inArray(fichaRegistros.semana, semanas)),
        );
      const c = await cabecera(tx, proyectoId);
      await appendAuditoriaTaller(tx, {
        tallerId: c?.tallerId ?? "",
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: "SUBIR_FICHA_FIRMADA",
        detalle: `${c?.codigo}: semanas ${[...semanas].sort((a, b) => a - b).join(", ")}`,
      });
      return ok(proyectoId);
    });
    return r;
  }
}

export async function rutaFirma(
  firmaId: string,
): Promise<{ proyectoId: string; ruta: string; nombre: string } | null> {
  const [f] = await db
    .select({
      proyectoId: fichaFirmas.proyectoId,
      ruta: fichaFirmas.ruta,
      nombre: fichaFirmas.nombreOriginal,
    })
    .from(fichaFirmas)
    .where(eq(fichaFirmas.id, firmaId))
    .limit(1);
  return f ?? null;
}

// ── Cierre (P13) ───────────────────────────────────────────────────────

async function tieneBorradorFinal(tx: DbExecutor, proyectoId: string): Promise<boolean> {
  const [h] = await tx
    .select({ id: hitosProyecto.id, estado: hitosProyecto.estado })
    .from(hitosProyecto)
    .where(and(eq(hitosProyecto.proyectoId, proyectoId), eq(hitosProyecto.tipo, "BORRADOR_FINAL")))
    .limit(1);
  if (!h || (h.estado !== "ENTREGADO" && h.estado !== "APROBADO")) return false;
  const [v] = await tx
    .select({ id: entregasHito.id })
    .from(entregasHito)
    .where(eq(entregasHito.hitoId, h.id))
    .limit(1);
  return v !== undefined;
}

export async function cierreDeProyecto(
  tx: DbExecutor,
  proyectoId: string,
  puedeGestionar: boolean,
): Promise<CierreAsesoriaDTO | null> {
  const c = await cabecera(tx, proyectoId);
  if (!c) return null;
  const [k] = await tx
    .select()
    .from(cierresAsesoria)
    .where(eq(cierresAsesoria.proyectoId, proyectoId))
    .limit(1);
  const filas = await tx
    .select({ semana: fichaRegistros.semana, estado: fichaRegistros.estado })
    .from(fichaRegistros)
    .where(eq(fichaRegistros.proyectoId, proyectoId));
  const fichaCompleta = resumenFicha(filas).completa;
  const borradorFinal = await tieneBorradorFinal(tx, proyectoId);
  const levantadas = k?.observacionesLevantadas ?? false;
  const similitud =
    k?.similitudPreliminar === null || k?.similitudPreliminar === undefined
      ? null
      : Number(k.similitudPreliminar);
  const gate = puedeEmitirConformidad({
    tieneBorradorFinal: borradorFinal,
    fichaCompletaYFirmada: fichaCompleta,
    observacionesLevantadas: levantadas,
  });
  return {
    proyectoId,
    codigo: c.codigo,
    titulo: c.titulo,
    similitudPreliminar: similitud,
    observacionesLevantadas: levantadas,
    informeGeneradoAt: k?.informeGeneradoAt ? k.informeGeneradoAt.toISOString() : null,
    informeFirmado: Boolean(k?.informeFirmadoRuta),
    cerradoAt: k?.cerradoAt ? k.cerradoAt.toISOString() : null,
    requisitos: {
      borradorFinal,
      fichaCompleta,
      observacionesLevantadas: levantadas,
      similitud: similitud !== null,
    },
    motivoNoEmitir: !gate.ok
      ? gate.error.message
      : similitud === null
        ? "Registra la similitud preliminar"
        : null,
    expedienteCodigo: c.expedienteCodigo,
    puedeGestionar,
  };
}

export class GuardarDatosCierreUseCase {
  async execute(
    proyectoId: string,
    input: DatosCierreInput,
    actor: Actor,
  ): Promise<Result<true, DomainError>> {
    let similitud: string | null | undefined;
    if (input.similitudPreliminar !== undefined && input.similitudPreliminar !== null) {
      const v = validarSimilitudPreliminar(input.similitudPreliminar);
      if (!v.ok) return v;
      similitud = v.value.toFixed(2);
    } else if (input.similitudPreliminar === null) similitud = null;
    return new DrizzleUnitOfWork(db).run(async (tx) => {
      const [k] = await tx
        .select()
        .from(cierresAsesoria)
        .where(eq(cierresAsesoria.proyectoId, proyectoId))
        .limit(1);
      if (k?.cerradoAt)
        return fail(new DomainError("TRANSICION_INVALIDA", "La asesoría ya está cerrada"));
      const valores = {
        ...(similitud !== undefined ? { similitudPreliminar: similitud } : {}),
        ...(input.observacionesLevantadas !== undefined
          ? { observacionesLevantadas: input.observacionesLevantadas }
          : {}),
      };
      if (k)
        await tx
          .update(cierresAsesoria)
          .set({ ...valores, updatedAt: new Date() })
          .where(eq(cierresAsesoria.proyectoId, proyectoId));
      else
        await tx
          .insert(cierresAsesoria)
          .values({ proyectoId, ...valores, creadoPor: idActor(actor) });
      const c = await cabecera(tx, proyectoId);
      await appendAuditoriaTaller(tx, {
        tallerId: c?.tallerId ?? "",
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: "DATOS_CIERRE",
        detalle: `${c?.codigo}: similitud ${similitud ?? "—"} %, observaciones levantadas ${(input.observacionesLevantadas ?? k?.observacionesLevantadas ?? false) ? "sí" : "no"}`,
      });
      return ok(true);
    });
  }
}

/** Anexo 21: Informe de Conformidad del asesor. */
export async function emitirInforme(
  proyectoId: string,
  actor: Actor,
  ahora = new Date(),
): Promise<Result<Uint8Array, DomainError>> {
  const k = await cierreDeProyecto(db, proyectoId, true);
  const c = await cabecera(db, proyectoId);
  if (!k || !c) return fail(new DomainError("NO_ENCONTRADO", "Proyecto no encontrado"));
  if (k.motivoNoEmitir) return fail(new DomainError("REQUISITO_PENDIENTE", k.motivoNoEmitir));
  const tesistas = c.tesistas.filter((t) => t.estado !== "RETIRADO");
  const doc: DocumentoRenderizado = {
    tipo: "ANEXO_21",
    nombre: "Informe de Conformidad",
    estilo: "carta",
    titulo: seg("ANEXO 21 — INFORME DE CONFORMIDAD DEL ASESOR"),
    parrafos: [
      seg(`Arequipa, ${fechaTexto(ahora)}.`),
      seg(
        "Señor(a) Director(a) de la Unidad de Segunda Especialidad de la Facultad de Ingeniería de Producción y Servicios:",
      ),
      seg(
        `Quien suscribe, ${c.asesor ?? "el asesor"}, asesor del ${c.taller}, informa su conformidad con el borrador final del trabajo «${c.titulo ?? "—"}», presentado por ${tesistas.map((t) => `${t.nombre} (DNI ${t.dni})`).join(" y ")}${c.programa ? `, del programa ${c.programa}` : ""}.`,
      ),
      seg(
        `La Ficha de Control de Asesoría está completa y firmada, las observaciones fueron levantadas y la similitud preliminar es de ${k.similitudPreliminar ?? 0} %.`,
      ),
      seg(
        c.expedienteCodigo
          ? `Expediente de titulación: ${c.expedienteCodigo}. Con este informe el trámite continúa en la Etapa 5.`
          : "Con este informe el trámite continúa en la Etapa 5.",
      ),
      seg("Atentamente,"),
    ],
    firmas: [seg(c.asesor ?? "Asesor")],
    pendientes: [],
  };
  const bytes = await renderizarPdf(doc, {
    codigo: c.expedienteCodigo ?? c.codigo,
    referencia: c.expedienteCodigo ? "Expediente" : `${c.taller} · Proyecto`,
    versionPlantilla: "taller-v1",
    generadoEn: ahora,
  });
  await new DrizzleUnitOfWork(db).run(async (tx) => {
    await tx
      .update(cierresAsesoria)
      .set({ informeGeneradoAt: ahora, updatedAt: ahora })
      .where(eq(cierresAsesoria.proyectoId, proyectoId));
    await appendAuditoriaTaller(tx, {
      tallerId: c.tallerId,
      actorId: idActor(actor),
      actorDni: actor.dni,
      accion: "EMITIR_CONFORMIDAD",
      detalle: `${c.codigo}: Informe de Conformidad generado`,
    });
    return ok(true);
  });
  return ok(bytes);
}

/**
 * §9 P13 "el proyecto sigue en la Etapa 5 (originalidad)": el Informe de
 * Conformidad firmado queda como Acta de conformidad del expediente (E2) y la
 * similitud preliminar en sus metadatos, para que la evaluación de
 * originalidad la tenga a mano. El seguimiento NO se adelanta: las etapas
 * del trámite siguen sus propias reglas de avance.
 */
async function adjuntarAlExpediente(
  tx: DbExecutor,
  expedienteId: string,
  archivo: { ruta: string; sha256: string },
  similitud: number | null,
  codigo: string,
  actor: Actor,
): Promise<void> {
  const [exp] = await tx
    .select({ estado: expedientes.estado, metadata: expedientes.metadata })
    .from(expedientes)
    .where(eq(expedientes.id, expedienteId))
    .limit(1)
    .for("update");
  if (!exp) return;
  const [ultimo] = await tx
    .select({ version: documentos.version, estado: documentos.estado })
    .from(documentos)
    .where(and(eq(documentos.expedienteId, expedienteId), eq(documentos.tipo, "ACTA_CONFORMIDAD")))
    .orderBy(desc(documentos.version))
    .limit(1);
  // Un acta ya aprobada por el área no se reemplaza.
  if (ultimo?.estado !== "APROBADO")
    await tx.insert(documentos).values({
      expedienteId,
      tipo: "ACTA_CONFORMIDAD",
      etapa: "E2",
      ruta: archivo.ruta,
      version: (ultimo?.version ?? 0) + 1,
      sha256: archivo.sha256,
      estado: "CARGADO",
    });
  await tx
    .update(expedientes)
    .set({
      metadata: {
        ...(exp.metadata ?? {}),
        tallerCierre: {
          proyecto: codigo,
          similitudPreliminar: similitud,
          cerradoAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(expedientes.id, expedienteId));
  await appendAuditoria(tx, {
    expedienteId,
    actorId: idActor(actor),
    actorDni: actor.dni,
    estadoAnterior: exp.estado,
    estadoNuevo: exp.estado,
    detalle: `Taller ${codigo}: asesoría cerrada; Informe de Conformidad (Anexo 21) adjunto como Acta de conformidad${
      similitud !== null ? `; similitud preliminar ${similitud} %` : ""
    }`,
  });
}

export class SubirInformeFirmadoUseCase {
  constructor(private readonly storage: AlmacenamientoPort) {}

  async execute(
    proyectoId: string,
    archivo: ArchivoSubido,
    actor: Actor,
  ): Promise<Result<string, DomainError>> {
    const v = esPdf(archivo);
    if (!v.ok) return v;
    const k0 = await cierreDeProyecto(db, proyectoId, true);
    if (!k0) return fail(new DomainError("NO_ENCONTRADO", "Proyecto no encontrado"));
    if (k0.cerradoAt)
      return fail(new DomainError("TRANSICION_INVALIDA", "La asesoría ya está cerrada"));
    if (!k0.informeGeneradoAt)
      return fail(
        new DomainError("REQUISITO_PENDIENTE", "Genera primero el Informe de Conformidad"),
      );
    const guardado = await this.storage.save(
      proyectoId,
      `conformidad-firmada-${randomUUID()}.pdf`,
      archivo.bytes,
      "cierre",
    );
    // Copia del Anexo 21 firmado en la carpeta del expediente (Acta de conformidad, E2).
    const [pr] = await db
      .select({ expedienteId: proyectosTaller.expedienteId })
      .from(proyectosTaller)
      .where(eq(proyectosTaller.id, proyectoId))
      .limit(1);
    const expedienteId = pr?.expedienteId ?? null;
    const copia = expedienteId
      ? await this.storage.save(
          expedienteId,
          `ACTA_CONFORMIDAD_taller_${randomUUID()}.pdf`,
          archivo.bytes,
        )
      : null;
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const c = await cabecera(tx, proyectoId);
      if (!c) return fail(new DomainError("NO_ENCONTRADO", "Proyecto no encontrado"));
      const ahora = new Date();
      if (expedienteId && copia)
        await adjuntarAlExpediente(
          tx,
          expedienteId,
          copia,
          k0.similitudPreliminar,
          c.codigo,
          actor,
        );
      await tx
        .update(cierresAsesoria)
        .set({
          informeFirmadoRuta: guardado.ruta,
          informeFirmadoSha256: guardado.sha256,
          cerradoPor: idActor(actor),
          cerradoAt: ahora,
          updatedAt: ahora,
        })
        .where(eq(cierresAsesoria.proyectoId, proyectoId));
      for (const t of c.tesistas) {
        if (t.estado === "RETIRADO" || t.estado === "ASESORIA_CERRADA") continue;
        // §6: solo un tesista con el plan aprobado cierra la asesoría.
        const paso = assertTransicionTesista(t.estado, "ASESORIA_CERRADA");
        if (!paso.ok) return paso;
        await tx
          .update(proyectoTesistas)
          .set({ estado: "ASESORIA_CERRADA", updatedAt: ahora })
          .where(eq(proyectoTesistas.id, t.id));
      }
      await appendAuditoriaTaller(tx, {
        tallerId: c.tallerId,
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: "CERRAR_ASESORIA",
        detalle: `${c.codigo}: informe firmado subido; asesoría cerrada`,
      });
      return ok(c);
    });
    if (!r.ok) return r;
    await avisar(
      await correosProyecto(db, proyectoId),
      "Tu asesoría del taller quedó cerrada",
      "Tu asesor subió el Informe de Conformidad firmado. Tu trámite continúa en la Etapa 5 de titulación.",
      "/mi-tramite",
      "Ver Mi trámite",
    );
    await avisar(
      await correosSecretaria(),
      `${r.value.codigo}: asesoría cerrada`,
      `El asesor cerró la asesoría del proyecto ${r.value.codigo} (Informe de Conformidad firmado).`,
      `/taller/${r.value.tallerId}`,
      "Ver taller",
    );
    return ok(proyectoId);
  }
}

export async function rutaInformeFirmado(proyectoId: string): Promise<string | null> {
  const [k] = await db
    .select({ ruta: cierresAsesoria.informeFirmadoRuta })
    .from(cierresAsesoria)
    .where(eq(cierresAsesoria.proyectoId, proyectoId))
    .limit(1);
  return k?.ruta ?? null;
}
