/**
 * Registro de oficios y decretos: consulta y vínculos (ts-rest) + importación
 * del Excel maestro (multipart, ruta nativa Fastify).
 */
import { numeracionContract } from "@pis/contracts";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance } from "fastify";
import { autorizar, denegado } from "../../infra/auth/autorizacion.js";
import { errorEnvelope, estadoHttp, respuestaErrorConConflicto } from "../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../infra/http/manejador-errores.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  listarRegistros,
  numeracionExpediente,
  ultimaImportacion,
} from "./numeracion.repository.js";
import { DesvincularNumeroUseCase } from "./use-cases/desvincular-numero/desvincular-numero.use-case.js";
import {
  ImportarRegistroUseCase,
  TAMANO_MAXIMO_EXCEL,
} from "./use-cases/importar-registro/importar-registro.use-case.js";
import { VincularNumeroUseCase } from "./use-cases/vincular-numero/vincular-numero.use-case.js";

const s = initServer();

/** Los oficios y decretos los emite el área de titulación (E1). */
const PERMISO_EDITAR = { permiso: ["expedientes", "editar"] as [string, string] };

export function registerNumeracionRoutes(app: FastifyInstance): void {
  const router = s.router(numeracionContract, {
    listarRegistros: async ({ query, request }) => {
      const a = await autorizar(request.actor, { permiso: ["expedientes", "ver"] });
      if (!a.ok) return denegado(a);
      const [lista, ultima] = await Promise.all([listarRegistros(query), ultimaImportacion()]);
      return { status: 200 as const, body: { ...lista, ultimaImportacion: ultima } };
    },
    numeracionExpediente: async ({ params, request }) => {
      const a = await autorizar(request.actor, {
        permiso: ["expedientes", "ver"],
        expedienteId: params.id,
      });
      if (!a.ok) return denegado(a);
      const dto = await numeracionExpediente(params.id);
      if (!dto) {
        return {
          status: 404 as const,
          body: errorEnvelope("NO_ENCONTRADO", "Expediente no encontrado"),
        };
      }
      return { status: 200 as const, body: dto };
    },
    vincularNumero: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { ...PERMISO_EDITAR, expedienteId: params.id });
      if (!a.ok) return denegado(a);
      const r = await new VincularNumeroUseCase().execute({
        expedienteId: params.id,
        tipo: params.tipo,
        numero: body.numero,
        actor: request.actor ?? { id: "", dni: "desconocido" },
      });
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      const dto = await numeracionExpediente(params.id);
      if (!dto) {
        return {
          status: 404 as const,
          body: errorEnvelope("NO_ENCONTRADO", "Expediente no encontrado"),
        };
      }
      return { status: 200 as const, body: dto };
    },
    desvincularNumero: async ({ params, request }) => {
      const a = await autorizar(request.actor, { ...PERMISO_EDITAR, expedienteId: params.id });
      if (!a.ok) return denegado(a);
      const r = await new DesvincularNumeroUseCase().execute({
        expedienteId: params.id,
        tipo: params.tipo,
        actor: request.actor ?? { id: "", dni: "desconocido" },
      });
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      const dto = await numeracionExpediente(params.id);
      if (!dto) {
        return {
          status: 404 as const,
          body: errorEnvelope("NO_ENCONTRADO", "Expediente no encontrado"),
        };
      }
      return { status: 200 as const, body: dto };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });

  /** POST /api/numeracion/importar (multipart: file .xlsx) → resumen de la importación. */
  app.post(
    "/api/numeracion/importar",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const a = await autorizar(req.actor, PERMISO_EDITAR);
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const data = await req.file({
        limits: { files: 1, fields: 0, parts: 1, fileSize: TAMANO_MAXIMO_EXCEL },
      });
      if (!data) {
        await reply
          .status(400)
          .send(errorEnvelope("VALIDACION_FALLIDA", "Adjunte el Excel de oficios y decretos"));
        return;
      }
      const bytes = await data.toBuffer();
      if (data.file.truncated) {
        await reply
          .status(400)
          .send(errorEnvelope("DOCUMENTO_INVALIDO", "El archivo supera el límite de 15 MB"));
        return;
      }
      const r = await new ImportarRegistroUseCase().execute({
        nombreArchivo: data.filename,
        bytes,
        actor: req.actor ?? { id: "", dni: "desconocido" },
      });
      if (!r.ok) {
        await reply
          .status(estadoHttp(r.error.code))
          .send(errorEnvelope(r.error.code, r.error.message));
        return;
      }
      await reply.status(201).send(r.value);
    },
  );
}
