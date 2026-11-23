import type { TallerDetalleDTO, TallerDTO } from "@pis/contracts";
import {
  asesorEspecialidades,
  type DbExecutor,
  especialidades,
  gruposHorario,
  pensionesAlumno,
  pensionesTaller,
  planTaller,
  proyectosTaller,
  tallerDias,
  talleres,
  tallerSesiones,
  usuarios,
} from "@pis/db";
import { textoHorario, tieneHorario } from "@pis/domain";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { enlaceReunion, horariosDeGrupos } from "./grupos-horario.js";

export type TallerDetalle = TallerDetalleDTO;
export type TallerResumen = TallerDTO;

/**
 * P1/P3: taller con conteos, días, pensiones y calendario.
 */
export async function detalleTaller(
  db: DbExecutor,
  tallerId: string,
): Promise<TallerDetalle | null> {
  const [t] = await db.select().from(talleres).where(eq(talleres.id, tallerId)).limit(1);
  if (!t) return null;
  const [asesor] = t.asesorId
    ? await db
        .select({ dni: usuarios.dni, nombres: usuarios.nombres, apellidos: usuarios.apellidos })
        .from(usuarios)
        .where(eq(usuarios.id, t.asesorId))
        .limit(1)
    : [];
  const especialidadesAsesor = t.asesorId
    ? await db
        .select({ nombre: especialidades.nombre })
        .from(asesorEspecialidades)
        .innerJoin(especialidades, eq(especialidades.id, asesorEspecialidades.especialidadId))
        .where(eq(asesorEspecialidades.asesorId, t.asesorId))
        .orderBy(asc(especialidades.nombre))
    : [];
  const dias = await db
    .select({ dia: tallerDias.dia, horaInicio: tallerDias.horaInicio, horaFin: tallerDias.horaFin })
    .from(tallerDias)
    .where(eq(tallerDias.tallerId, tallerId))
    .orderBy(asc(tallerDias.dia));
  const calendario = await db
    .select({
      nro: tallerSesiones.nro,
      fecha: tallerSesiones.fecha,
      horaInicio: tallerSesiones.horaInicio,
      horaFin: tallerSesiones.horaFin,
      estado: tallerSesiones.estado,
    })
    .from(tallerSesiones)
    .where(eq(tallerSesiones.tallerId, tallerId))
    .orderBy(asc(tallerSesiones.nro));
  const [proyectos] = await db
    .select({ n: count() })
    .from(proyectosTaller)
    .where(eq(proyectosTaller.tallerId, tallerId));
  const pensiones = await db
    .select({
      id: pensionesTaller.id,
      numero: pensionesTaller.numero,
      semana: pensionesTaller.semana,
      fecha: pensionesTaller.fecha,
      monto: pensionesTaller.monto,
    })
    .from(pensionesTaller)
    .where(eq(pensionesTaller.tallerId, tallerId))
    .orderBy(asc(pensionesTaller.numero));
  const pagadas = pensiones.length
    ? await db
        .select({ pensionTallerId: pensionesAlumno.pensionTallerId, n: count() })
        .from(pensionesAlumno)
        .where(
          and(
            inArray(
              pensionesAlumno.pensionTallerId,
              pensiones.map((p) => p.id),
            ),
            eq(pensionesAlumno.estado, "VALIDADA"),
          ),
        )
        .groupBy(pensionesAlumno.pensionTallerId)
    : [];
  const [plan] = await db
    .select({ n: count() })
    .from(planTaller)
    .where(eq(planTaller.tallerId, tallerId));
  const realizadas = calendario.filter((s) => s.estado === "REALIZADA").length;
  return {
    id: t.id,
    nombre: t.nombre,
    asesorId: t.asesorId,
    asesorNombre: asesor ? `${asesor.nombres} ${asesor.apellidos}` : null,
    asesorDni: asesor?.dni ?? null,
    periodo: t.periodo,
    estado: t.estado,
    fechaInicio: t.fechaInicio,
    fechaFin: t.fechaFin,
    numeroSesiones: t.numeroSesiones,
    dias,
    cupoProyectos: t.cupoProyectos,
    proyectos: Number(proyectos?.n ?? 0),
    enlaceReunion: enlaceReunion(t),
    enlaceRevisar: t.enlaceRevisar,
    enlaceDescartado: t.enlaceDescartado,
    conHorario: tieneHorario(dias),
    sesiones: { realizadas, total: calendario.length },
    asesorEspecialidades: especialidadesAsesor.map((e) => e.nombre),
    pensiones: pensiones.map((p) => ({
      numero: p.numero,
      semana: p.semana,
      fecha: p.fecha,
      monto: p.monto,
      pagadas: Number(pagadas.find((x) => x.pensionTallerId === p.id)?.n ?? 0),
    })),
    calendario,
    motivoCancelacion: t.motivoCancelacion,
    planSemanas: Number(plan?.n ?? 0),
    fechasEditables: realizadas === 0,
    grupos: await distribucionGrupos(db, tallerId),
  };
}

/** Adenda 1.2 A2: la Secretaría solo ve la distribución de proyectos por grupo. */
async function distribucionGrupos(db: DbExecutor, tallerId: string) {
  const grupos = await db
    .select({ id: gruposHorario.id, nombre: gruposHorario.nombre })
    .from(gruposHorario)
    .where(and(eq(gruposHorario.tallerId, tallerId), eq(gruposHorario.activo, true)))
    .orderBy(asc(gruposHorario.nombre));
  if (grupos.length === 0) return [];
  const horarios = await horariosDeGrupos(
    db,
    grupos.map((g) => g.id),
  );
  const conteo = await db
    .select({ grupoId: proyectosTaller.grupoHorarioId, n: count() })
    .from(proyectosTaller)
    .where(eq(proyectosTaller.tallerId, tallerId))
    .groupBy(proyectosTaller.grupoHorarioId);
  return grupos.map((g) => ({
    id: g.id,
    nombre: g.nombre,
    horario: textoHorario(horarios.get(g.id) ?? []),
    proyectos: Number(conteo.find((c) => c.grupoId === g.id)?.n ?? 0),
  }));
}

/** P1: el detalle sin lo que solo usa P3. */
export function resumenTaller(d: TallerDetalle): TallerResumen {
  const {
    asesorEspecialidades: _e,
    pensiones: _p,
    calendario: _c,
    motivoCancelacion: _m,
    planSemanas: _ps,
    fechasEditables: _f,
    grupos: _g,
    ...resumen
  } = d;
  return resumen;
}
