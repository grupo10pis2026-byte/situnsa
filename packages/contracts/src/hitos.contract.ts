import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Plan del taller, hitos y entregas (spec v1.0 §9 P6, P6b, P7 y §10 D3).
 *
 * - Plan: 12 semanas copiadas del plan institucional; el asesor edita el
 *   contenido y las indicaciones (el entregable y los hitos son fijos).
 * - Hitos: 7 por proyecto (semanas 2, 4, 6, 8, 10, 11 y 12). El asesor los
 *   habilita en orden; el alumno sube versiones (PDF/Word) que nunca se
 *   editan ni se borran; el asesor revisa la última (Conforme/Observada).
 * - D3 Aprobar plan: crea el expediente de titulación (Etapa 1) con el
 *   Anexo 18 y pasa a los tesistas a PLAN_APROBADO.
 *
 * Subir una versión (multipart), descargar un archivo y "Descargar todo"
 * (ZIP) son rutas nativas fuera del contrato (ver hitos.routes.ts).
 */

export const TipoHitoSchema = z.enum([
  "PLAN",
  "AVANCE_1",
  "AVANCE_2",
  "AVANCE_3",
  "AVANCE_4",
  "BORRADOR_INTEGRADO",
  "BORRADOR_FINAL",
]);

export const EstadoHitoSchema = z.enum([
  "NO_HABILITADO",
  "HABILITADO",
  "ENTREGADO",
  "APROBADO",
  "OBSERVADO",
  "NO_ENTREGADO",
]);

export const EstadoVersionSchema = z.enum(["ENTREGADA", "CONFORME", "OBSERVADA"]);

export const PlanSemanaDTOSchema = z.object({
  semana: z.number().int(),
  /** Sábado de la semana (inicio del fin de semana de clases). */
  fecha: z.string(),
  contenido: z.string(),
  entregable: z.string().nullable(),
  indicaciones: z.string().nullable(),
  esHito: z.boolean(),
  fijo: z.boolean(),
  hito: z.object({ tipo: TipoHitoSchema, nombre: z.string(), fechaLimite: z.string() }).nullable(),
});

export const PlanTallerDTOSchema = z.object({
  tallerId: z.string().uuid(),
  semanas: z.array(PlanSemanaDTOSchema),
  editable: z.boolean(),
});

export const EditarSemanaPlanTallerSchema = z.object({
  contenido: z.string().trim().min(1).max(2000),
  indicaciones: z.string().max(4000).nullable().optional(),
});

export const UltimaVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  estado: EstadoVersionSchema,
  entregadaAt: z.string(),
});

export const HitoCeldaDTOSchema = z.object({
  id: z.string().uuid(),
  tipo: TipoHitoSchema,
  nombre: z.string(),
  semana: z.number().int(),
  fechaLimite: z.string(),
  estado: EstadoHitoSchema,
  fijo: z.boolean(),
  versiones: z.number().int(),
  ultimaVersion: UltimaVersionSchema.nullable(),
  /** Vencido sin entrega (aún no pasó por el proceso nocturno). */
  vencido: z.boolean(),
});

export const MatrizHitosDTOSchema = z.object({
  tallerId: z.string().uuid(),
  hitos: z.array(
    z.object({
      tipo: TipoHitoSchema,
      nombre: z.string(),
      semana: z.number().int(),
      fechaLimite: z.string(),
      fijo: z.boolean(),
    }),
  ),
  proyectos: z.array(
    z.object({
      id: z.string().uuid(),
      codigo: z.string(),
      titulo: z.string().nullable(),
      tesistas: z.array(z.string()),
      expedienteCodigo: z.string().nullable(),
      hitos: z.array(HitoCeldaDTOSchema),
    }),
  ),
  puedeGestionar: z.boolean(),
});

export const VersionEntregaDTOSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  nombreArchivo: z.string(),
  bytes: z.number().int(),
  comentario: z.string().nullable(),
  entregadaPor: z.string(),
  entregadaAt: z.string(),
  estado: EstadoVersionSchema,
  observaciones: z.string().nullable(),
  revisadaPor: z.string().nullable(),
  revisadaAt: z.string().nullable(),
});

export const HitoDetalleDTOSchema = HitoCeldaDTOSchema.extend({
  versionesDetalle: z.array(VersionEntregaDTOSchema),
  /** Por qué el alumno no puede subir ahora (null si puede). */
  motivoNoSubir: z.string().nullable(),
});

export const TesistaEntregasSchema = z.object({
  alumnoId: z.string().uuid(),
  dni: z.string(),
  nombre: z.string(),
  estado: z.enum(["EN_TALLER", "PLAN_APROBADO", "ASESORIA_CERRADA", "RETIRADO"]),
});

export const EntregasProyectoDTOSchema = z.object({
  proyecto: z.object({
    id: z.string().uuid(),
    codigo: z.string(),
    titulo: z.string().nullable(),
    programa: z.string().nullable(),
    modalidad: z.string(),
    tallerId: z.string().uuid(),
    tallerNombre: z.string(),
    asesor: z.string().nullable(),
    expedienteId: z.string().uuid().nullable(),
    expedienteCodigo: z.string().nullable(),
    tesistas: z.array(TesistaEntregasSchema),
  }),
  hitos: z.array(HitoDetalleDTOSchema),
  fichaCompleta: z.boolean(),
  capacidades: z.object({
    subir: z.boolean(),
    revisar: z.boolean(),
    gestionar: z.boolean(),
  }),
  formatos: z.array(z.string()),
  maxMb: z.number(),
});

export const RevisarEntregaSchema = z.object({
  resultado: z.enum(["CONFORME", "OBSERVADA"]),
  observaciones: z.string().max(4000).nullable().optional(),
});

export const FechaHitoSchema = z.object({
  fechaLimite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

/** D3: datos precargados y advertencias antes de confirmar. */
export const PreviaAprobacionDTOSchema = z.object({
  puede: z.boolean(),
  motivo: z.string().nullable(),
  advertencias: z.array(z.string()),
  bloquean: z.boolean(),
  titulo: z.string().nullable(),
  programa: z.string().nullable(),
  modalidad: z.string(),
  asesor: z.string().nullable(),
  tesistas: z.array(z.object({ dni: z.string(), nombre: z.string() })),
  versionAprobada: z.number().int().nullable(),
});

export const AprobarPlanSchema = z.object({
  titulo: z.string().trim().min(10, "El título debe tener al menos 10 caracteres").max(500),
  programa: z.string().min(3).max(160),
  modalidad: z.enum(["TESIS", "TRABAJO_ACADEMICO", "ARTICULO"]),
});

export type TipoHitoDTO = z.infer<typeof TipoHitoSchema>;
export type EstadoHitoDTO = z.infer<typeof EstadoHitoSchema>;
export type PlanTallerDTO = z.infer<typeof PlanTallerDTOSchema>;
export type PlanSemanaDTO = z.infer<typeof PlanSemanaDTOSchema>;
export type MatrizHitosDTO = z.infer<typeof MatrizHitosDTOSchema>;
export type HitoCeldaDTO = z.infer<typeof HitoCeldaDTOSchema>;
export type HitoDetalleDTO = z.infer<typeof HitoDetalleDTOSchema>;
export type VersionEntregaDTO = z.infer<typeof VersionEntregaDTOSchema>;
export type EntregasProyectoDTO = z.infer<typeof EntregasProyectoDTOSchema>;
export type PreviaAprobacionDTO = z.infer<typeof PreviaAprobacionDTOSchema>;
export type AprobarPlanInput = z.infer<typeof AprobarPlanSchema>;
export type RevisarEntregaInput = z.infer<typeof RevisarEntregaSchema>;

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const id = z.object({ id: z.string().uuid() });

export const hitosContract = c.router({
  plan: {
    method: "GET",
    path: "/api/talleres/:id/plan",
    pathParams: id,
    responses: { 200: PlanTallerDTOSchema, ...errores },
    summary: "P6/P7 Plan del taller (12 semanas)",
  },
  editarPlan: {
    method: "PATCH",
    path: "/api/talleres/:id/plan/:semana",
    pathParams: z.object({ id: z.string().uuid(), semana: z.coerce.number().int().min(1).max(12) }),
    body: EditarSemanaPlanTallerSchema,
    responses: { 200: PlanTallerDTOSchema, ...errores },
    summary: "P6 Editar contenido e indicaciones de una semana (avisa a los alumnos)",
  },
  matriz: {
    method: "GET",
    path: "/api/talleres/:id/hitos",
    pathParams: id,
    responses: { 200: MatrizHitosDTOSchema, ...errores },
    summary: "P6 Matriz proyectos × hitos",
  },
  habilitarTodos: {
    method: "POST",
    path: "/api/talleres/:id/hitos/:tipo/habilitar",
    pathParams: z.object({ id: z.string().uuid(), tipo: TipoHitoSchema }),
    body: z.object({}).optional(),
    responses: { 200: MatrizHitosDTOSchema, ...errores },
    summary: "P6 Habilitar un hito en los proyectos que ya pueden recibirlo",
  },
  entregas: {
    method: "GET",
    path: "/api/proyectos/:id/entregas",
    pathParams: id,
    responses: { 200: EntregasProyectoDTOSchema, ...errores },
    summary: "P6b/P7 Hitos y versiones de un proyecto",
  },
  habilitar: {
    method: "POST",
    path: "/api/hitos/:id/habilitar",
    pathParams: id,
    body: z.object({}).optional(),
    responses: { 200: EntregasProyectoDTOSchema, ...errores },
    summary: "P6b Habilitar un hito (el anterior debe estar aprobado)",
  },
  ajustarFecha: {
    method: "PATCH",
    path: "/api/hitos/:id/fecha",
    pathParams: id,
    body: FechaHitoSchema,
    responses: { 200: EntregasProyectoDTOSchema, ...errores },
    summary: "P6b Ajustar la fecha límite (no en los hitos de las semanas 2 y 12)",
  },
  reabrir: {
    method: "POST",
    path: "/api/hitos/:id/reabrir",
    pathParams: id,
    body: FechaHitoSchema,
    responses: { 200: EntregasProyectoDTOSchema, ...errores },
    summary: "P6b Habilitar nueva entrega de un hito no entregado",
  },
  revisar: {
    method: "POST",
    path: "/api/entregas/:id/revisar",
    pathParams: id,
    body: RevisarEntregaSchema,
    responses: { 200: EntregasProyectoDTOSchema, ...errores },
    summary: "P6b Revisar la última versión (Conforme / Observada)",
  },
  previaAprobacion: {
    method: "GET",
    path: "/api/proyectos/:id/aprobar-plan",
    pathParams: id,
    responses: { 200: PreviaAprobacionDTOSchema, ...errores },
    summary: "D3 Datos y advertencias antes de aprobar el plan",
  },
  aprobarPlan: {
    method: "POST",
    path: "/api/proyectos/:id/aprobar-plan",
    pathParams: id,
    body: AprobarPlanSchema,
    responses: { 200: EntregasProyectoDTOSchema, ...errores },
    summary: "D3 Aprobar plan: crea el expediente (Etapa 1) y genera el Anexo 18",
  },
});
