import { solicitudesContract } from "@pis/contracts";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance } from "fastify";
import { autorizar } from "../../infra/auth/autorizacion.js";
import {
  errorEnvelope,
  respuestaError,
  respuestaErrorConConflicto,
} from "../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../infra/http/manejador-errores.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { getMiSolicitud, listarSolicitudes, sugerirCodigoSet } from "./solicitudes.repository.js";
import { AceptarSolicitudUseCase } from "./use-cases/aceptar-solicitud/aceptar-solicitud.use-case.js";
import {
  ActualizarConformidadDocumentoUseCase,
  ActualizarDatosMenoresUseCase,
  ObtenerDetalleSolicitudUseCase,
} from "./use-cases/gestionar-solicitud/gestionar-solicitud.use-case.js";
import { ObservarSolicitudUseCase } from "./use-cases/observar-solicitud/observar-solicitud.use-case.js";
import { RechazarSolicitudUseCase } from "./use-cases/rechazar-solicitud/rechazar-solicitud.use-case.js";

const s = initServer();

const aceptarUC = new AceptarSolicitudUseCase();
const observarUC = new ObservarSolicitudUseCase();
const rechazarUC = new RechazarSolicitudUseCase();
const actualizarDatosUC = new ActualizarDatosMenoresUseCase();
const actualizarConformidadUC = new ActualizarConformidadDocumentoUseCase();
const obtenerDetalleUC = new ObtenerDetalleSolicitudUseCase();

/**
 * Rutas administrativas del módulo de solicitudes.
 * Implementan el contrato ts-rest `solicitudesContract`.
 * Autenticación Bearer JWT requerida en todos los endpoints.
 */
export function registerSolicitudesAdminRoutes(app: FastifyInstance): void {
  const router = s.router(solicitudesContract, {
    // -----------------------------------------------------------------------
    // Bandeja con filtros y KPIs
    // -----------------------------------------------------------------------
    listar: async ({ query, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["solicitudes", "listar"],
        alternativas: [
          ["inscripciones", "ver"],
          // No `expedientes.ver`: lo tiene TESISTA y abriría la bandeja ajena.
          ["reportes", "ver"],
        ],
      });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const { items, meta, kpis } = await listarSolicitudes(query);
      return { status: 200 as const, body: { items, meta, kpis } };
    },

    // -----------------------------------------------------------------------
    // Código SET sugerido para el modal de aceptación
    // -----------------------------------------------------------------------
    sugerirCodigoSet: async ({ request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["solicitudes", "aceptar"],
        alternativas: [
          ["inscripciones", "aprobar"],
          ["expedientes", "crear"],
        ],
      });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const codigoSugerido = await sugerirCodigoSet();
      return { status: 200 as const, body: { codigoSugerido } };
    },

    // -----------------------------------------------------------------------
    // Detalle completo (transiciona NUEVA → EN_REVISION al abrir)
    // -----------------------------------------------------------------------
    obtenerPorId: async ({ params, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["solicitudes", "ver"],
        alternativas: [
          ["inscripciones", "ver"],
          // No `expedientes.ver`: lo tiene TESISTA y abriría la bandeja ajena.
          ["reportes", "ver"],
        ],
      });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await obtenerDetalleUC.execute(params.id, actor, request.ip ?? null);
      if (!r.ok)
        return {
          status: 404 as const,
          body: { error: { codigo: r.error.code, mensaje: r.error.message, correlacion: "" } },
        };
      return { status: 200 as const, body: { solicitud: r.value } };
    },

    // -----------------------------------------------------------------------
    // Corrección de datos menores
    // -----------------------------------------------------------------------
    actualizarDatosMenores: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["solicitudes", "editar"],
        alternativas: [
          ["inscripciones", "editar"],
          ["expedientes", "editar"],
        ],
      });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await actualizarDatosUC.execute(params.id, body, actor, request.ip ?? null);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },

    // -----------------------------------------------------------------------
    // Conformidad de documento (checklist)
    // -----------------------------------------------------------------------
    actualizarConformidadDocumento: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["solicitudes", "editar"],
        alternativas: [
          ["inscripciones", "editar"],
          ["documentos", "ver"],
          ["expedientes", "editar"],
        ],
      });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await actualizarConformidadUC.execute(
        params.id,
        params.documentoId,
        body,
        actor,
        request.ip ?? null,
      );
      if (!r.ok) return respuestaError(r.error);
      return { status: 200 as const, body: r.value };
    },

    // -----------------------------------------------------------------------
    // Observar solicitud
    // -----------------------------------------------------------------------
    observar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["solicitudes", "observar"],
        alternativas: [
          ["inscripciones", "aprobar"],
          ["expedientes", "editar"],
        ],
      });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await observarUC.execute(params.id, body, actor, request.ip ?? null);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },

    // -----------------------------------------------------------------------
    // Rechazar solicitud
    // -----------------------------------------------------------------------
    rechazar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["solicitudes", "rechazar"],
        alternativas: [
          ["inscripciones", "aprobar"],
          ["expedientes", "editar"],
        ],
      });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await rechazarUC.execute(params.id, body, actor, request.ip ?? null);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },

    // -----------------------------------------------------------------------
    // Aceptar solicitud y generar expediente SET
    // -----------------------------------------------------------------------
    aceptar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["solicitudes", "aceptar"],
        alternativas: [
          ["inscripciones", "aprobar"],
          ["expedientes", "crear"],
        ],
      });
      if (!a.ok) {
        if (a.status === 401) return { status: 401 as const, body: a.body };
        return { status: 403 as const, body: a.body };
      }
      const actor = request.actor ?? { id: "", dni: "desconocido" };
      const r = await aceptarUC.execute(params.id, body, actor, request.ip ?? null);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return {
        status: 200 as const,
        body: {
          ok: true as const,
          expedienteId: r.value.expedienteId,
          codigoSet: r.value.codigoSet,
        },
      };
    },

    // -----------------------------------------------------------------------
    // Portal del tesista: su propia solicitud (alcance = participante)
    // -----------------------------------------------------------------------
    miSolicitud: async ({ request }) => {
      if (!request.actor) {
        return {
          status: 401 as const,
          body: errorEnvelope("SIN_SESION", "Se requiere autenticación"),
        };
      }
      const solicitud = await getMiSolicitud(request.actor.id);
      return { status: 200 as const, body: { solicitud } };
    },
  });

  void app.register(async (scoped) => {
    scoped.addHook("preHandler", async (req, reply) => requireAuth(req, reply));
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });
}
