/**
 * Esquemas de entrada/salida de POST /api/documentos/:id/analisis; no ejecutan lógica ni acceden a DB.
 * Los consumen documentos.contract.ts, la ruta nativa de API y el cliente web.
 */
import { z } from "zod";

/** Salida orientativa de POST /api/documentos/:id/analisis, compartida entre API y web. */
export const HallazgoDocumentoSchema = z
  .object({
    tipo: z.string().min(1).max(64),
    mensaje: z.string().min(1).max(1000),
    severidad: z.enum(["ADVERTENCIA", "INFO"]),
    pagina: z.number().int().min(1).max(3).optional(),
    evidencia: z.string().max(500).optional(),
    sugerencia: z.string().max(1000).optional(),
  })
  .strict();

/** Solo acepta la opción editorial; nunca rutas del cliente ni metadatos del expediente. */
export const AnalisisDocumentoRequestSchema = z
  .object({
    revisionEditorial: z.boolean().default(false),
  })
  .strict();

/** Resultado ligado a documento/versión/hash; COMPLETADO no equivale a visto bueno académico. */
export const AnalisisDocumentoResponseSchema = z
  .object({
    documentoId: z.string().uuid(),
    version: z.number().int().positive(),
    sha256: z.string().length(64),
    paginasAnalizadas: z.array(z.number().int().min(1).max(3)).max(3),
    estado: z.enum(["COMPLETADO", "PARCIAL", "NO_EVALUABLE"]),
    tituloRegistrado: z.string(),
    tituloDetectado: z.string().nullable(),
    similitudTitulo: z.number().min(0).max(100).nullable(),
    resumen: z.string().max(100_000),
    resumenCompleto: z.boolean(),
    controles: z
      .array(
        z
          .object({
            tipo: z.string(),
            estado: z.enum(["CONFORME", "ADVERTENCIA", "NO_EVALUABLE"]),
            mensaje: z.string(),
          })
          .strict(),
      )
      .max(30),
    hallazgos: z.array(HallazgoDocumentoSchema).max(100),
    editorial: z.enum(["NO_SOLICITADA", "COMPLETADA", "NO_DISPONIBLE"]),
  })
  .strict();

export type AnalisisDocumentoDTO = z.infer<typeof AnalisisDocumentoResponseSchema>;
