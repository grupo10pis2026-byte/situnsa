import type {
  ComprobanteDTO,
  FiltrosPagos,
  MisPagosDTO,
  PagosTallerDTO,
  PensionFilaDTO,
} from "@pis/contracts";
import {
  comprobantesPension,
  type DbExecutor,
  pensionesAlumno,
  pensionesTaller,
  proyectosTaller,
  proyectoTesistas,
  talleres,
  usuarios,
} from "@pis/db";
import {
  diasAtraso,
  FORMATOS_COMPROBANTE,
  type ParametrosTaller,
  puedeSubirComprobante,
} from "@pis/domain";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";

/** Lecturas de P8 (alumno) y P9 (Secretaría). */

type FilaComprobante = typeof comprobantesPension.$inferSelect;

function comprobanteDto(c: FilaComprobante): ComprobanteDTO {
  return {
    id: c.id,
    nombreArchivo: c.nombreOriginal,
    mime: c.mime,
    estado: c.estado,
    motivo: c.motivo,
    subidoAt: c.createdAt.toISOString(),
    validadoAt: c.validadoAt ? c.validadoAt.toISOString() : null,
  };
}

async function comprobantesDe(tx: DbExecutor, ids: string[]): Promise<FilaComprobante[]> {
  if (ids.length === 0) return [];
  return tx
    .select()
    .from(comprobantesPension)
    .where(inArray(comprobantesPension.pensionAlumnoId, ids))
    .orderBy(desc(comprobantesPension.createdAt));
}

/** Días de atraso que se muestran: con un comprobante en revisión no corre el atraso. */
function atrasoVisible(
  estado: Parameters<typeof diasAtraso>[0]["estado"],
  fecha: string | null,
  hoy: string,
): number {
  return estado === "EN_REVISION" ? 0 : diasAtraso({ estado, fecha }, hoy);
}

/** ¿Tiene deuda hoy? Vencida, observada o pendiente con fecha pasada (en revisión no). */
export function tieneDeuda(estado: string, atraso: number): boolean {
  return estado === "VENCIDA" || estado === "OBSERVADA" || (estado === "PENDIENTE" && atraso > 0);
}

export async function filasPensiones(
  tx: DbExecutor,
  filtros: FiltrosPagos & { ids?: string[] },
  hoy: string,
): Promise<PensionFilaDTO[]> {
  const condiciones: SQL[] = [];
  if (filtros.tallerId) condiciones.push(eq(pensionesTaller.tallerId, filtros.tallerId));
  if (filtros.estado) condiciones.push(eq(pensionesAlumno.estado, filtros.estado));
  if (filtros.ids)
    condiciones.push(
      inArray(
        pensionesAlumno.id,
        filtros.ids.length ? filtros.ids : ["00000000-0000-0000-0000-000000000000"],
      ),
    );
  const filas = await tx
    .select({
      id: pensionesAlumno.id,
      alumnoId: pensionesAlumno.alumnoId,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
      dni: usuarios.dni,
      tallerId: talleres.id,
      taller: talleres.nombre,
      numero: pensionesTaller.numero,
      fecha: pensionesTaller.fecha,
      monto: pensionesTaller.monto,
      estado: pensionesAlumno.estado,
      medio: pensionesAlumno.medio,
      montoPagado: pensionesAlumno.montoPagado,
      observacion: pensionesAlumno.observacion,
    })
    .from(pensionesAlumno)
    .innerJoin(pensionesTaller, eq(pensionesTaller.id, pensionesAlumno.pensionTallerId))
    .innerJoin(talleres, eq(talleres.id, pensionesTaller.tallerId))
    .innerJoin(usuarios, eq(usuarios.id, pensionesAlumno.alumnoId))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(asc(talleres.nombre), asc(usuarios.apellidos), asc(pensionesTaller.numero));
  const proyectos = filas.length
    ? await tx
        .select({
          alumnoId: proyectoTesistas.alumnoId,
          tallerId: proyectosTaller.tallerId,
          codigo: proyectosTaller.codigo,
        })
        .from(proyectoTesistas)
        .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
        .where(inArray(proyectoTesistas.alumnoId, [...new Set(filas.map((f) => f.alumnoId))]))
    : [];
  const comprobantes = await comprobantesDe(
    tx,
    filas.map((f) => f.id),
  );
  const q = filtros.q?.trim().toLowerCase();
  return filas
    .map((f) => {
      const atraso = atrasoVisible(f.estado, f.fecha, hoy);
      const ultimo = comprobantes.find((c) => c.pensionAlumnoId === f.id) ?? null;
      return {
        id: f.id,
        alumnoId: f.alumnoId,
        alumno: `${f.nombres} ${f.apellidos}`,
        dni: f.dni,
        tallerId: f.tallerId,
        taller: f.taller,
        proyecto:
          proyectos.find((p) => p.alumnoId === f.alumnoId && p.tallerId === f.tallerId)?.codigo ??
          null,
        numero: f.numero,
        fecha: f.fecha,
        monto: f.monto,
        estado: f.estado,
        medio: f.medio,
        montoPagado: f.montoPagado,
        diasAtraso: atraso,
        observacion: f.observacion,
        comprobante: ultimo ? comprobanteDto(ultimo) : null,
      };
    })
    .filter((f) => filtros.deudores !== "true" || tieneDeuda(f.estado, f.diasAtraso))
    .filter((f) => !q || f.alumno.toLowerCase().includes(q) || f.dni.includes(q));
}

export async function pagosTaller(
  tx: DbExecutor,
  filtros: FiltrosPagos,
  hoy: string,
): Promise<PagosTallerDTO> {
  const items = await filasPensiones(tx, filtros, hoy);
  const deudas = items.filter((f) => tieneDeuda(f.estado, f.diasAtraso));
  const lista = await tx
    .select({ id: talleres.id, nombre: talleres.nombre })
    .from(talleres)
    .orderBy(desc(talleres.fechaInicio));
  return {
    items,
    resumen: {
      porValidar: items.filter((f) => f.estado === "EN_REVISION").length,
      vencidas: items.filter((f) => f.estado === "VENCIDA").length,
      deudores: new Set(deudas.map((f) => f.alumnoId)).size,
      deudaTotal: deudas.reduce((a, f) => a + f.monto, 0),
    },
    talleres: lista,
  };
}

export async function filaPension(
  tx: DbExecutor,
  pensionAlumnoId: string,
  hoy: string,
): Promise<PensionFilaDTO | null> {
  const [f] = await filasPensiones(tx, { ids: [pensionAlumnoId] }, hoy);
  return f ?? null;
}

/** Último taller del alumno (cualquier estado del tesista: un retirado ve su historial). */
export async function tallerDelAlumno(
  tx: DbExecutor,
  alumnoId: string,
): Promise<{ id: string; nombre: string; proyectoId: string; estadoTesista: string } | null> {
  const [f] = await tx
    .select({
      id: talleres.id,
      nombre: talleres.nombre,
      proyectoId: proyectosTaller.id,
      estadoTesista: proyectoTesistas.estado,
    })
    .from(proyectoTesistas)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
    .innerJoin(talleres, eq(talleres.id, proyectosTaller.tallerId))
    .where(eq(proyectoTesistas.alumnoId, alumnoId))
    .orderBy(desc(proyectoTesistas.createdAt))
    .limit(1);
  return f ?? null;
}

export async function misPagos(
  tx: DbExecutor,
  alumnoId: string,
  parametros: ParametrosTaller,
  hoy: string,
): Promise<MisPagosDTO> {
  const taller = await tallerDelAlumno(tx, alumnoId);
  const base = { formatos: [...FORMATOS_COMPROBANTE], maxMb: parametros.maxMbComprobante };
  if (!taller) return { taller: null, pensiones: [], ...base };
  const filas = await tx
    .select({
      id: pensionesAlumno.id,
      numero: pensionesTaller.numero,
      fecha: pensionesTaller.fecha,
      monto: pensionesTaller.monto,
      estado: pensionesAlumno.estado,
      medio: pensionesAlumno.medio,
      observacion: pensionesAlumno.observacion,
    })
    .from(pensionesAlumno)
    .innerJoin(pensionesTaller, eq(pensionesTaller.id, pensionesAlumno.pensionTallerId))
    .where(and(eq(pensionesTaller.tallerId, taller.id), eq(pensionesAlumno.alumnoId, alumnoId)))
    .orderBy(asc(pensionesTaller.numero));
  const comprobantes = await comprobantesDe(
    tx,
    filas.map((f) => f.id),
  );
  const retirado = taller.estadoTesista === "RETIRADO";
  return {
    taller: { id: taller.id, nombre: taller.nombre },
    pensiones: filas.map((f) => {
      const gate = puedeSubirComprobante(f.estado);
      return {
        id: f.id,
        numero: f.numero,
        fecha: f.fecha,
        monto: f.monto,
        estado: f.estado,
        medio: f.medio,
        diasAtraso: atrasoVisible(f.estado, f.fecha, hoy),
        observacion: f.observacion,
        comprobantes: comprobantes.filter((c) => c.pensionAlumnoId === f.id).map(comprobanteDto),
        motivoNoSubir: retirado ? "Retirado: solo lectura" : gate.ok ? null : gate.error.message,
      };
    }),
    ...base,
  };
}
