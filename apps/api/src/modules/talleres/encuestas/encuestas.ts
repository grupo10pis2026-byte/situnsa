import {
  type EncuestaAlumnoDTO,
  encuestasTallerContract,
  type ResultadosEncuestaDTO,
} from "@pis/contracts";
import {
  type DbExecutor,
  db,
  encuestaParticipaciones,
  encuestaPreguntas,
  encuestaPuntajes,
  encuestaRespuestas,
  proyectosTaller,
  proyectoTesistas,
  talleres,
  usuarios,
} from "@pis/db";
import {
  DomainError,
  fail,
  ok,
  promedioPuntaje,
  type Result,
  resultadosVisibles,
  validarPuntajes,
} from "@pis/domain";
import { initServer } from "@ts-rest/fastify";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { autorizar, denegado, esPersonal } from "../../../infra/auth/autorizacion.js";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import { errorEnvelope } from "../../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../../infra/http/manejador-errores.js";
import { requireAuth } from "../../../middleware/require-auth.js";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";
import { respuestaDominio } from "../taller-http.js";

/**
 * P14/P14b (spec v1.0 §9, §15): encuesta anónima sobre el asesor. La
 * respuesta no guarda alumno ni hora; `encuesta_participaciones` solo marca
 * que el alumno ya respondió en ese taller y período.
 */

interface Contexto {
  tallerId: string;
  taller: string;
  estadoTaller: string;
  asesorId: string | null;
  asesor: string | null;
  periodo: string;
  estadoTesista: string;
}

async function contextoAlumno(tx: DbExecutor, alumnoId: string): Promise<Contexto | null> {
  const [f] = await tx
    .select({
      tallerId: talleres.id,
      taller: talleres.nombre,
      estadoTaller: talleres.estado,
      asesorId: talleres.asesorId,
      periodo: talleres.periodo,
      inicio: talleres.fechaInicio,
      estadoTesista: proyectoTesistas.estado,
    })
    .from(proyectoTesistas)
    .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
    .innerJoin(talleres, eq(talleres.id, proyectosTaller.tallerId))
    .where(eq(proyectoTesistas.alumnoId, alumnoId))
    .orderBy(desc(proyectoTesistas.createdAt))
    .limit(1);
  if (!f) return null;
  const [a] = f.asesorId
    ? await tx
        .select({ nombres: usuarios.nombres, apellidos: usuarios.apellidos })
        .from(usuarios)
        .where(eq(usuarios.id, f.asesorId))
        .limit(1)
    : [];
  return {
    tallerId: f.tallerId,
    taller: f.taller,
    estadoTaller: f.estadoTaller,
    asesorId: f.asesorId,
    asesor: a ? `${a.nombres} ${a.apellidos}` : null,
    periodo: f.periodo ?? (f.inicio ? f.inicio.slice(0, 4) : String(new Date().getFullYear())),
    estadoTesista: f.estadoTesista,
  };
}

function motivoNoDisponible(c: Contexto): string | null {
  if (c.estadoTesista === "RETIRADO") return "Retirado: no participas en la encuesta";
  if (!c.asesorId) return "El taller no tiene asesor asignado";
  if (c.estadoTaller !== "EN_CURSO" && c.estadoTaller !== "FINALIZADO")
    return "La encuesta se abre cuando el taller está en curso";
  return null;
}

export async function encuestaDeAlumno(
  tx: DbExecutor,
  alumnoId: string,
): Promise<EncuestaAlumnoDTO> {
  const c = await contextoAlumno(tx, alumnoId);
  const preguntas = await tx
    .select({ id: encuestaPreguntas.id, texto: encuestaPreguntas.texto })
    .from(encuestaPreguntas)
    .where(eq(encuestaPreguntas.activa, true))
    .orderBy(asc(encuestaPreguntas.orden));
  if (!c)
    return {
      disponible: false,
      motivo: "Aún no estás en un taller",
      yaRespondio: false,
      taller: null,
      asesor: null,
      periodo: null,
      preguntas,
    };
  const [p] = await tx
    .select({ alumnoId: encuestaParticipaciones.alumnoId })
    .from(encuestaParticipaciones)
    .where(
      and(
        eq(encuestaParticipaciones.tallerId, c.tallerId),
        eq(encuestaParticipaciones.alumnoId, alumnoId),
        eq(encuestaParticipaciones.periodo, c.periodo),
      ),
    )
    .limit(1);
  const motivo = motivoNoDisponible(c);
  return {
    disponible: motivo === null && !p,
    motivo: p ? "Ya respondiste la encuesta. ¡Gracias!" : motivo,
    yaRespondio: Boolean(p),
    taller: { id: c.tallerId, nombre: c.taller },
    asesor: c.asesor,
    periodo: c.periodo,
    preguntas,
  };
}

export async function responderEncuesta(
  alumnoId: string,
  input: {
    puntajes: Array<{ preguntaId: string; puntaje: number }>;
    comentario?: string | null | undefined;
  },
): Promise<Result<true, DomainError>> {
  const v = validarPuntajes(input.puntajes.map((p) => p.puntaje));
  if (!v.ok) return v;
  return new DrizzleUnitOfWork(db).run(async (tx) => {
    const c = await contextoAlumno(tx, alumnoId);
    if (!c) return fail(new DomainError("REQUISITO_PENDIENTE", "Aún no estás en un taller"));
    const motivo = motivoNoDisponible(c);
    if (motivo || !c.asesorId)
      return fail(new DomainError("REQUISITO_PENDIENTE", motivo ?? "Sin asesor"));
    const activas = await tx
      .select({ id: encuestaPreguntas.id })
      .from(encuestaPreguntas)
      .where(eq(encuestaPreguntas.activa, true));
    if (input.puntajes.some((p) => !activas.some((a) => a.id === p.preguntaId)))
      return fail(
        new DomainError("VALIDACION_FALLIDA", "Hay una pregunta que no es de la encuesta"),
      );
    if (new Set(input.puntajes.map((p) => p.preguntaId)).size !== input.puntajes.length)
      return fail(new DomainError("VALIDACION_FALLIDA", "Una pregunta está repetida"));
    // La marca va primero: la PK impide responder dos veces (incluso en paralelo).
    const marca = await tx
      .insert(encuestaParticipaciones)
      .values({ tallerId: c.tallerId, alumnoId, periodo: c.periodo })
      .onConflictDoNothing()
      .returning({ alumnoId: encuestaParticipaciones.alumnoId });
    if (marca.length === 0)
      return fail(new DomainError("TRANSICION_INVALIDA", "Ya respondiste la encuesta"));
    const [r] = await tx
      .insert(encuestaRespuestas)
      .values({
        tallerId: c.tallerId,
        asesorId: c.asesorId,
        periodo: c.periodo,
        comentario: input.comentario?.trim() || null,
      })
      .returning({ id: encuestaRespuestas.id });
    if (!r) return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo guardar"));
    await tx.insert(encuestaPuntajes).values(
      input.puntajes.map((p) => ({
        respuestaId: r.id,
        preguntaId: p.preguntaId,
        puntaje: p.puntaje,
      })),
    );
    return ok(true);
  });
}

export async function resultadosEncuesta(
  tx: DbExecutor,
  filtro: { asesorId?: string; periodo?: string | undefined },
): Promise<ResultadosEncuestaDTO> {
  const parametros = await leerParametrosTaller(tx);
  const condiciones = [
    ...(filtro.asesorId ? [eq(encuestaRespuestas.asesorId, filtro.asesorId)] : []),
    ...(filtro.periodo ? [eq(encuestaRespuestas.periodo, filtro.periodo)] : []),
  ];
  const respuestas = await tx
    .select({
      id: encuestaRespuestas.id,
      asesorId: encuestaRespuestas.asesorId,
      periodo: encuestaRespuestas.periodo,
      comentario: encuestaRespuestas.comentario,
    })
    .from(encuestaRespuestas)
    .where(condiciones.length ? and(...condiciones) : undefined);
  const periodos = [
    ...new Set(
      (await tx.select({ periodo: encuestaRespuestas.periodo }).from(encuestaRespuestas)).map(
        (p) => p.periodo,
      ),
    ),
  ]
    .sort()
    .reverse();
  if (respuestas.length === 0) return { items: [], periodos };
  const puntajes = await tx
    .select({
      respuestaId: encuestaPuntajes.respuestaId,
      preguntaId: encuestaPuntajes.preguntaId,
      puntaje: encuestaPuntajes.puntaje,
    })
    .from(encuestaPuntajes)
    .where(
      inArray(
        encuestaPuntajes.respuestaId,
        respuestas.map((r) => r.id),
      ),
    );
  const preguntas = await tx.select().from(encuestaPreguntas).orderBy(asc(encuestaPreguntas.orden));
  const asesores = await tx
    .select({ id: usuarios.id, nombres: usuarios.nombres, apellidos: usuarios.apellidos })
    .from(usuarios)
    .where(inArray(usuarios.id, [...new Set(respuestas.map((r) => r.asesorId))]));
  const grupos = new Map<string, typeof respuestas>();
  for (const r of respuestas) {
    const k = `${r.asesorId}|${r.periodo}`;
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }
  const items = [...grupos.entries()].map(([k, rs]) => {
    const [asesorId = "", periodo = ""] = k.split("|");
    const ids = new Set(rs.map((r) => r.id));
    const propios = puntajes.filter((p) => ids.has(p.respuestaId));
    const visibles = resultadosVisibles(rs.length, parametros);
    const a = asesores.find((x) => x.id === asesorId);
    return {
      asesorId,
      asesor: a ? `${a.nombres} ${a.apellidos}` : "—",
      periodo,
      respuestas: rs.length,
      visibles,
      minimo: parametros.minimoRespuestasEncuesta,
      promedioGeneral: visibles ? promedioPuntaje(propios.map((p) => p.puntaje)) : null,
      preguntas: visibles
        ? preguntas
            .filter((q) => propios.some((p) => p.preguntaId === q.id))
            .map((q) => ({
              texto: q.texto,
              promedio: promedioPuntaje(
                propios.filter((p) => p.preguntaId === q.id).map((p) => p.puntaje),
              ),
            }))
        : [],
      // Comentarios en orden aleatorio estable (sin pista de quién o cuándo).
      comentarios: visibles
        ? rs
            .map((r) => r.comentario)
            .filter((x): x is string => !!x)
            .sort()
        : [],
    };
  });
  items.sort((x, y) => y.periodo.localeCompare(x.periodo) || x.asesor.localeCompare(y.asesor));
  return { items, periodos };
}

const s = initServer();

function actorDe(req: FastifyRequest) {
  return req.actor ?? { id: "", dni: "desconocido" };
}

export function registerEncuestasTallerRoutes(app: FastifyInstance): void {
  const router = s.router(encuestasTallerContract, {
    miEncuesta: async ({ request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      return { status: 200 as const, body: await encuestaDeAlumno(db, actorDe(request).id) };
    },
    responder: async ({ body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const r = await responderEncuesta(actorDe(request).id, body);
      if (!r.ok) return respuestaDominio(r.error);
      return { status: 201 as const, body: await encuestaDeAlumno(db, actorDe(request).id) };
    },
    resultados: async ({ query, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const personal = esPersonal(a.perfil.roles);
      const asesor = a.perfil.roles.includes("ASESOR");
      if (!personal && !asesor)
        return { status: 403 as const, body: errorEnvelope("FUERA_DE_ALCANCE", "Sin alcance") };
      return {
        status: 200 as const,
        body: await resultadosEncuesta(db, {
          ...(personal ? {} : { asesorId: actorDe(request).id }),
          periodo: query.periodo,
        }),
      };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });
}
