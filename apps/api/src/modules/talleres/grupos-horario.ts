import {
  type DbExecutor,
  grupoHorarioDias,
  gruposHorario,
  tallerDias,
  talleres,
  tallerSesiones,
} from "@pis/db";
import { diaIso, type HorarioDia, siguienteNombreGrupo, tieneHorario } from "@pis/domain";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

/**
 * Adenda 1.2 A1/A2: lectura única del enlace de reunión y del horario de los
 * grupos (por día de sesión), y creación del Grupo A desde el horario del taller.
 */

/** A1: la única función que lee el enlace de reunión de un taller. */
export function enlaceReunion(t: { enlaceReunion: string | null }): string | null {
  const e = t.enlaceReunion?.trim();
  return e ? e : null;
}

export async function diasDelTaller(tx: DbExecutor, tallerId: string) {
  return tx
    .select({ dia: tallerDias.dia, horaInicio: tallerDias.horaInicio, horaFin: tallerDias.horaFin })
    .from(tallerDias)
    .where(eq(tallerDias.tallerId, tallerId))
    .orderBy(asc(tallerDias.dia));
}

/** Horario por día de cada grupo (id → horarios ordenados por día). */
export async function horariosDeGrupos(
  tx: DbExecutor,
  grupoIds: readonly string[],
): Promise<Map<string, HorarioDia[]>> {
  const mapa = new Map<string, HorarioDia[]>();
  if (grupoIds.length === 0) return mapa;
  const filas = await tx
    .select()
    .from(grupoHorarioDias)
    .where(inArray(grupoHorarioDias.grupoHorarioId, [...grupoIds]))
    .orderBy(asc(grupoHorarioDias.dia));
  for (const f of filas) {
    const lista = mapa.get(f.grupoHorarioId) ?? [];
    lista.push({ dia: f.dia, horaInicio: f.horaInicio, horaFin: f.horaFin });
    mapa.set(f.grupoHorarioId, lista);
  }
  return mapa;
}

export async function guardarHorariosGrupo(
  tx: DbExecutor,
  grupoId: string,
  horarios: readonly HorarioDia[],
): Promise<void> {
  await tx.delete(grupoHorarioDias).where(eq(grupoHorarioDias.grupoHorarioId, grupoId));
  if (horarios.length)
    await tx
      .insert(grupoHorarioDias)
      .values(horarios.map((h) => ({ grupoHorarioId: grupoId, ...h })));
}

/**
 * A2: si el taller tiene horario y aún no tiene grupos activos, crea el
 * Grupo A con ese horario (sin proyectos: los asigna el asesor).
 * Devuelve el nombre creado o null si no correspondía.
 */
export async function crearGrupoASiCorresponde(
  tx: DbExecutor,
  tallerId: string,
  creadoPor: string | null,
): Promise<string | null> {
  const dias = await diasDelTaller(tx, tallerId);
  if (!tieneHorario(dias)) return null;
  const activos = await tx
    .select({ nombre: gruposHorario.nombre })
    .from(gruposHorario)
    .where(and(eq(gruposHorario.tallerId, tallerId), eq(gruposHorario.activo, true)));
  if (activos.length > 0) return null;
  // El nombre único incluye los grupos desactivados (índice único por taller y nombre).
  const todos = await tx
    .select({ nombre: gruposHorario.nombre })
    .from(gruposHorario)
    .where(eq(gruposHorario.tallerId, tallerId));
  const nombre = siguienteNombreGrupo(todos.map((g) => g.nombre));
  const [g] = await tx
    .insert(gruposHorario)
    .values({ tallerId, nombre, creadoPor })
    .returning({ id: gruposHorario.id });
  if (!g) return null;
  await guardarHorariosGrupo(
    tx,
    g.id,
    dias.map((d) => ({ dia: d.dia, horaInicio: d.horaInicio ?? "", horaFin: d.horaFin ?? "" })),
  );
  return nombre;
}

/**
 * A2 edición posterior: las sesiones por dictar que estaban «Horario por
 * definir» toman el horario recién agregado de su día.
 */
export async function completarHorarioSesiones(tx: DbExecutor, tallerId: string): Promise<number> {
  const dias = await diasDelTaller(tx, tallerId);
  if (!tieneHorario(dias)) return 0;
  const pendientes = await tx
    .select({ id: tallerSesiones.id, fecha: tallerSesiones.fecha })
    .from(tallerSesiones)
    .where(
      and(
        eq(tallerSesiones.tallerId, tallerId),
        isNull(tallerSesiones.horaInicio),
        ne(tallerSesiones.estado, "CANCELADA"),
      ),
    );
  let n = 0;
  for (const s of pendientes) {
    const d = dias.find((x) => x.dia === diaIso(s.fecha));
    if (!d?.horaInicio || !d.horaFin) continue;
    await tx
      .update(tallerSesiones)
      .set({ horaInicio: d.horaInicio, horaFin: d.horaFin, updatedAt: new Date() })
      .where(eq(tallerSesiones.id, s.id));
    n += 1;
  }
  return n;
}

/** Nombre del taller (para los mensajes). */
export async function nombreTaller(tx: DbExecutor, tallerId: string): Promise<string> {
  const [t] = await tx
    .select({ nombre: talleres.nombre })
    .from(talleres)
    .where(eq(talleres.id, tallerId))
    .limit(1);
  return t?.nombre ?? "";
}
