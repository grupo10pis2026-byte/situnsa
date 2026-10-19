import { createHash } from "node:crypto";
import { solicitudesContract } from "@pis/contracts";
import { estaSubsanacionVencida } from "@pis/domain";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance } from "fastify";
import { autorizar } from "../../infra/auth/autorizacion.js";
import { respuestaError, respuestaErrorConConflicto } from "../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../infra/http/manejador-errores.js";
import {
  getSolicitudById,
  getTokenSubsanacionPorHash,
  listarSolicitudes,
  sugerirCodigoSet,
} from "./solicitudes.repository.js";
import { AceptarSolicitudUseCase } from "./use-cases/aceptar-solicitud/aceptar-solicitud.use-case.js";
import {
  ActualizarConformidadDocumentoUseCase,
  ActualizarDatosMenoresUseCase,
  ObtenerDetalleSolicitudUseCase,
} from "./use-cases/gestionar-solicitud/gestionar-solicitud.use-case.js";
import { ObservarSolicitudUseCase } from "./use-cases/observar-solicitud/observar-solicitud.use-case.js";
import { RechazarSolicitudUseCase } from "./use-cases/rechazar-solicitud/rechazar-solicitud.use-case.js";
import { SubsanarSolicitudUseCase } from "./use-cases/subsanar-solicitud/subsanar-solicitud.use-case.js";

const s = initServer();

const aceptarUC = new AceptarSolicitudUseCase();
const observarUC = new ObservarSolicitudUseCase();
const rechazarUC = new RechazarSolicitudUseCase();
const actualizarDatosUC = new ActualizarDatosMenoresUseCase();
const actualizarConformidadUC = new ActualizarConformidadDocumentoUseCase();
const obtenerDetalleUC = new ObtenerDetalleSolicitudUseCase();
const subsanarUC = new SubsanarSolicitudUseCase();

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
      const a = await autorizar(request.actor, { permiso: ["solicitudes", "listar"] });
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
      const a = await autorizar(request.actor, { permiso: ["solicitudes", "aceptar"] });
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
      const a = await autorizar(request.actor, { permiso: ["solicitudes", "ver"] });
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
      const a = await autorizar(request.actor, { permiso: ["solicitudes", "editar"] });
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
      const a = await autorizar(request.actor, { permiso: ["solicitudes", "editar"] });
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
      const a = await autorizar(request.actor, { permiso: ["solicitudes", "observar"] });
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
      const a = await autorizar(request.actor, { permiso: ["solicitudes", "rechazar"] });
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
      const a = await autorizar(request.actor, { permiso: ["solicitudes", "aceptar"] });
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
    // Portal público: consultar por token (sin auth, implementado en ts-rest)
    // -----------------------------------------------------------------------
    consultarPorTokenSubsanacion: async ({ params }) => {
      const hash = createHash("sha256").update(params.token).digest("hex");
      const tokenRow = await getTokenSubsanacionPorHash(hash);

      if (!tokenRow) {
        return {
          status: 404 as const,
          body: {
            error: {
              codigo: "NO_ENCONTRADO",
              mensaje: "Enlace de subsanación no encontrado",
              correlacion: "",
            },
          },
        };
      }
      if (tokenRow.usadoAt) {
        return {
          status: 410 as const,
          body: {
            error: {
              codigo: "ENLACE_USADO",
              mensaje: "Este enlace ya fue utilizado",
              correlacion: "",
            },
          },
        };
      }
      if (estaSubsanacionVencida(tokenRow.expiraAt, new Date())) {
        return {
          status: 410 as const,
          body: {
            error: {
              codigo: "ENLACE_EXPIRADO",
              mensaje: "El enlace de subsanación ha expirado",
              correlacion: "",
            },
          },
        };
      }

      const detalle = await getSolicitudById(tokenRow.solicitudId);
      if (!detalle) {
        return {
          status: 404 as const,
          body: {
            error: { codigo: "NO_ENCONTRADO", mensaje: "Solicitud no encontrada", correlacion: "" },
          },
        };
      }

      return {
        status: 200 as const,
        body: {
          solicitud: {
            codigo: detalle.codigo,
            titulo: detalle.titulo,
            programa: detalle.programa,
            via: detalle.via,
            modalidad: detalle.modalidad,
            motivoObservacion: detalle.motivoObservacion ?? "",
            fechaLimiteSubsanacion: detalle.fechaLimiteSubsanacion ?? "",
            esPlazoVencido: detalle.esPlazoVencido,
            participantes: detalle.participantes.map((p) => ({
              orden: p.orden,
              nombres: p.nombres,
              apellidos: p.apellidos,
              dni: p.dni,
              email: p.email,
              telefono: p.telefono,
            })),
            documentos: detalle.documentos.map((d) => ({
              id: d.id,
              tipo: d.tipo,
              nombreOriginal: d.nombreOriginal,
              estadoConformidad: d.estadoConformidad,
            })),
          },
        },
      };
    },

    // -----------------------------------------------------------------------
    // Subsanación por token (ts-rest endpoint sin auth para compatibilidad)
    // -----------------------------------------------------------------------
    subsanarConToken: async ({ params, body, request }) => {
      const r = await subsanarUC.execute(params.token, body, request.ip ?? null);
      if (!r.ok) {
        const st =
          r.error.code === "NO_ENCONTRADO"
            ? (404 as const)
            : r.error.code === "TOKEN_INVALIDO" || r.error.code === "PLAZO_VENCIDO"
              ? (410 as const)
              : (400 as const);
        return {
          status: st,
          body: { error: { codigo: r.error.code, mensaje: r.error.message, correlacion: "" } },
        };
      }
      return { status: 200 as const, body: { ok: true as const, mensaje: r.value.mensaje } };
    },
  });

  app.register(s.plugin(router), OPCIONES_TS_REST);
}
