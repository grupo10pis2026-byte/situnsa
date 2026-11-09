import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Ficha de Control de Asesoría (Anexo 1, spec v1.0 §9 P11) y Cierre de
 * asesoría con el Informe de Conformidad (Anexo 21, §9 P13).
 *
 * Rutas nativas (fuera del contrato): PDF de la ficha, subir ficha firmada
 * (multipart con `semanas`), descargar firma, PDF del informe y subir el
 * informe firmado (cierra la asesoría).
 */

export const FilaFichaDTOSchema = z.object({
  id: z.string().uuid(),
  semana: z.number().int(),
  fecha: z.string().nullable(),
  avanceRevisado: z.string(),
  observacionesAcuerdos: z.string().nullable(),
  estado: z.enum(["SIN_REVISION", "REVISADO", "FIRMADO"]),
  firmaId: z.string().uuid().nullable(),
});

export const FichaDTOSchema = z.object({
  proyecto: z.object({
    id: z.string().uuid(),
    codigo: z.string(),
    titulo: z.string().nullable(),
    taller: z.string(),
    asesor: z.string().nullable(),
    tesistas: z.array(z.string()),
  }),
  filas: z.array(FilaFichaDTOSchema),
  resumen: z.object({
    registros: z.number().int(),
    firmados: z.number().int(),
    completa: z.boolean(),
    contador: z.string(),
  }),
  firmas: z.array(
    z.object({
      id: z.string().uuid(),
      nombreArchivo: z.string(),
      subidoAt: z.string(),
      semanas: z.array(z.number().int()),
    }),
  ),
  puedeEditar: z.boolean(),
});

export const RegistrarFichaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  observacionesAcuerdos: z.string().trim().min(1, "Escribe las observaciones y acuerdos").max(4000),
  /** Obligatorio si el registro ya estaba firmado (reinicia la firma). */
  motivo: z.string().max(1000).nullable().optional(),
});

export const CierreAsesoriaDTOSchema = z.object({
  proyectoId: z.string().uuid(),
  codigo: z.string(),
  titulo: z.string().nullable(),
  similitudPreliminar: z.number().nullable(),
  observacionesLevantadas: z.boolean(),
  informeGeneradoAt: z.string().nullable(),
  informeFirmado: z.boolean(),
  cerradoAt: z.string().nullable(),
  requisitos: z.object({
    borradorFinal: z.boolean(),
    fichaCompleta: z.boolean(),
    observacionesLevantadas: z.boolean(),
    similitud: z.boolean(),
  }),
  /** Por qué aún no se puede emitir el informe (null si se puede). */
  motivoNoEmitir: z.string().nullable(),
  expedienteCodigo: z.string().nullable(),
  puedeGestionar: z.boolean(),
});

export const DatosCierreSchema = z.object({
  similitudPreliminar: z.number().min(0).max(100).nullable().optional(),
  observacionesLevantadas: z.boolean().optional(),
});

export type FichaDTO = z.infer<typeof FichaDTOSchema>;
export type FilaFichaDTO = z.infer<typeof FilaFichaDTOSchema>;
export type RegistrarFichaInput = z.infer<typeof RegistrarFichaSchema>;
export type CierreAsesoriaDTO = z.infer<typeof CierreAsesoriaDTOSchema>;
export type DatosCierreInput = z.infer<typeof DatosCierreSchema>;

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const id = z.object({ id: z.string().uuid() });

export const fichaCierreContract = c.router({
  ficha: {
    method: "GET",
    path: "/api/proyectos/:id/ficha",
    pathParams: id,
    responses: { 200: FichaDTOSchema, ...errores },
    summary: "P11 Ficha de Control (6 registros)",
  },
  registrar: {
    method: "PUT",
    path: "/api/ficha/:id",
    pathParams: id,
    body: RegistrarFichaSchema,
    responses: { 200: FichaDTOSchema, ...errores },
    summary: "P11 Registrar o modificar una revisión (firmado: exige motivo)",
  },
  cierre: {
    method: "GET",
    path: "/api/proyectos/:id/cierre",
    pathParams: id,
    responses: { 200: CierreAsesoriaDTOSchema, ...errores },
    summary: "P13 Cierre de asesoría: requisitos y estado",
  },
  datosCierre: {
    method: "PATCH",
    path: "/api/proyectos/:id/cierre",
    pathParams: id,
    body: DatosCierreSchema,
    responses: { 200: CierreAsesoriaDTOSchema, ...errores },
    summary: "P13 Similitud preliminar y observaciones levantadas",
  },
});
