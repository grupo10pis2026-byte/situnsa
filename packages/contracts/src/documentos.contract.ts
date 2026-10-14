import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

export const VistoBuenoSchema = z.object({
  aprobado: z.boolean(),
  comentario: z.string().max(2000).optional(),
});

export const VistoBuenoDTOSchema = z.object({
  id: z.string().uuid(),
  estado: z.string(),
  version: z.number(),
});

export const DocumentoMetadataSchema = z.object({
  id: z.string().uuid(),
  expedienteId: z.string().uuid(),
  tipo: z.string(),
  etapa: z.string(),
  version: z.number(),
  sha256: z.string().length(64),
  estado: z.enum(["PENDIENTE", "CARGADO", "OBSERVADO", "APROBADO", "RECHAZADO"]),
});

/** Respuesta del upload multipart (ruta nativa Fastify, ver documentos.routes). */
export const SubirDocumentoResponseSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  version: z.number(),
  sha256: z.string(),
  estado: z.string(),
});

/** "Insertar datos en documentos" (HU-0017/0018/0020/0030). */
export const GenerarDocumentosSchema = z.object({
  /** E1/E2: formatos del tesista · E6: informe para Secretaría Académica (HU-0045). */
  etapa: z.enum(["E1", "E2", "E6"]),
});

export const GenerarDocumentosDTOSchema = z.object({
  generados: z.array(
    z.object({
      id: z.string().uuid(),
      tipo: z.string(),
      nombre: z.string(),
      version: z.number(),
      pendientes: z.array(z.string()),
    }),
  ),
});

export const SeveridadHallazgoSchema = z.enum(["ADVERTENCIA", "INFO", "ERROR"]);
export type SeveridadHallazgo = z.infer<typeof SeveridadHallazgoSchema>;

export const EstadoRevisionDocumentoSchema = z.enum([
  "PENDIENTE",
  "EN_PROCESO",
  "COMPLETADO",
  "FALLIDO",
]);
export type EstadoRevisionDocumento = z.infer<typeof EstadoRevisionDocumentoSchema>;

export const HallazgoRevisionSchema = z.object({
  campo: z.string(),
  mensaje: z.string(),
  severidad: SeveridadHallazgoSchema,
  esperado: z.string().optional(),
  encontrado: z.string().optional(),
});
export type HallazgoRevision = z.infer<typeof HallazgoRevisionSchema>;

export const DocumentoRevisionDTOSchema = z.object({
  id: z.string().uuid(),
  documentoId: z.string().uuid(),
  expedienteId: z.string().uuid(),
  estado: EstadoRevisionDocumentoSchema,
  hallazgos: z.array(HallazgoRevisionSchema),
  paginasAnalizadas: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DocumentoRevisionDTO = z.infer<typeof DocumentoRevisionDTOSchema>;

const c = initContract();

export const documentosContract = c.router({
  metadata: {
    method: "GET",
    path: "/api/documentos/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: DocumentoMetadataSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Metadatos de documento",
  },
  descargar: {
    method: "GET",
    path: "/api/documentos/:id/descargar",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      302: z.void(),
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Descarga protegida vía X-Accel-Redirect (Nginx)",
  },
  generar: {
    method: "POST",
    path: "/api/expedientes/:id/documentos/generar",
    pathParams: z.object({ id: z.string().uuid() }),
    body: GenerarDocumentosSchema,
    responses: {
      200: GenerarDocumentosDTOSchema,
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Genera los formatos de la etapa con los datos del expediente (PDF)",
  },
  descargarGenerado: {
    method: "GET",
    path: "/api/documentos-generados/:id/descargar",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: z.unknown(),
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Descarga del formato generado (PDF)",
  },
  vistoBueno: {
    method: "POST",
    path: "/api/documentos/:id/visto-bueno",
    pathParams: z.object({ id: z.string().uuid() }),
    body: VistoBuenoSchema,
    responses: {
      200: VistoBuenoDTOSchema,
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "V°B° académico del documento (RN-08: no cierra subetapa)",
  },
  revision: {
    method: "GET",
    path: "/api/documentos/:id/revision",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: DocumentoRevisionDTOSchema.nullable(),
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Informe de revisión automática de documento",
  },
});
