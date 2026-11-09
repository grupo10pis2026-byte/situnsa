import type {
  AlertasTallerDTO,
  AlertaTallerDTO,
  ReportesTallerDTO,
  RetiroInput,
} from "@pis/contracts";
import {
  alertasTaller,
  auditoriaTaller,
  type DbExecutor,
  db,
  entregasHito,
  hitosProyecto,
  pensionesAlumno,
  pensionesTaller,
  proyectosTaller,
  proyectoTesistas,
  retirosTaller,
  tallerAsistencias,
  talleres,
  tallerSesiones,
  usuarios,
} from "@pis/db";
import {
  assertTransicionAlerta,
  assertTransicionHito,
  assertTransicionTesista,
  type DocumentoRenderizado,
  DomainError,
  diasAtraso,
  diferenciaDias,
  estadoPorCupo,
  fail,
  HITOS_TALLER,
  hitoVencido,
  ok,
  porcentajeAsistenciaCurso,
  type RegistroAsistenciaCurso,
  type Result,
  reportesProgramados,
  type Segmento,
  type TipoHito,
} from "@pis/domain";
import { and, asc, desc, eq, inArray, lt, type SQL } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import { renderizarPdf } from "../../../infra/pdf/render-documento.js";
import { escribirXlsx } from "../../../infra/xlsx/escribir-xlsx.js";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";
import { proyectosEnCupo } from "../proyectos/proyectos.repository.js";
import { hoyLima } from "../sesiones/sesiones.repository.js";
import { appendAuditoriaTaller } from "../taller-auditoria.js";
import { avisar, correoAsesor, correosProyecto, correosSecretaria } from "../taller-avisos.js";

/**
 * P12 (spec v1.0 §9): alertas, retiro de alumnos y reportes a la Unidad;
 * y el proceso diario de hitos vencidos (§6: HABILITADO u OBSERVADO al
 * vencer → NO_ENTREGADO, con alerta del plan no presentado o del avance).
 */

export interface Actor {
  id: string;
  dni: string;
}

const idActor = (a: Actor) => (a.id === "" ? null : a.id);
const NOMBRE_HITO = new Map<TipoHito, string>(HITOS_TALLER.map((h) => [h.tipo, h.nombre]));

const DETALLE: Record<string, string> = {
  FALTAS_CONSECUTIVAS: "Faltas consecutivas: corresponde evaluar el retiro",
  PLAN_NO_PRESENTADO: "No presentó el plan de tesis en la semana 2",
  AVANCE_INCUMPLIDO: "No entregó un avance en su fecha límite",
};

async function filasAlertas(tx: DbExecutor, condiciones: SQL[]): Promise<AlertaTallerDTO[]> {
  const filas = await tx
    .select({
      a: alertasTaller,
      taller: talleres.nombre,
      proyecto: proyectosTaller.codigo,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
      hitoTipo: hitosProyecto.tipo,
    })
    .from(alertasTaller)
    .innerJoin(talleres, eq(talleres.id, alertasTaller.tallerId))
    .leftJoin(proyectosTaller, eq(proyectosTaller.id, alertasTaller.proyectoId))
    .leftJoin(usuarios, eq(usuarios.id, alertasTaller.alumnoId))
    .leftJoin(hitosProyecto, eq(hitosProyecto.id, alertasTaller.hitoId))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(asc(alertasTaller.estado), desc(alertasTaller.createdAt));
  const alumnos = filas.map((f) => f.a.alumnoId).filter((x): x is string => x !== null);
  const retirados = alumnos.length
    ? await tx
        .select({ alumnoId: proyectoTesistas.alumnoId, proyectoId: proyectoTesistas.proyectoId })
        .from(proyectoTesistas)
        .where(
          and(inArray(proyectoTesistas.alumnoId, alumnos), eq(proyectoTesistas.estado, "RETIRADO")),
        )
    : [];
  return filas.map((f) => ({
    id: f.a.id,
    tipo: f.a.tipo,
    estado: f.a.estado,
    tallerId: f.a.tallerId,
    taller: f.taller,
    proyectoId: f.a.proyectoId,
    proyecto: f.proyecto,
    alumnoId: f.a.alumnoId,
    alumno: f.nombres ? `${f.nombres} ${f.apellidos}` : null,
    hito: f.hitoTipo ? (NOMBRE_HITO.get(f.hitoTipo) ?? f.hitoTipo) : null,
    detalle: DETALLE[f.a.tipo] ?? f.a.tipo,
    creadaAt: f.a.createdAt.toISOString(),
    motivoDescarte: f.a.motivoDescarte,
    retirado: retirados.some((r) => r.alumnoId === f.a.alumnoId && r.proyectoId === f.a.proyectoId),
  }));
}

export async function listarAlertas(
  tx: DbExecutor,
  f: { tallerId?: string | undefined; estado?: "ACTIVA" | "ATENDIDA" | "DESCARTADA" | undefined },
): Promise<AlertasTallerDTO> {
  const condiciones: SQL[] = [];
  if (f.tallerId) condiciones.push(eq(alertasTaller.tallerId, f.tallerId));
  if (f.estado) condiciones.push(eq(alertasTaller.estado, f.estado));
  const items = await filasAlertas(tx, condiciones);
  const lista = await tx
    .select({ id: talleres.id, nombre: talleres.nombre })
    .from(talleres)
    .orderBy(desc(talleres.fechaInicio));
  return { items, activas: items.filter((a) => a.estado === "ACTIVA").length, talleres: lista };
}

export async function alertaPorId(tx: DbExecutor, id: string): Promise<AlertaTallerDTO | null> {
  const [a] = await filasAlertas(tx, [eq(alertasTaller.id, id)]);
  return a ?? null;
}

export class DescartarAlertaUseCase {
  async execute(id: string, motivo: string, actor: Actor): Promise<Result<true, DomainError>> {
    return new DrizzleUnitOfWork(db).run(async (tx) => {
      const [a] = await tx
        .select()
        .from(alertasTaller)
        .where(eq(alertasTaller.id, id))
        .limit(1)
        .for("update");
      if (!a) return fail(new DomainError("NO_ENCONTRADO", "Alerta no encontrada"));
      const paso = assertTransicionAlerta(a.estado, "DESCARTADA");
      if (!paso.ok) return paso;
      await tx
        .update(alertasTaller)
        .set({
          estado: "DESCARTADA",
          motivoDescarte: motivo.trim(),
          resueltaPor: idActor(actor),
          resueltaAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(alertasTaller.id, id));
      await appendAuditoriaTaller(tx, {
        tallerId: a.tallerId,
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: "DESCARTAR_ALERTA",
        detalle: `${a.tipo}: ${motivo.trim()}`,
      });
      return ok(true);
    });
  }
}

export class RegistrarRetiroUseCase {
  async execute(
    tallerId: string,
    input: RetiroInput,
    actor: Actor,
  ): Promise<Result<true, DomainError>> {
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const [t] = await tx
        .select({
          id: proyectoTesistas.id,
          estado: proyectoTesistas.estado,
          proyectoId: proyectoTesistas.proyectoId,
          codigo: proyectosTaller.codigo,
        })
        .from(proyectoTesistas)
        .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
        .where(
          and(
            eq(proyectosTaller.tallerId, tallerId),
            eq(proyectoTesistas.alumnoId, input.alumnoId),
          ),
        )
        .limit(1)
        .for("update", { of: proyectoTesistas });
      if (!t) return fail(new DomainError("NO_ENCONTRADO", "El alumno no es de este taller"));
      const paso = assertTransicionTesista(t.estado, "RETIRADO");
      if (!paso.ok)
        return fail(
          new DomainError(
            "TRANSICION_INVALIDA",
            t.estado === "RETIRADO" ? "El alumno ya está retirado" : paso.error.message,
          ),
        );
      let alertaId: string | null = null;
      if (input.alertaId) {
        const [a] = await tx
          .select()
          .from(alertasTaller)
          .where(eq(alertasTaller.id, input.alertaId))
          .limit(1)
          .for("update");
        if (!a || a.tallerId !== tallerId)
          return fail(new DomainError("NO_ENCONTRADO", "Alerta no encontrada"));
        const pa = assertTransicionAlerta(a.estado, "ATENDIDA");
        if (!pa.ok) return pa;
        alertaId = a.id;
      }
      const ahora = new Date();
      await tx
        .update(proyectoTesistas)
        .set({ estado: "RETIRADO", updatedAt: ahora })
        .where(eq(proyectoTesistas.id, t.id));
      await tx.insert(retirosTaller).values({
        proyectoTesistaId: t.id,
        alertaId,
        motivo: input.motivo.trim(),
        fecha: input.fecha,
        registradoPor: actor.id,
        creadoPor: idActor(actor),
      });
      // Las alertas activas del alumno quedan atendidas con el retiro.
      await tx
        .update(alertasTaller)
        .set({
          estado: "ATENDIDA",
          resueltaPor: idActor(actor),
          resueltaAt: ahora,
          updatedAt: ahora,
        })
        .where(
          and(
            eq(alertasTaller.tallerId, tallerId),
            eq(alertasTaller.alumnoId, input.alumnoId),
            eq(alertasTaller.estado, "ACTIVA"),
          ),
        );
      const [u] = await tx
        .select({ email: usuarios.email, nombres: usuarios.nombres, apellidos: usuarios.apellidos })
        .from(usuarios)
        .where(eq(usuarios.id, input.alumnoId))
        .limit(1);
      await appendAuditoriaTaller(tx, {
        tallerId,
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: "RETIRO",
        detalle: `${t.codigo}: ${u?.nombres} ${u?.apellidos} (${input.motivo.trim()})`,
      });
      // §9 P12 (POR CONFIRMAR): si el retiro libera el cupo, un taller COMPLETO vuelve a abrirse.
      const [tl] = await tx
        .select({ estado: talleres.estado, cupo: talleres.cupoProyectos })
        .from(talleres)
        .where(eq(talleres.id, tallerId))
        .limit(1);
      if (tl) {
        const nuevo = estadoPorCupo(tl.estado, await proyectosEnCupo(tx, tallerId), tl.cupo);
        if (nuevo !== tl.estado) {
          await tx
            .update(talleres)
            .set({ estado: nuevo, updatedAt: ahora })
            .where(eq(talleres.id, tallerId));
          await appendAuditoriaTaller(tx, {
            tallerId,
            actorId: idActor(actor),
            actorDni: actor.dni,
            accion: "CUPO_LIBERADO",
            detalle: `El retiro liberó un cupo: el taller pasa a ${nuevo}`,
          });
        }
      }
      return ok({
        email: u?.email ?? "",
        nombre: `${u?.nombres} ${u?.apellidos}`,
        codigo: t.codigo,
      });
    });
    if (!r.ok) return r;
    await avisar(
      [r.value.email],
      "Registramos tu retiro del taller de tesis",
      `La Secretaría registró tu retiro del taller. Motivo: ${input.motivo.trim()}. Tu historial queda en modo de solo lectura.`,
      "/mi-taller",
      "Ver Mi Taller",
    );
    const asesor = await correoAsesor(db, tallerId);
    if (asesor)
      await avisar(
        [asesor],
        `${r.value.codigo}: retiro de ${r.value.nombre}`,
        `Se registró el retiro de ${r.value.nombre} del proyecto ${r.value.codigo}.`,
        `/asesor/taller`,
        "Ver taller",
      );
    return ok(true);
  }
}

// ── Reportes (§3/§5) ───────────────────────────────────────────────────

const NOMBRE_REPORTE: Record<string, string> = {
  SEMANA_2: "Reporte de la semana 2 (plan de tesis)",
  QUINCENAL: "Reporte quincenal",
  CIERRE: "Reporte de cierre",
};

export async function reportesDelTaller(
  tx: DbExecutor,
  tallerId: string,
  hoy: string,
): Promise<ReportesTallerDTO | null> {
  const [t] = await tx
    .select({ nombre: talleres.nombre, inicio: talleres.fechaInicio })
    .from(talleres)
    .where(eq(talleres.id, tallerId))
    .limit(1);
  if (!t) return null;
  const inicio = t.inicio ?? hoy;
  return {
    tallerId,
    taller: t.nombre,
    reportes: reportesProgramados(inicio).map((r) => ({
      tipo: r.tipo,
      hito: r.hito,
      nombre: `${NOMBRE_REPORTE[r.tipo]} — ${NOMBRE_HITO.get(r.hito) ?? r.hito}`,
      fecha: r.fecha,
      disponible: r.fecha <= hoy,
    })),
  };
}

interface FilaReporte {
  proyecto: string;
  tesista: string;
  dni: string;
  estado: string;
  asistencia: string;
  hito: string;
  versiones: number;
  pensiones: string;
  atraso: number;
}

async function filasReporte(
  tx: DbExecutor,
  tallerId: string,
  hito: TipoHito,
  hoy: string,
): Promise<FilaReporte[]> {
  const parametros = await leerParametrosTaller(tx);
  const tesistas = await tx
    .select({
      alumnoId: proyectoTesistas.alumnoId,
      estado: proyectoTesistas.estado,
      proyectoId: proyectosTaller.id,
      codigo: proyectosTaller.codigo,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
      dni: usuarios.dni,
    })
    .from(proyectoTesistas)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
    .innerJoin(usuarios, eq(usuarios.id, proyectoTesistas.alumnoId))
    .where(eq(proyectosTaller.tallerId, tallerId))
    .orderBy(asc(proyectosTaller.codigo), asc(proyectoTesistas.orden));
  const sesiones = await tx
    .select({ id: tallerSesiones.id, estado: tallerSesiones.estado })
    .from(tallerSesiones)
    .where(eq(tallerSesiones.tallerId, tallerId))
    .orderBy(asc(tallerSesiones.fecha), asc(tallerSesiones.nro));
  const marcas = sesiones.length
    ? await tx
        .select({
          sesionId: tallerAsistencias.sesionId,
          usuarioId: tallerAsistencias.usuarioId,
          estado: tallerAsistencias.estado,
        })
        .from(tallerAsistencias)
        .where(
          inArray(
            tallerAsistencias.sesionId,
            sesiones.map((s) => s.id),
          ),
        )
    : [];
  const hitos = await tx
    .select({
      id: hitosProyecto.id,
      proyectoId: hitosProyecto.proyectoId,
      estado: hitosProyecto.estado,
      fecha: hitosProyecto.fechaLimite,
    })
    .from(hitosProyecto)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, hitosProyecto.proyectoId))
    .where(and(eq(proyectosTaller.tallerId, tallerId), eq(hitosProyecto.tipo, hito)));
  const versiones = hitos.length
    ? await tx
        .select({ hitoId: entregasHito.hitoId })
        .from(entregasHito)
        .where(
          inArray(
            entregasHito.hitoId,
            hitos.map((h) => h.id),
          ),
        )
    : [];
  const pensiones = await tx
    .select({
      alumnoId: pensionesAlumno.alumnoId,
      estado: pensionesAlumno.estado,
      fecha: pensionesTaller.fecha,
    })
    .from(pensionesAlumno)
    .innerJoin(pensionesTaller, eq(pensionesTaller.id, pensionesAlumno.pensionTallerId))
    .where(eq(pensionesTaller.tallerId, tallerId));
  return tesistas.map((t) => {
    const registros: RegistroAsistenciaCurso[] = sesiones.map((s) => ({
      sesion: s.estado,
      marca: marcas.find((m) => m.sesionId === s.id && m.usuarioId === t.alumnoId)?.estado ?? null,
    }));
    const pct = porcentajeAsistenciaCurso(registros, parametros);
    const h = hitos.find((x) => x.proyectoId === t.proyectoId);
    const propias = pensiones.filter((p) => p.alumnoId === t.alumnoId);
    return {
      proyecto: t.codigo,
      tesista: `${t.apellidos}, ${t.nombres}`,
      dni: t.dni,
      estado: t.estado.replace(/_/g, " "),
      asistencia: pct === null ? "—" : `${pct} %`,
      hito: h
        ? hitoVencido(h.estado, h.fecha, hoy)
          ? "VENCIDO"
          : h.estado.replace(/_/g, " ")
        : "—",
      versiones: h ? versiones.filter((v) => v.hitoId === h.id).length : 0,
      pensiones: `${propias.filter((p) => p.estado === "VALIDADA").length} de ${propias.length}`,
      atraso: Math.max(
        0,
        ...propias
          .filter((p) => p.estado !== "EN_REVISION")
          .map((p) => diasAtraso({ estado: p.estado, fecha: p.fecha }, hoy)),
      ),
    };
  });
}

const ENCABEZADOS = [
  "Proyecto",
  "Tesista",
  "DNI",
  "Estado",
  "Asistencia",
  "Hito",
  "Versiones",
  "Pensiones pagadas",
  "Días de atraso",
];

export async function exportarReporte(
  tallerId: string,
  hito: TipoHito,
  formato: "pdf" | "xlsx",
  ahora = new Date(),
): Promise<Result<{ bytes: Uint8Array; nombre: string; tipo: string }, DomainError>> {
  const hoy = hoyLima();
  const rep = await reportesDelTaller(db, tallerId, hoy);
  const meta = rep?.reportes.find((r) => r.hito === hito);
  if (!rep || !meta) return fail(new DomainError("NO_ENCONTRADO", "Reporte no encontrado"));
  const filas = await filasReporte(db, tallerId, hito, hoy);
  const base = `${rep.taller.replace(/[^A-Za-z0-9]+/g, "_")}_${meta.tipo}_${hito}`;
  if (formato === "xlsx") {
    const bytes = escribirXlsx(
      {
        nombre: "Reporte",
        titulo: [
          "UNSA · FIPS · UNIDAD DE SEGUNDA ESPECIALIDAD — TALLER DE TESIS",
          `${rep.taller.toUpperCase()} — ${meta.nombre.toUpperCase()}`,
          `Generado el ${hoy}`,
        ],
        encabezados: ENCABEZADOS,
        filas: filas.map((f) => [
          f.proyecto,
          f.tesista,
          f.dni,
          f.estado,
          f.asistencia,
          f.hito,
          f.versiones,
          f.pensiones,
          f.atraso,
        ]),
        anchos: [9, 34, 11, 18, 11, 16, 10, 16, 14],
      },
      ahora,
    );
    return ok({
      bytes,
      nombre: `${base}.xlsx`,
      tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  const seg = (texto: string): Segmento[] => [{ texto, pendiente: false }];
  const doc: DocumentoRenderizado = {
    tipo: "REPORTE_TALLER",
    nombre: meta.nombre,
    estilo: "carta",
    titulo: seg(`${rep.taller} — ${meta.nombre}`),
    parrafos: [
      seg(
        `Fecha del reporte: ${meta.fecha}. Generado el ${hoy}. Total de tesistas: ${filas.length}.`,
      ),
    ],
    tabla: {
      columnas: [
        { titulo: "Proyecto", peso: 0.9 },
        { titulo: "Tesista", peso: 2.4 },
        { titulo: "Estado", peso: 1.3 },
        { titulo: "Asist.", peso: 1 },
        { titulo: "Hito", peso: 1.3 },
        { titulo: "Vers.", peso: 0.8 },
        { titulo: "Pagadas", peso: 1 },
        { titulo: "Atraso (días)", peso: 1 },
      ],
      filas: filas.map((f) => [
        { texto: f.proyecto },
        { texto: `${f.tesista} (DNI ${f.dni})` },
        { texto: f.estado },
        { texto: f.asistencia },
        { texto: f.hito, pendiente: f.hito === "NO ENTREGADO" || f.hito === "VENCIDO" },
        { texto: String(f.versiones) },
        { texto: f.pensiones },
        { texto: f.atraso ? String(f.atraso) : "—", pendiente: f.atraso > 0 },
      ]),
    },
    firmas: [seg("Secretaría del Taller de Tesis")],
    pendientes: [],
  };
  const bytes = await renderizarPdf(doc, {
    codigo: rep.taller,
    referencia: "Reporte del",
    versionPlantilla: "taller-v1",
    generadoEn: ahora,
  });
  return ok({ bytes, nombre: `${base}.pdf`, tipo: "application/pdf" });
}

// ── Proceso diario de hitos (§6) ───────────────────────────────────────

export async function procesarHitosVencidos(hoy: string = hoyLima()): Promise<number> {
  const vencidos = await db
    .select({
      hito: hitosProyecto,
      tallerId: proyectosTaller.tallerId,
      codigo: proyectosTaller.codigo,
    })
    .from(hitosProyecto)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, hitosProyecto.proyectoId))
    .innerJoin(talleres, eq(talleres.id, proyectosTaller.tallerId))
    .where(
      and(
        inArray(hitosProyecto.estado, ["HABILITADO", "OBSERVADO"]),
        lt(hitosProyecto.fechaLimite, hoy),
        eq(talleres.estado, "EN_CURSO"),
      ),
    );
  let n = 0;
  for (const v of vencidos) {
    if (!hitoVencido(v.hito.estado, v.hito.fechaLimite, hoy)) continue;
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const paso = assertTransicionHito(v.hito.estado, "NO_ENTREGADO");
      if (!paso.ok) return paso;
      const cambio = await tx
        .update(hitosProyecto)
        .set({ estado: "NO_ENTREGADO", updatedAt: new Date() })
        .where(and(eq(hitosProyecto.id, v.hito.id), eq(hitosProyecto.estado, v.hito.estado)))
        .returning({ id: hitosProyecto.id });
      if (cambio.length === 0) return ok(false);
      const tipo =
        v.hito.tipo === "PLAN" ? ("PLAN_NO_PRESENTADO" as const) : ("AVANCE_INCUMPLIDO" as const);
      const tesistas = await tx
        .select({ alumnoId: proyectoTesistas.alumnoId })
        .from(proyectoTesistas)
        .where(
          and(
            eq(proyectoTesistas.proyectoId, v.hito.proyectoId),
            inArray(proyectoTesistas.estado, ["EN_TALLER", "PLAN_APROBADO"]),
          ),
        );
      for (const t of tesistas)
        await tx
          .insert(alertasTaller)
          .values({
            tipo,
            tallerId: v.tallerId,
            proyectoId: v.hito.proyectoId,
            alumnoId: t.alumnoId,
            hitoId: v.hito.id,
            claveDedupe: `HITO:${v.hito.id}:${t.alumnoId}:${v.hito.fechaLimite}`,
          })
          .onConflictDoNothing({ target: alertasTaller.claveDedupe });
      await appendAuditoriaTaller(tx, {
        tallerId: v.tallerId,
        actorId: null,
        actorDni: "SISTEMA",
        accion: "HITO_NO_ENTREGADO",
        detalle: `${v.codigo}: ${NOMBRE_HITO.get(v.hito.tipo)} venció el ${v.hito.fechaLimite}`,
      });
      return ok(true);
    });
    if (r.ok && r.value) {
      n += 1;
      const nombre = NOMBRE_HITO.get(v.hito.tipo) ?? v.hito.tipo;
      await avisar(
        await correosProyecto(db, v.hito.proyectoId),
        `No entregaste: ${nombre}`,
        `Venció la fecha límite de «${nombre}» (${v.hito.fechaLimite}) sin entrega. Comunícate con tu asesor.`,
        "/mi-taller",
        "Ver Mi Taller",
      );
      const asesor = await correoAsesor(db, v.tallerId);
      await avisar(
        [...(asesor ? [asesor] : []), ...(await correosSecretaria())],
        `${v.codigo}: ${nombre} no entregado`,
        `El proyecto ${v.codigo} no entregó «${nombre}» hasta el ${v.hito.fechaLimite}. Revisa las alertas del taller.`,
        "/reportes-taller",
        "Ver alertas",
      );
    }
  }
  return n;
}

// ── Reportes programados (§3/§5: el lunes tras cada hito) ─────────────

/**
 * Avisa a la Secretaría cuando toca un reporte (semana 2, quincenales y
 * cierre) con un resumen y el enlace para descargarlo en PDF o Excel. Se
 * registra en el historial del taller y no se repite; si el proceso no corrió
 * ese lunes, se pone al día dentro de los 7 días siguientes.
 */
export async function enviarReportesProgramados(hoy: string = hoyLima()): Promise<number> {
  const lista = await db
    .select({ id: talleres.id, nombre: talleres.nombre, inicio: talleres.fechaInicio })
    .from(talleres)
    .where(inArray(talleres.estado, ["EN_CURSO", "FINALIZADO"]));
  let enviados = 0;
  for (const t of lista) {
    if (!t.inicio) continue;
    for (const r of reportesProgramados(t.inicio)) {
      if (r.fecha > hoy || diferenciaDias(r.fecha, hoy) > 7) continue;
      const accion = `REPORTE_${r.tipo}_${r.hito}`;
      const ya = await db
        .select({ id: auditoriaTaller.id })
        .from(auditoriaTaller)
        .where(and(eq(auditoriaTaller.tallerId, t.id), eq(auditoriaTaller.accion, accion)))
        .limit(1);
      if (ya.length > 0) continue;
      const filas = await filasReporte(db, t.id, r.hito, hoy);
      const nombre = `${NOMBRE_REPORTE[r.tipo]} — ${NOMBRE_HITO.get(r.hito) ?? r.hito}`;
      const resumen = [
        `${filas.length} tesistas`,
        `${filas.filter((f) => f.hito === "APROBADO" || f.hito === "ENTREGADO").length} con el hito entregado o aprobado`,
        `${filas.filter((f) => f.hito === "NO ENTREGADO" || f.hito === "VENCIDO").length} sin entregar`,
        `${filas.filter((f) => f.atraso > 0).length} con pensiones atrasadas`,
      ].join(", ");
      await new DrizzleUnitOfWork(db).run(async (tx) => {
        await appendAuditoriaTaller(tx, {
          tallerId: t.id,
          actorId: null,
          actorDni: "SISTEMA",
          accion,
          detalle: `${nombre}: ${resumen}`,
        });
        return ok(true);
      });
      await avisar(
        await correosSecretaria(),
        `${t.nombre}: ${nombre}`,
        `Ya está disponible el ${nombre.toLowerCase()} del ${t.nombre}: ${resumen}. Descárgalo en PDF o Excel desde Alertas y reportes.`,
        "/reportes-taller",
        "Ver reportes",
      );
      enviados += 1;
    }
  }
  return enviados;
}
