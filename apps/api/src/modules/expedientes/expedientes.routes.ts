import { ExpedienteDetalleDTOSchema, expedientesContract } from "@pis/contracts";
import { db, usuarios } from "@pis/db";
import { initServer } from "@ts-rest/fastify";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { autorizar, denegado, esPersonal, type Perfil } from "../../infra/auth/autorizacion.js";
import { presenciaExpedienteManager } from "./servicios/presencia-expediente.service.js";
import {
  errorEnvelope,
  respuestaError,
  respuestaErrorConConflicto,
} from "../../infra/http/errores.js";
import { buscarRespuesta, guardarRespuesta, leerClave } from "../../infra/http/idempotencia.js";
import { OPCIONES_TS_REST } from "../../infra/http/manejador-errores.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  type AlcanceListado,
  getDetalleById,
  listarExpedientes,
} from "./expedientes.repository.js";
import { ActualizarDatosUseCase } from "./use-cases/actualizar-datos/actualizar-datos.use-case.js";
import { AnularExpedienteUseCase } from "./use-cases/anular-expediente/anular-expediente.use-case.js";
import { EnviarAccesoParticipantesUseCase } from "./use-cases/enviar-acceso/enviar-acceso.use-case.js";
import { InscribirPlanUseCase } from "./use-cases/inscribir-plan/inscribir-plan.use-case.js";
import { LevantarObservacionUseCase } from "./use-cases/levantar-observacion/levantar-observacion.use-case.js";
import { PublicarMensajeUseCase } from "./use-cases/publicar-mensaje/publicar-mensaje.use-case.js";
import { ValidarInscripcionUseCase } from "./use-cases/validar-inscripcion/validar-inscripcion.use-case.js";

const s = initServer();

/**
 * Alcance del listado según los roles RBAC (RN-06/RN-07): personal → todo;
 * asesor/jurado → asignados; el resto (tesista) → solo sus expedientes.
 */
function alcanceDe(perfil: Perfil, dni: string): AlcanceListado {
  if (esPersonal(perfil.roles)) return { tipo: "TODO" };
  if (perfil.roles.includes("ASESOR") || perfil.roles.includes("JURADO")) {
    return { tipo: "ASESOR", dni };
  }
  return { tipo: "PARTICIPANTE", dni };
}

export function registerExpedientesRoutes(app: FastifyInstance): void {
  const router = s.router(expedientesContract, {
    inscribirPlan: async ({ body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["expedientes", "crear"] });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const clave = leerClave(request.headers);
      if (clave) {
        const previa = await buscarRespuesta(clave);
        if (previa?.respuesta && typeof previa.respuesta === "object") {
          const replay = previa.respuesta as { id: string; codigo: string };
          if (typeof replay.id === "string" && typeof replay.codigo === "string") {
            return { status: 201 as const, body: replay };
          }
        }
      }
      const r = await new InscribirPlanUseCase().execute(body, request.actor);
      if (!r.ok) {
        const e = respuestaErrorConConflicto(r.error);
        if (e.status === 409) return { status: 409 as const, body: e.body };
        if (e.status === 403) return { status: 403 as const, body: e.body };
        return { status: 400 as const, body: e.body };
      }
      if (clave) {
        await guardarRespuesta(clave, "POST", "/api/expedientes/inscribir-plan", 201, r.value);
      }
      return { status: 201 as const, body: r.value };
    },
    validar: async ({ params, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["inscripciones", "aprobar"],
        expedienteId: params.id,
      });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new ValidarInscripcionUseCase().execute(params.id, actor);
      if (!r.ok) return respuestaError(r.error);
      return { status: 200 as const, body: ExpedienteDetalleDTOSchema.parse(r.value.detalle) };
    },
    levantarObservacion: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["seguimiento", "editar"],
        alternativas: [["inscripciones", "aprobar"]],
        expedienteId: params.id,
      });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new LevantarObservacionUseCase().execute(params.id, body.comentario, actor);
      if (!r.ok) return respuestaError(r.error);
      return { status: 200 as const, body: r.value };
    },
    enviarAcceso: async ({ params, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["expedientes", "editar"],
        expedienteId: params.id,
      });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new EnviarAccesoParticipantesUseCase().execute(params.id, actor);
      if (!r.ok) return respuestaError(r.error);
      return { status: 200 as const, body: r.value };
    },
    publicarMensaje: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["notificaciones", "crear"],
        expedienteId: params.id,
      });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new PublicarMensajeUseCase().execute(params.id, body.texto, actor);
      if (!r.ok) {
        return {
          status: 404 as const,
          body: errorEnvelope(r.error.code, r.error.message),
        };
      }
      return { status: 201 as const, body: r.value };
    },
    anular: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["expedientes", "eliminar"],
        expedienteId: params.id,
      });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new AnularExpedienteUseCase().execute(params.id, body.motivo, actor);
      if (!r.ok) return respuestaError(r.error);
      return { status: 200 as const, body: ExpedienteDetalleDTOSchema.parse(r.value) };
    },
    getById: async ({ params, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["expedientes", "ver"],
        expedienteId: params.id,
      });
      if (!a.ok) return denegado(a);
      const detalle = await getDetalleById(db, params.id);
      if (!detalle)
        return {
          status: 404 as const,
          body: errorEnvelope("NO_ENCONTRADO", "Expediente no encontrado"),
        };
      return { status: 200 as const, body: ExpedienteDetalleDTOSchema.parse(detalle) };
    },
    actualizarDatos: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["expedientes", "editar"],
        expedienteId: params.id,
      });
      if (!a.ok) return denegado(a);
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await new ActualizarDatosUseCase().execute(params.id, body, actor);
      if (!r.ok) {
        if (r.error.code === "CONFLICTO_CONCURRENCIA") {
          const actual = await getDetalleById(db, params.id);
          return {
            status: 409 as const,
            body: {
              ...errorEnvelope(r.error.code, r.error.message),
              updatedAt: actual?.updatedAt ?? new Date().toISOString(),
            },
          };
        }
        const e = respuestaErrorConConflicto(r.error);
        if (e.status === 409) return { status: 409 as const, body: e.body };
        if (e.status === 404) return { status: 404 as const, body: e.body };
        if (e.status === 403) return { status: 403 as const, body: e.body };
        return { status: 400 as const, body: e.body };
      }
      return { status: 200 as const, body: ExpedienteDetalleDTOSchema.parse(r.value) };
    },
    listar: async ({ query, request }) => {
      const a = await autorizar(request.actor, { permiso: ["expedientes", "ver"] });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const r = await listarExpedientes(db, {
        q: query.q,
        estado: query.estado,
        orden: query.orden,
        page: query.page,
        limit: query.limit,
        alcance: alcanceDe(a.perfil, request.actor?.dni ?? ""),
      });
      return { status: 200 as const, body: r };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });

  /** Detección de concurrencia: aviso de usuarios simultáneos en el expediente. */
  app.post<{ Params: { id: string }; Body?: { nombre?: string } }>(
    "/api/expedientes/:id/presencia",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const a = await autorizar(req.actor, {
        permiso: ["expedientes", "ver"],
        expedienteId: req.params.id,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const actor = req.actor ?? { id: "", dni: "desconocido", rol: "PERSONAL" };
      let nombre = req.body?.nombre;
      if (!nombre && actor.id) {
        const u = await db
          .select({ nombres: usuarios.nombres, apellidos: usuarios.apellidos })
          .from(usuarios)
          .where(eq(usuarios.id, actor.id))
          .limit(1);
        if (u[0]) nombre = `${u[0].nombres} ${u[0].apellidos}`.trim();
      }
      const concurrentes = presenciaExpedienteManager.registrarPresencia(req.params.id, {
        id: actor.id,
        nombre: nombre || actor.dni,
        rol: actor.rol,
      });
      await reply.status(200).send({ concurrentes });
    },
  );
}
