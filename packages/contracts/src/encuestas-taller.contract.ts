import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Encuesta de satisfacción con el asesor (spec v1.0 §9 P14, P14b, §15).
 * Anónima: la respuesta no guarda alumno ni hora; la marca "ya respondió"
 * va aparte. Los resultados se muestran con un mínimo de respuestas.
 */

export const EncuestaAlumnoDTOSchema = z.object({
  disponible: z.boolean(),
  motivo: z.string().nullable(),
  yaRespondio: z.boolean(),
  taller: z.object({ id: z.string().uuid(), nombre: z.string() }).nullable(),
  asesor: z.string().nullable(),
  periodo: z.string().nullable(),
  preguntas: z.array(z.object({ id: z.string().uuid(), texto: z.string() })),
});

export const ResponderEncuestaSchema = z.object({
  puntajes: z
    .array(z.object({ preguntaId: z.string().uuid(), puntaje: z.number().int().min(1).max(5) }))
    .min(1),
  comentario: z.string().max(2000).nullable().optional(),
});

export const ResultadoAsesorDTOSchema = z.object({
  asesorId: z.string().uuid(),
  asesor: z.string(),
  periodo: z.string(),
  respuestas: z.number().int(),
  visibles: z.boolean(),
  minimo: z.number().int(),
  promedioGeneral: z.number().nullable(),
  preguntas: z.array(z.object({ texto: z.string(), promedio: z.number().nullable() })),
  comentarios: z.array(z.string()),
});

export const ResultadosEncuestaDTOSchema = z.object({
  items: z.array(ResultadoAsesorDTOSchema),
  periodos: z.array(z.string()),
});

export type EncuestaAlumnoDTO = z.infer<typeof EncuestaAlumnoDTOSchema>;
export type ResponderEncuestaInput = z.infer<typeof ResponderEncuestaSchema>;
export type ResultadoAsesorDTO = z.infer<typeof ResultadoAsesorDTOSchema>;
export type ResultadosEncuestaDTO = z.infer<typeof ResultadosEncuestaDTOSchema>;

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

export const encuestasTallerContract = c.router({
  miEncuesta: {
    method: "GET",
    path: "/api/encuesta",
    responses: { 200: EncuestaAlumnoDTOSchema, ...errores },
    summary: "P14 Encuesta del alumno sobre su asesor",
  },
  responder: {
    method: "POST",
    path: "/api/encuesta",
    body: ResponderEncuestaSchema,
    responses: { 201: EncuestaAlumnoDTOSchema, ...errores },
    summary: "P14 Responder (anónimo; una vez por taller y período)",
  },
  resultados: {
    method: "GET",
    path: "/api/encuestas/resultados",
    query: z.object({ periodo: z.string().max(32).optional() }),
    responses: { 200: ResultadosEncuestaDTOSchema, ...errores },
    summary: "P14b Resultados por asesor (personal: todos; asesor: los suyos)",
  },
});
