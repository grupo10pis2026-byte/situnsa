import type {
  AsistenciaSesionDTO,
  GrupoHorarioDTO,
  SesionesTallerDTO,
  SesionTallerDTO,
} from "@pis/contracts";
import {
  asistenciaGrupos,
  type DbExecutor,
  gruposHorario,
  proyectosTaller,
  proyectoTesistas,
  tallerAsistencias,
  tallerSesiones,
  usuarios,
} from "@pis/db";
import {
  ESTADOS_TESISTA_ACTIVO,
  porcentajeAsistenciaCurso,
  puedeRegistrarAsistencia,
  type RegistroAsistenciaCurso,
} from "@pis/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";

/** Lecturas de P4/P5: sesiones, grupos de horario y asistencia por grupo. */

export function hoyLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export interface Tesista {
  alumnoId: string;
  nombre: string;
  email: string;
  proyectoId: string;
  proyecto: string;
  grupoHorarioId: string | null;
}

/** Tesistas activos (EN_TALLER o PLAN_APROBADO) del taller. */
export async function tesistasActivos(tx: DbExecutor, tallerId: string): Promise<Tesista[]> {
  const filas = await tx
    .select({
      alumnoId: proyectoTesistas.alumnoId,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
      email: usuarios.email,
      proyectoId: proyectosTaller.id,
      proyecto: proyectosTaller.codigo,
      grupoHorarioId: proyectosTaller.grupoHorarioId,
    })
    .from(proyectoTesistas)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
    .innerJoin(usuarios, eq(usuarios.id, proyectoTesistas.alumnoId))
    .where(
      and(
        eq(proyectosTaller.tallerId, tallerId),
        inArray(proyectoTesistas.estado, [...ESTADOS_TESISTA_ACTIVO]),
      ),
    )
    .orderBy(asc(proyectosTaller.codigo), asc(proyectoTesistas.orden));
  return filas.map((f) => ({
    alumnoId: f.alumnoId,
    nombre: `${f.nombres} ${f.apellidos}`,
    email: f.email,
    proyectoId: f.proyectoId,
    proyecto: f.proyecto,
    grupoHorarioId: f.grupoHorarioId,
  }));
}

function aDto(
  s: typeof tallerSesiones.$inferSelect,
  guardados: string[],
  hoy: string,
): SesionTallerDTO {
  const gate = puedeRegistrarAsistencia({ estado: s.estado, fecha: s.fecha }, hoy);
  return {
    id: s.id,
    nro: s.nro,
    fecha: s.fecha,
    horaInicio: s.horaInicio,
    horaFin: s.horaFin,
    estado: s.estado,
    fechaOriginal: s.fechaOriginal,
    motivo: s.motivo,
    gruposGuardados: guardados,
    motivoNoRegistrar: gate.ok ? null : gate.error.message,
  };
}

export async function sesionesDelTaller(
  tx: DbExecutor,
  tallerId: string,
  permisos: { puedeRegistrar: boolean; puedeProgramar: boolean },
): Promise<SesionesTallerDTO> {
  const hoy = hoyLima();
  const filas = await tx
    .select()
    .from(tallerSesiones)
    .where(eq(tallerSesiones.tallerId, tallerId))
    .orderBy(asc(tallerSesiones.fecha), asc(tallerSesiones.nro));
  const guardados = filas.length
    ? await tx
        .select({ sesionId: asistenciaGrupos.sesionId, grupoId: asistenciaGrupos.grupoHorarioId })
        .from(asistenciaGrupos)
        .where(
          inArray(
            asistenciaGrupos.sesionId,
            filas.map((s) => s.id),
          ),
        )
    : [];
  const { grupos, sinGrupo } = await gruposDelTaller(tx, tallerId);
  return {
    sesiones: filas.map((s) =>
      aDto(
        s,
        guardados.filter((g) => g.sesionId === s.id).map((g) => g.grupoId),
        hoy,
      ),
    ),
    restantes: filas.filter((s) => s.estado === "PROGRAMADA" || s.estado === "REPROGRAMADA").length,
    total: filas.filter((s) => s.estado !== "CANCELADA").length,
    grupos,
    proyectosSinGrupo: sinGrupo,
    ...permisos,
  };
}

/** Grupos activos con sus proyectos y la asistencia promedio de sus tesistas. */
export async function gruposDelTaller(
  tx: DbExecutor,
  tallerId: string,
): Promise<{
  grupos: GrupoHorarioDTO[];
  sinGrupo: Array<{ id: string; codigo: string; tesistas: string[] }>;
}> {
  const grupos = await tx
    .select()
    .from(gruposHorario)
    .where(and(eq(gruposHorario.tallerId, tallerId), eq(gruposHorario.activo, true)))
    .orderBy(asc(gruposHorario.nombre));
  const tesistas = await tesistasActivos(tx, tallerId);
  const proyectos = await tx
    .select({
      id: proyectosTaller.id,
      codigo: proyectosTaller.codigo,
      grupoHorarioId: proyectosTaller.grupoHorarioId,
    })
    .from(proyectosTaller)
    .where(eq(proyectosTaller.tallerId, tallerId))
    .orderBy(asc(proyectosTaller.codigo));
  const conTesistas = proyectos
    .map((p) => ({
      ...p,
      tesistas: tesistas.filter((t) => t.proyectoId === p.id),
    }))
    .filter((p) => p.tesistas.length > 0);

  const sesiones = await tx
    .select({ id: tallerSesiones.id, estado: tallerSesiones.estado })
    .from(tallerSesiones)
    .where(eq(tallerSesiones.tallerId, tallerId))
    .orderBy(asc(tallerSesiones.fecha));
  const marcas =
    sesiones.length && tesistas.length
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
  const p = await leerParametrosTaller(tx);
  const pct = (alumnoId: string) => {
    const registros: RegistroAsistenciaCurso[] = sesiones.map((s) => ({
      sesion: s.estado,
      marca: marcas.find((m) => m.sesionId === s.id && m.usuarioId === alumnoId)?.estado ?? null,
    }));
    return porcentajeAsistenciaCurso(registros, p);
  };

  return {
    grupos: grupos.map((g) => {
      const suyos = conTesistas.filter((x) => x.grupoHorarioId === g.id);
      const valores = suyos
        .flatMap((x) => x.tesistas.map((t) => pct(t.alumnoId)))
        .filter((v): v is number => v !== null);
      return {
        id: g.id,
        nombre: g.nombre,
        horaInicio: g.horaInicio,
        horaFin: g.horaFin,
        proyectos: suyos.map((x) => ({
          id: x.id,
          codigo: x.codigo,
          tesistas: x.tesistas.map((t) => t.nombre),
        })),
        asistenciaPromedio: valores.length
          ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length)
          : null,
      };
    }),
    sinGrupo: conTesistas
      .filter((x) => x.grupoHorarioId === null || !grupos.some((g) => g.id === x.grupoHorarioId))
      .map((x) => ({ id: x.id, codigo: x.codigo, tesistas: x.tesistas.map((t) => t.nombre) })),
  };
}

export async function asistenciaDeSesion(
  tx: DbExecutor,
  sesionId: string,
  alertas: string[] = [],
): Promise<AsistenciaSesionDTO | null> {
  const [s] = await tx
    .select()
    .from(tallerSesiones)
    .where(eq(tallerSesiones.id, sesionId))
    .limit(1);
  if (!s) return null;
  const tesistas = await tesistasActivos(tx, s.tallerId);
  const marcas = await tx
    .select()
    .from(tallerAsistencias)
    .where(eq(tallerAsistencias.sesionId, sesionId));
  const guardados = await tx
    .select({ grupoId: asistenciaGrupos.grupoHorarioId })
    .from(asistenciaGrupos)
    .where(eq(asistenciaGrupos.sesionId, sesionId));
  const grupos = await tx
    .select({ id: gruposHorario.id, nombre: gruposHorario.nombre })
    .from(gruposHorario)
    .where(and(eq(gruposHorario.tallerId, s.tallerId), eq(gruposHorario.activo, true)))
    .orderBy(asc(gruposHorario.nombre));
  const alumnosDe = (grupoId: string | null) =>
    tesistas
      .filter((t) =>
        grupoId === null
          ? t.grupoHorarioId === null || !grupos.some((g) => g.id === t.grupoHorarioId)
          : t.grupoHorarioId === grupoId,
      )
      .map((t) => {
        const m = marcas.find((x) => x.usuarioId === t.alumnoId);
        return {
          alumnoId: t.alumnoId,
          nombre: t.nombre,
          proyecto: t.proyecto,
          estado: m?.estado ?? ("PENDIENTE" as const),
          marcadaAt: m?.marcadaAt?.toISOString() ?? null,
          motivo: m?.motivo ?? null,
        };
      });
  const bloques = grupos.map((g) => ({
    id: g.id as string | null,
    nombre: g.nombre,
    guardado: guardados.some((x) => x.grupoId === g.id),
    alumnos: alumnosDe(g.id),
  }));
  const sinGrupo = alumnosDe(null);
  if (sinGrupo.length > 0)
    bloques.push({
      id: null,
      nombre: grupos.length ? "Sin grupo" : "Todos",
      guardado: sinGrupo.every((a) => a.estado !== "PENDIENTE"),
      alumnos: sinGrupo,
    });
  const guardadosIds = guardados.map((g) => g.grupoId);
  return { sesion: aDto(s, guardadosIds, hoyLima()), grupos: bloques, alertas };
}
