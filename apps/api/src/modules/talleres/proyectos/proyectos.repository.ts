import type { ProyectosTallerDTO } from "@pis/contracts";
import {
  type DbExecutor,
  expedientes,
  gruposHorario,
  pensionesAlumno,
  pensionesTaller,
  proyectosTaller,
  proyectoTesistas,
  tallerAsistencias,
  talleres,
  tallerSesiones,
  usuarios,
} from "@pis/db";
import {
  ESTADOS_TESISTA_ACTIVO,
  esAsistenciaBaja,
  porcentajeAsistenciaCurso,
  type RegistroAsistenciaCurso,
} from "@pis/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";

/**
 * P3 pestaña Alumnos (spec v1.0 §9): proyectos con sus tesistas, grupo de
 * horario, % de asistencia y pensiones pagadas ("n de 3"). Asistencia y
 * pensiones son individuales aunque el proyecto tenga dos tesistas.
 */
export async function listarProyectos(
  tx: DbExecutor,
  tallerId: string,
): Promise<ProyectosTallerDTO | null> {
  const [t] = await tx
    .select({ estado: talleres.estado, cupo: talleres.cupoProyectos })
    .from(talleres)
    .where(eq(talleres.id, tallerId))
    .limit(1);
  if (!t) return null;
  const p = await leerParametrosTaller(tx);

  const grupos = await tx
    .select({
      id: gruposHorario.id,
      nombre: gruposHorario.nombre,
      horaInicio: gruposHorario.horaInicio,
      horaFin: gruposHorario.horaFin,
    })
    .from(gruposHorario)
    .where(and(eq(gruposHorario.tallerId, tallerId), eq(gruposHorario.activo, true)))
    .orderBy(asc(gruposHorario.nombre));

  const proyectos = await tx
    .select({
      id: proyectosTaller.id,
      codigo: proyectosTaller.codigo,
      titulo: proyectosTaller.titulo,
      programa: proyectosTaller.programa,
      modalidad: proyectosTaller.modalidad,
      grupoHorarioId: proyectosTaller.grupoHorarioId,
      expedienteCodigo: expedientes.codigo,
    })
    .from(proyectosTaller)
    .leftJoin(expedientes, eq(expedientes.id, proyectosTaller.expedienteId))
    .where(eq(proyectosTaller.tallerId, tallerId))
    .orderBy(asc(proyectosTaller.codigo));

  const ids = proyectos.map((x) => x.id);
  const tesistas = ids.length
    ? await tx
        .select({
          proyectoId: proyectoTesistas.proyectoId,
          alumnoId: proyectoTesistas.alumnoId,
          estado: proyectoTesistas.estado,
          dni: usuarios.dni,
          nombres: usuarios.nombres,
          apellidos: usuarios.apellidos,
        })
        .from(proyectoTesistas)
        .innerJoin(usuarios, eq(usuarios.id, proyectoTesistas.alumnoId))
        .where(inArray(proyectoTesistas.proyectoId, ids))
        .orderBy(asc(proyectoTesistas.orden))
    : [];
  const alumnos = tesistas.map((x) => x.alumnoId);

  const sesiones = await tx
    .select({ id: tallerSesiones.id, nro: tallerSesiones.nro, estado: tallerSesiones.estado })
    .from(tallerSesiones)
    .where(eq(tallerSesiones.tallerId, tallerId))
    .orderBy(asc(tallerSesiones.nro));
  const marcas =
    alumnos.length && sesiones.length
      ? await tx
          .select({
            sesionId: tallerAsistencias.sesionId,
            usuarioId: tallerAsistencias.usuarioId,
            estado: tallerAsistencias.estado,
          })
          .from(tallerAsistencias)
          .where(
            and(
              inArray(
                tallerAsistencias.sesionId,
                sesiones.map((s) => s.id),
              ),
              inArray(tallerAsistencias.usuarioId, alumnos),
            ),
          )
      : [];
  const marcaDe = new Map(marcas.map((m) => [`${m.sesionId}|${m.usuarioId}`, m.estado]));

  const pensiones = alumnos.length
    ? await tx
        .select({ alumnoId: pensionesAlumno.alumnoId, estado: pensionesAlumno.estado })
        .from(pensionesAlumno)
        .innerJoin(pensionesTaller, eq(pensionesTaller.id, pensionesAlumno.pensionTallerId))
        .where(
          and(eq(pensionesTaller.tallerId, tallerId), inArray(pensionesAlumno.alumnoId, alumnos)),
        )
    : [];

  const asignados = proyectos.filter(
    (x) =>
      !p.retiroLiberaCupo ||
      tesistas.some(
        (ts) =>
          ts.proyectoId === x.id &&
          (ESTADOS_TESISTA_ACTIVO as readonly string[]).includes(ts.estado),
      ),
  ).length;

  return {
    estadoTaller: t.estado,
    cupo: { asignados, cupo: t.cupo },
    grupos,
    items: proyectos.map((x) => ({
      id: x.id,
      codigo: x.codigo,
      titulo: x.titulo,
      programa: x.programa,
      modalidad: x.modalidad,
      expedienteCodigo: x.expedienteCodigo ?? null,
      grupoHorario: grupos.find((g) => g.id === x.grupoHorarioId) ?? null,
      tesistas: tesistas
        .filter((ts) => ts.proyectoId === x.id)
        .map((ts) => {
          const registros: RegistroAsistenciaCurso[] = sesiones.map((s) => ({
            sesion: s.estado,
            marca: marcaDe.get(`${s.id}|${ts.alumnoId}`) ?? null,
          }));
          const pct = porcentajeAsistenciaCurso(registros, p);
          const suyas = pensiones.filter((pa) => pa.alumnoId === ts.alumnoId);
          return {
            alumnoId: ts.alumnoId,
            dni: ts.dni,
            nombre: `${ts.nombres} ${ts.apellidos}`,
            estado: ts.estado,
            asistenciaPct: pct,
            asistenciaBaja: esAsistenciaBaja(pct, p),
            pensionesPagadas: suyas.filter((pa) => pa.estado === "VALIDADA").length,
            pensionesTotal: suyas.length,
          };
        }),
    })),
  };
}

/** Proyectos que cuentan en el cupo (para la asignación, dentro de la transacción). */
export async function proyectosEnCupo(tx: DbExecutor, tallerId: string): Promise<number> {
  const r = await listarProyectos(tx, tallerId);
  return r?.cupo.asignados ?? 0;
}

/** Taller vigente del alumno (EN_TALLER o PLAN_APROBADO), si tiene uno. */
export async function tallerActivoDe(
  tx: DbExecutor,
  alumnoId: string,
): Promise<{ id: string; nombre: string } | null> {
  const [fila] = await tx
    .select({ id: talleres.id, nombre: talleres.nombre })
    .from(proyectoTesistas)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
    .innerJoin(talleres, eq(talleres.id, proyectosTaller.tallerId))
    .where(
      and(
        eq(proyectoTesistas.alumnoId, alumnoId),
        inArray(proyectoTesistas.estado, [...ESTADOS_TESISTA_ACTIVO]),
      ),
    )
    .limit(1);
  return fila ?? null;
}
