import type { CrearSolicitudPayload, SubsanacionPortalRespuesta } from "@pis/contracts";
import { CrearSolicitudPayloadSchema } from "@pis/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { autorizar } from "../../infra/auth/autorizacion.js";
import { entregarArchivo } from "../../infra/http/entrega-archivo.js";
import { errorEnvelope, estadoHttp, PATRON_UUID } from "../../infra/http/errores.js";
import { LocalStorageService } from "../../infra/storage/local-storage.service.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { esParticipanteDeSolicitud, getDocumentoSolicitudById } from "./solicitudes.repository.js";
import { CrearSolicitudUseCase } from "./use-cases/crear-solicitud/crear-solicitud.use-case.js";
import {
  type ArchivoSubsanacion,
  SubsanarSolicitudUseCase,
} from "./use-cases/subsanar-solicitud/subsanar-solicitud.use-case.js";

const crearUC = new CrearSolicitudUseCase();
const subsanarUC = new SubsanarSolicitudUseCase();
const storage = new LocalStorageService();

/**
 * Rutas nativas Fastify del módulo de solicitudes (multipart y streaming protegido).
 * - POST /api/v1/public/solicitudes                          → multipart público
 * - POST /api/v1/mi-solicitud/:id/subsanar                   → multipart del tesista
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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Datos de solicitud inválidos";
        await reply.status(400).send(errorEnvelope("VALIDACION_FALLIDA", msg));
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
   * POST /api/v1/mi-solicitud/:id/subsanar
   * Portal del tesista: reemplaza documentos de su solicitud OBSERVADA y la
   * reenvía a revisión. Un campo `archivo_<documentoId>` por documento.
   */
  app.post<{ Params: { id: string } }>(
    "/api/v1/mi-solicitud/:id/subsanar",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const actor = req.actor;
      if (!actor) {
        await reply.status(401).send(errorEnvelope("SIN_SESION", "Se requiere autenticación"));
        return;
      }
      if (!PATRON_UUID.test(req.params.id)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Solicitud no encontrada"));
        return;
      }
      const archivos: ArchivoSubsanacion[] = [];
      for await (const part of req.parts()) {
        if (part.type !== "file") continue;
        const documentoId = part.fieldname.replace(/^archivo_/, "");
        const bytes = new Uint8Array(await part.toBuffer());
        if (!PATRON_UUID.test(documentoId)) continue;
        archivos.push({ documentoId, filename: part.filename, bytes });
      }
      const r = await subsanarUC.execute(req.params.id, actor, archivos, req.ip ?? null);
      if (!r.ok) {
        await reply
          .status(estadoHttp(r.error.code))
          .send(errorEnvelope(r.error.code, r.error.message));
        return;
      }
      const cuerpo: SubsanacionPortalRespuesta = {
        ok: true,
        mensaje: r.value.mensaje,
        documentosActualizados: r.value.documentosActualizados,
      };
      await reply.status(200).send(cuerpo);
    },
  );

  /**
   * GET /api/v1/solicitudes/:id/documentos/:documentoId/descargar
   * Descarga o visualización protegida de un archivo (PDF o fotografía JPG).
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
      // Alcance: el participante ve sus propios archivos desde el portal; el
      // resto requiere permiso administrativo (403 auditado).
      const propia = req.actor ? await esParticipanteDeSolicitud(id, req.actor.id) : false;
      if (!propia) {
        const a = await autorizar(req.actor, {
          permiso: ["solicitudes", "ver"],
          alternativas: [
            ["inscripciones", "ver"],
            ["reportes", "ver"],
          ],
        });
        if (!a.ok) {
          await reply.status(a.status).send(a.body);
          return;
        }
      }
      const doc = await getDocumentoSolicitudById(id, documentoId);
      if (!doc) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
        return;
      }
      // El MIME real (no el PDF por defecto): sin esto la foto JPG llegaba
      // etiquetada como PDF y el visor administrativo no podía mostrarla.
      await entregarArchivo(reply, storage, doc.ruta, {
        nombre: doc.nombreOriginal,
        inline: true,
        contentType: mimeEntregable(doc.mimeType),
      });
    },
  );
}

/**
 * MIME con el que se entrega un documento de solicitud. Solo se reenvían
 * tipos de lista blanca (nunca text/html u otro tipo activo declarado por el
 * navegador al subir); filas antiguas pueden traer "image/jpg" o PNG.
 */
export function mimeEntregable(mime: string): string {
  const m = mime.trim().toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg" || m === "image/pjpeg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  return "application/pdf";
}
