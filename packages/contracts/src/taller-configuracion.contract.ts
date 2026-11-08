import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Configuración del Módulo Taller de Tesis (spec v1.0 §9 P16), solo
 * Administrador: feriados, plan institucional de 12 semanas, catálogo de
 * especialidades de los asesores y parámetros "POR CONFIRMAR".
 *
 * Toda mutación devuelve la configuración completa (mismo patrón que
 * `configuracion.contract.ts`). Nada se elimina: se desactiva (§15).
 * Los cambios no alteran los talleres ya creados (copian lo vigente al crearse).
 */

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD");

export const FeriadoDTOSchema = z.object({
  id: z.string().uuid(),
  fecha,
  nombre: z.string(),
  activo: z.boolean(),
});

export const SemanaPlanDTOSchema = z.object({
  semana: z.number().int(),
  contenido: z.string(),
  entregable: z.string().nullable(),
  /** Calculados por las reglas del taller (§3): no se editan aquí. */
  esHito: z.boolean(),
  fijo: z.boolean(),
});

export const EspecialidadDTOSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  activa: z.boolean(),
  /** Asesores que la tienen en su perfil. */
  asesores: z.number().int(),
});

const ValorParametroSchema = z.union([z.number(), z.boolean()]);

export const ParametroTallerDTOSchema = z.object({
  clave: z.string(),
  etiqueta: z.string(),
  origen: z.string(),
  porConfirmar: z.boolean(),
  tipo: z.enum(["NUMERO", "SI_NO"]),
  valor: ValorParametroSchema,
  porDefecto: ValorParametroSchema,
  min: z.number().nullable(),
  max: z.number().nullable(),
  unidad: z.string().nullable(),
});

export const ConfigTallerDTOSchema = z.object({
  feriados: z.array(FeriadoDTOSchema),
  plan: z.array(SemanaPlanDTOSchema),
  especialidades: z.array(EspecialidadDTOSchema),
  parametros: z.array(ParametroTallerDTOSchema),
});

export const NuevoFeriadoSchema = z.object({
  fecha,
  nombre: z.string().max(200),
});

export const EditarFeriadoSchema = z.object({
  fecha: fecha.optional(),
  nombre: z.string().max(200).optional(),
  activo: z.boolean().optional(),
});

export const EditarSemanaPlanSchema = z.object({
  contenido: z.string().max(1000),
  entregable: z.string().max(400).nullable(),
});

export const NuevaEspecialidadSchema = z.object({
  nombre: z.string().max(200),
});

export const EditarEspecialidadSchema = z.object({
  nombre: z.string().max(200).optional(),
  activa: z.boolean().optional(),
});

export const EditarParametroSchema = z.object({
  valor: ValorParametroSchema,
});

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

export const tallerConfiguracionContract = c.router({
  ver: {
    method: "GET",
    path: "/api/configuracion/taller",
    responses: { 200: ConfigTallerDTOSchema, ...errores },
    summary: "P16 Feriados, plan institucional, especialidades y parámetros vigentes",
  },
  agregarFeriado: {
    method: "POST",
    path: "/api/configuracion/taller/feriados",
    body: NuevoFeriadoSchema,
    responses: { 201: ConfigTallerDTOSchema, ...errores },
    summary: "P16 Agregar feriado (fecha única)",
  },
  editarFeriado: {
    method: "PATCH",
    path: "/api/configuracion/taller/feriados/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: EditarFeriadoSchema,
    responses: { 200: ConfigTallerDTOSchema, ...errores },
    summary: "P16 Editar, desactivar o reactivar un feriado",
  },
  editarSemanaPlan: {
    method: "PATCH",
    path: "/api/configuracion/taller/plan/:semana",
    pathParams: z.object({ semana: z.coerce.number().int().min(1).max(12) }),
    body: EditarSemanaPlanSchema,
    responses: { 200: ConfigTallerDTOSchema, ...errores },
    summary: "P16 Editar contenido y entregable de una semana del plan institucional",
  },
  agregarEspecialidad: {
    method: "POST",
    path: "/api/configuracion/taller/especialidades",
    body: NuevaEspecialidadSchema,
    responses: { 201: ConfigTallerDTOSchema, ...errores },
    summary: "P16 Agregar especialidad (nombre único sin distinguir mayúsculas)",
  },
  editarEspecialidad: {
    method: "PATCH",
    path: "/api/configuracion/taller/especialidades/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: EditarEspecialidadSchema,
    responses: { 200: ConfigTallerDTOSchema, ...errores },
    summary: "P16 Renombrar, desactivar o reactivar una especialidad",
  },
  editarParametro: {
    method: "PATCH",
    path: "/api/configuracion/taller/parametros/:clave",
    pathParams: z.object({ clave: z.string().min(2).max(64) }),
    body: EditarParametroSchema,
    responses: { 200: ConfigTallerDTOSchema, ...errores },
    summary: "P16 Cambiar un parámetro (valida tipo y rango)",
  },
});

export type ConfigTallerDTO = z.infer<typeof ConfigTallerDTOSchema>;
export type FeriadoDTO = z.infer<typeof FeriadoDTOSchema>;
export type SemanaPlanDTO = z.infer<typeof SemanaPlanDTOSchema>;
export type EspecialidadDTO = z.infer<typeof EspecialidadDTOSchema>;
export type ParametroTallerDTO = z.infer<typeof ParametroTallerDTOSchema>;
