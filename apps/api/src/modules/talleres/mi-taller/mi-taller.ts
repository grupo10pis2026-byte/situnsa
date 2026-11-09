import { type MiTallerDTO, miTallerContract, type SesionAlumnoDTO } from "@pis/contracts";
import {
  type DbExecutor,
  db,
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
  avisoAsistenciaAlumno,
  diaIso,
  diasAtraso,
  porcentajeAsistenciaCurso,
  type RegistroAsistenciaCurso,
} from "@pis/domain";
import { initServer } from "@ts-rest/fastify";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { autorizar, denegado } from "../../../infra/auth/autorizacion.js";
import { OPCIONES_TS_REST } from "../../../infra/http/manejador-errores.js";
import { requireAuth } from "../../../middleware/require-auth.js";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";
import { hoyLima } from "../sesiones/sesiones.repository.js";

/** P7 Mi Taller del alumno y P5 lista de talleres del asesor. */

const VACIO: MiTallerDTO = {
  taller: null,
  proyecto: null,
  estadoTesista: null,
  asistencia: { porcentaje: null, realizadas: 0, aviso: null },
  sesiones: [],
  proximaSesion: null,
  pensiones: { pagadas: 0, total: 0, conDeuda: 0 },
};

export async function miTaller(
  tx: DbExecutor,
  alumnoId: string,
  hoy: string,
): Promise<MiTallerDTO> {
  const [f] = await tx
    .select({
      tallerId: talleres.id,
      nombre: talleres.nombre,
      estado: talleres.estado,
      asesorId: talleres.asesorId,
      inicio: talleres.fechaInicio,
      fin: talleres.fechaFin,
      enlaceSabado: talleres.enlaceSabado,
      enlaceDomingo: talleres.enlaceDomingo,
      proyectoId: proyectosTaller.id,
      codigo: proyectosTaller.codigo,
      titulo: proyectosTaller.titulo,
      grupoId: proyectosTaller.grupoHorarioId,
      estadoTesista: proyectoTesistas.estado,
    })
    .from(proyectoTesistas)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
    .innerJoin(talleres, eq(talleres.id, proyectosTaller.tallerId))
    .where(eq(proyectoTesistas.alumnoId, alumnoId))
    .orderBy(desc(proyectoTesistas.createdAt))
    .limit(1);
  if (!f) return VACIO;
  const parametros = await leerParametrosTaller(tx);
  const [asesor] = f.asesorId
    ? await tx
        .select({ nombres: usuarios.nombres, apellidos: usuarios.apellidos, email: usuarios.email })
        .from(usuarios)
        .where(eq(usuarios.id, f.asesorId))
        .limit(1)
    : [];
  const [grupo] = f.grupoId
    ? await tx
        .select({
          nombre: gruposHorario.nombre,
          horaInicio: gruposHorario.horaInicio,
          horaFin: gruposHorario.horaFin,
        })
        .from(gruposHorario)
        .where(eq(gruposHorario.id, f.grupoId))
        .limit(1)
    : [];
  const sesiones = await tx
    .select({ s: tallerSesiones, marca: tallerAsistencias.estado })
    .from(tallerSesiones)
    .leftJoin(
      tallerAsistencias,
      and(
        eq(tallerAsistencias.sesionId, tallerSesiones.id),
        eq(tallerAsistencias.usuarioId, alumnoId),
      ),
    )
    .where(eq(tallerSesiones.tallerId, f.tallerId))
    .orderBy(asc(tallerSesiones.fecha), asc(tallerSesiones.nro));
  const retirado = f.estadoTesista === "RETIRADO";
  const dtos: SesionAlumnoDTO[] = sesiones.map(({ s, marca }) => {
    const d = diaIso(s.fecha);
    // El grupo del alumno tiene su propio horario dentro del día (P5).
    return {
      id: s.id,
      nro: s.nro,
      fecha: s.fecha,
      horaInicio: grupo?.horaInicio ?? s.horaInicio,
      horaFin: grupo?.horaFin ?? s.horaFin,
      estado: s.estado,
      marca: marca ?? null,
      enlace: retirado
        ? null
        : d === 6
          ? f.enlaceSabado
          : d === 7
            ? f.enlaceDomingo
            : (f.enlaceSabado ?? f.enlaceDomingo),
      motivo: s.motivo,
    };
  });
  const registros: RegistroAsistenciaCurso[] = sesiones.map(({ s, marca }) => ({
    sesion: s.estado,
    marca: marca ?? null,
  }));
  const pensiones = await tx
    .select({ estado: pensionesAlumno.estado, fecha: pensionesTaller.fecha })
    .from(pensionesAlumno)
    .innerJoin(pensionesTaller, eq(pensionesTaller.id, pensionesAlumno.pensionTallerId))
    .where(and(eq(pensionesTaller.tallerId, f.tallerId), eq(pensionesAlumno.alumnoId, alumnoId)));
  return {
    taller: {
      id: f.tallerId,
      nombre: f.nombre,
      estado: f.estado,
      asesor: asesor ? `${asesor.nombres} ${asesor.apellidos}` : null,
      asesorEmail: asesor?.email ?? null,
      fechaInicio: f.inicio,
      fechaFin: f.fin,
    },
    proyecto: {
      id: f.proyectoId,
      codigo: f.codigo,
      titulo: f.titulo,
      grupo: grupo ? `${grupo.nombre} (${grupo.horaInicio}–${grupo.horaFin})` : null,
    },
    estadoTesista: f.estadoTesista,
    asistencia: {
      porcentaje: porcentajeAsistenciaCurso(registros, parametros),
      realizadas: registros.filter((r) => r.sesion === "REALIZADA").length,
      aviso: retirado ? null : avisoAsistenciaAlumno(registros, parametros),
    },
    sesiones: dtos,
    proximaSesion:
      dtos.find(
        (s) => s.fecha >= hoy && (s.estado === "PROGRAMADA" || s.estado === "REPROGRAMADA"),
      ) ?? null,
    pensiones: {
      pagadas: pensiones.filter((p) => p.estado === "VALIDADA").length,
      total: pensiones.length,
      conDeuda: pensiones.filter(
        (p) =>
          p.estado === "VENCIDA" ||
          p.estado === "OBSERVADA" ||
          (p.estado === "PENDIENTE" && diasAtraso(p, hoy) > 0),
      ).length,
    },
  };
}

const s = initServer();

function actorDe(req: FastifyRequest) {
  return req.actor ?? { id: "", dni: "desconocido" };
}

export function registerMiTallerRoutes(app: FastifyInstance): void {
  const router = s.router(miTallerContract, {
    miTaller: async ({ request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      return { status: 200 as const, body: await miTaller(db, actorDe(request).id, hoyLima()) };
    },
    talleresAsesor: async ({ request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const filas = await db
        .select({
          id: talleres.id,
          nombre: talleres.nombre,
          estado: talleres.estado,
          periodo: talleres.periodo,
          fechaInicio: talleres.fechaInicio,
          proyectos: sql<number>`(select count(*)::int from ${proyectosTaller} where ${proyectosTaller.tallerId} = ${talleres.id})`,
        })
        .from(talleres)
        .where(eq(talleres.asesorId, actorDe(request).id))
        .orderBy(sql`${talleres.fechaInicio} desc nulls last`);
      const vigente = (e: string) =>
        ["EN_CURSO", "ABIERTO_INSCRIPCIONES", "COMPLETO"].includes(e) ? 0 : 1;
      filas.sort((x, y) => vigente(x.estado) - vigente(y.estado));
      return {
        status: 200 as const,
        body: { items: filas.map((f) => ({ ...f, proyectos: Number(f.proyectos) })) },
      };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });
}
