import type { CrearSolicitudPayload } from "@pis/contracts";
import { CrearSolicitudPayloadSchema } from "@pis/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { errorEnvelope, estadoHttp } from "../../infra/http/errores.js";
import { CrearSolicitudUseCase } from "./use-cases/crear-solicitud/crear-solicitud.use-case.js";

const crearUC = new CrearSolicitudUseCase();

/**
 * Rutas públicas del módulo de solicitudes (sin autenticación).
 * - POST /api/v1/public/solicitudes   → multipart (archivos + JSON de datos)
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
          // El nombre del campo lleva el tipo: "archivo_TIPO_PARTICIPANTE"
          const segmentos = part.fieldname.split("_");
          const tipo = segmentos[1] ?? part.fieldname;
          const orden = segmentos[2] ? Number(segmentos[2]) : null;
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
}
