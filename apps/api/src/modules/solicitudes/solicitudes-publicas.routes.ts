import type { CrearSolicitudPayload } from "@pis/contracts";
import { CrearSolicitudPayloadSchema } from "@pis/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { autorizar } from "../../infra/auth/autorizacion.js";
import { entregarArchivo } from "../../infra/http/entrega-archivo.js";
import { errorEnvelope, estadoHttp, PATRON_UUID } from "../../infra/http/errores.js";
import { LocalStorageService } from "../../infra/storage/local-storage.service.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { getDocumentoSolicitudById } from "./solicitudes.repository.js";
import { CrearSolicitudUseCase } from "./use-cases/crear-solicitud/crear-solicitud.use-case.js";

const crearUC = new CrearSolicitudUseCase();
const storage = new LocalStorageService();

/**
 * Rutas nativas Fastify del módulo de solicitudes (multipart y streaming protegido).
 * - POST /api/v1/public/solicitudes                          → multipart público
 * - GET  /api/v1/solicitudes/:id/documentos/:docId/descargar → streaming protegido
 */
export function registerSolicitudesPublicasRoutes(app: FastifyInstance): void {
  /**
   * POST /api/v1/public/solicitudes
   * Recibe el formulario multipart del wizard público (Mesa de Partes Virtual).
   * Campo `datos` = JSON de CrearSolicitudPayload
   * Archivos: campo `archivo_*` por documento adjunto
   */
  app.post<{ Body: never }>(
    "/api/v1/public/solicitudes",
    async (req: FastifyRequest, reply: FastifyReply) => {
      let datosJson: string | undefined;
      const archivosTemp: Array<{
        tipo: string;
        participanteOrden: number | null;
        filename: string;
        bytes: Uint8Array;
        mimeType: string;
      }> = [];

      // Procesar campos multipart
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const bytes = new Uint8Array(await part.toBuffer());
          // El nombre del campo lleva el formato: "archivo_TIPO_PARTICIPANTE"
          const match = part.fieldname.match(/^archivo_(.+)_(\d+)$/);
          const tipo = (match?.[1] ?? part.fieldname.replace(/^archivo_/, "")) || "DOCUMENTO";
          const orden = match?.[2] ? Number(match[2]) : null;
          archivosTemp.push({
            tipo,
            participanteOrden: Number.isInteger(orden) ? orden : null,
            filename: part.filename,
            bytes,
            mimeType: part.mimetype,
          });
        } else if (part.fieldname === "datos") {
          datosJson = part.value as string;
        }
      }

      if (!datosJson) {
        await reply
          .status(400)
          .send(
            errorEnvelope(
              "VALIDACION_FALLIDA",
              'Falta el campo "datos" con el JSON de la solicitud',
            ),
          );
        return;
      }

      let payload: CrearSolicitudPayload;
      try {
        payload = CrearSolicitudPayloadSchema.parse(JSON.parse(datosJson));
      } catch {
        await reply
          .status(400)
          .send(errorEnvelope("VALIDACION_FALLIDA", "Datos de solicitud inválidos"));
        return;
      }

      const meta: { ip?: string; userAgent?: string } = {};
      if (req.ip) meta.ip = req.ip;
      if (typeof req.headers["user-agent"] === "string") meta.userAgent = req.headers["user-agent"];

      const r = await crearUC.execute(payload, archivosTemp, meta);

      if (!r.ok) {
        await reply
          .status(estadoHttp(r.error.code))
          .send(errorEnvelope(r.error.code, r.error.message));
        return;
      }

      await reply.status(201).send({ ok: true, id: r.value.id, codigo: r.value.codigo });
    },
  );

  /**
   * GET /api/v1/solicitudes/:id/documentos/:documentoId/descargar
   * Descarga o visualización protegida de archivo PDF individual.
   */
  app.get<{ Params: { id: string; documentoId: string } }>(
    "/api/v1/solicitudes/:id/documentos/:documentoId/descargar",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const { id, documentoId } = req.params;
      if (!PATRON_UUID.test(id) || !PATRON_UUID.test(documentoId)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, {
        permiso: ["solicitudes", "ver"],
        alternativas: [
          ["inscripciones", "ver"],
          ["expedientes", "ver"],
        ],
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const doc = await getDocumentoSolicitudById(id, documentoId);
      if (!doc) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
        return;
      }
      await entregarArchivo(reply, storage, doc.ruta, {
        nombre: doc.nombreOriginal,
        inline: true,
      });
    },
  );
}
