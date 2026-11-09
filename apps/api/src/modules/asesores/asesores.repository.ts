import type { AsesorDTO, PerfilAsesorDTO } from "@pis/contracts";
import {
  asesorArchivos,
  asesorEspecialidades,
  type DbExecutor,
  db,
  encuestaPuntajes,
  encuestaRespuestas,
  especialidades,
  proyectosTaller,
  talleres,
  usuarios,
} from "@pis/db";
import { disponibilidadAsesor, ESTADOS_TALLER_VIGENTE, resultadosVisibles } from "@pis/domain";
import { and, asc, avg, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { leerParametrosTaller } from "../taller-config/taller-config.repository.js";

/**
 * Lecturas de asesores (P15 y P10). Un asesor es un usuario con rol
 * ASESOR; su "taller vigente" es el que está abierto, completo o en curso.
 */

const tallerVigente = inArray(talleres.estado, [...ESTADOS_TALLER_VIGENTE]);

/** Asesores con sus especialidades, talleres y taller vigente (todos o los indicados). */
export async function listarAsesores(
  tx: DbExecutor = db,
  ids?: readonly string[],
): Promise<AsesorDTO[]> {
  const filtro =
    ids === undefined
      ? eq(usuarios.rol, "ASESOR")
      : and(eq(usuarios.rol, "ASESOR"), inArray(usuarios.id, [...ids]));
  if (ids !== undefined && ids.length === 0) return [];
  const gente = await tx
    .select()
    .from(usuarios)
    .where(filtro)
    .orderBy(asc(usuarios.apellidos), asc(usuarios.nombres));
  if (gente.length === 0) return [];
  const idsGente = gente.map((g) => g.id);

  const susTalleres = await tx
    .select({
      id: talleres.id,
      nombre: talleres.nombre,
      asesorId: talleres.asesorId,
      vigente: sql<boolean>`${tallerVigente}`,
    })
    .from(talleres)
    .where(inArray(talleres.asesorId, idsGente))
    .orderBy(sql`${talleres.fechaInicio} desc nulls last`, desc(talleres.createdAt));

  const susEspecialidades = await tx
    .select({
      asesorId: asesorEspecialidades.asesorId,
      id: especialidades.id,
      nombre: especialidades.nombre,
    })
    .from(asesorEspecialidades)
    .innerJoin(especialidades, eq(especialidades.id, asesorEspecialidades.especialidadId))
    .where(inArray(asesorEspecialidades.asesorId, idsGente))
    .orderBy(asc(especialidades.nombre));

  return gente.map((u) => {
    const propios = susTalleres.filter((t) => t.asesorId === u.id);
    const vigente = propios.find((t) => t.vigente) ?? null;
    return {
      id: u.id,
      dni: u.dni,
      nombres: u.nombres,
      apellidos: u.apellidos,
      email: u.email,
      telefono: u.telefono,
      grado: u.grado,
      activo: u.activo,
      talleres: propios.length,
      especialidades: susEspecialidades
        .filter((e) => e.asesorId === u.id)
        .map((e) => ({ id: e.id, nombre: e.nombre })),
      tallerActual: vigente ? { id: vigente.id, nombre: vigente.nombre } : null,
      disponibilidad: disponibilidadAsesor(vigente),
    };
  });
}

export async function asesorPorId(id: string, tx: DbExecutor = db): Promise<AsesorDTO | null> {
  return (await listarAsesores(tx, [id]))[0] ?? null;
}

export async function perfilAsesor(
  id: string,
  tx: DbExecutor = db,
): Promise<PerfilAsesorDTO | null> {
  const asesor = await asesorPorId(id, tx);
  if (!asesor) return null;

  const archivos = await tx
    .select({
      id: asesorArchivos.id,
      nombre: asesorArchivos.nombreOriginal,
      bytes: asesorArchivos.bytes,
      subidoEn: asesorArchivos.createdAt,
    })
    .from(asesorArchivos)
    .where(and(eq(asesorArchivos.asesorId, id), isNull(asesorArchivos.eliminadoAt)))
    .orderBy(desc(asesorArchivos.createdAt));

  const historial = await tx
    .select({
      id: talleres.id,
      nombre: talleres.nombre,
      periodo: talleres.periodo,
      estado: talleres.estado,
      proyectos: count(proyectosTaller.id),
    })
    .from(talleres)
    .leftJoin(proyectosTaller, eq(proyectosTaller.tallerId, talleres.id))
    .where(eq(talleres.asesorId, id))
    .groupBy(talleres.id)
    .orderBy(sql`${talleres.fechaInicio} desc nulls last`, desc(talleres.createdAt));

  const [respuestas] = await tx
    .select({ n: count() })
    .from(encuestaRespuestas)
    .where(eq(encuestaRespuestas.asesorId, id));
  const [puntaje] = await tx
    .select({ promedio: avg(encuestaPuntajes.puntaje) })
    .from(encuestaPuntajes)
    .innerJoin(encuestaRespuestas, eq(encuestaRespuestas.id, encuestaPuntajes.respuestaId))
    .where(eq(encuestaRespuestas.asesorId, id));
  const parametros = await leerParametrosTaller(tx);
  const n = Number(respuestas?.n ?? 0);
  const promedio =
    puntaje?.promedio != null && resultadosVisibles(n, parametros)
      ? Math.round(Number(puntaje.promedio) * 10) / 10
      : null;

  return {
    asesor,
    archivos: archivos.map((a) => ({ ...a, subidoEn: a.subidoEn.toISOString() })),
    historial: historial.map((t) => ({ ...t, proyectos: Number(t.proyectos) })),
    encuesta: { respuestas: n, promedio, minimo: parametros.minimoRespuestasEncuesta },
  };
}

/** Especialidades activas, para autocompletar. */
export async function especialidadesActivas(
  tx: DbExecutor = db,
): Promise<Array<{ id: string; nombre: string }>> {
  return tx
    .select({ id: especialidades.id, nombre: especialidades.nombre })
    .from(especialidades)
    .where(eq(especialidades.activa, true))
    .orderBy(asc(especialidades.nombre));
}
