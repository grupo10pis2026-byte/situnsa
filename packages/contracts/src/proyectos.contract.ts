import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Proyectos del taller (spec v1.0 §9 P3 pestaña Alumnos y §10 D1 Asignar
 * alumno). Un proyecto tiene 1 o 2 tesistas y cuenta 1 en el cupo.
 *
 * La asignación habitual la hace la validación de la inscripción (otro
 * módulo): debe llamar a la misma operación `asignar` al validar una
 * inscripción por la vía Taller. D1 sirve para agregar o corregir.
 */

export const TesistaProyectoDTOSchema = z.object({
  alumnoId: z.string().uuid(),
  dni: z.string(),
  nombre: z.string(),
  estado: z.enum(["EN_TALLER", "PLAN_APROBADO", "ASESORIA_CERRADA", "RETIRADO"]),
  /** (PRESENTE + JUSTIFICADA) / realizadas; null sin sesiones realizadas. */
  asistenciaPct: z.number().nullable(),
  asistenciaBaja: z.boolean(),
  pensionesPagadas: z.number().int(),
  pensionesTotal: z.number().int(),
});

export const GrupoHorarioResumenSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  horaInicio: z.string(),
  horaFin: z.string(),
});

export const ProyectoTallerDTOSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  titulo: z.string().nullable(),
  programa: z.string().nullable(),
  modalidad: z.string(),
  grupoHorario: GrupoHorarioResumenSchema.nullable(),
  expedienteCodigo: z.string().nullable(),
  tesistas: z.array(TesistaProyectoDTOSchema),
});

export const ProyectosTallerDTOSchema = z.object({
  items: z.array(ProyectoTallerDTOSchema),
  cupo: z.object({ asignados: z.number().int(), cupo: z.number().int() }),
  estadoTaller: z.string(),
  /** Grupos de horario activos (los crea el asesor). */
  grupos: z.array(GrupoHorarioResumenSchema),
});

/** D1: lo que se muestra al escribir el DNI (nombre y chips de validación). */
export const CandidatoTallerDTOSchema = z.object({
  dni: z.string(),
  encontrado: z.boolean(),
  nombre: z.string().nullable(),
  inscripcionValidada: z.boolean(),
  tallerActivo: z.object({ id: z.string().uuid(), nombre: z.string() }).nullable(),
  /** Por qué no se puede asignar (null si se puede). */
  motivo: z.string().nullable(),
});

export const AsignarProyectoSchema = z.object({
  dni1: z.string().max(20),
  dni2: z.string().max(20).nullable().optional(),
  grupoHorarioId: z.string().uuid().nullable().optional(),
  titulo: z.string().max(500).nullable().optional(),
  /** Programa de segunda especialidad (lo trae la inscripción; lo pide el expediente). */
  programa: z.string().max(160).nullable().optional(),
  modalidad: z.enum(["TESIS", "TRABAJO_ACADEMICO", "ARTICULO"]).optional(),
});

export type ProyectosTallerDTO = z.infer<typeof ProyectosTallerDTOSchema>;
export type ProyectoTallerDTO = z.infer<typeof ProyectoTallerDTOSchema>;
export type CandidatoTallerDTO = z.infer<typeof CandidatoTallerDTOSchema>;
export type AsignarProyectoInput = z.infer<typeof AsignarProyectoSchema>;

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const idTaller = z.object({ id: z.string().uuid() });

export const proyectosContract = c.router({
  listar: {
    method: "GET",
    path: "/api/talleres/:id/proyectos",
    pathParams: idTaller,
    responses: { 200: ProyectosTallerDTOSchema, ...errores },
    summary: "P3 Alumnos: proyectos con tesistas, grupo, asistencia y pensiones",
  },
  candidato: {
    method: "GET",
    path: "/api/talleres/:id/candidato",
    pathParams: idTaller,
    query: z.object({ dni: z.string().max(20) }),
    responses: { 200: CandidatoTallerDTOSchema, ...errores },
    summary: "D1 Datos del alumno por DNI y si se puede asignar",
  },
  asignar: {
    method: "POST",
    path: "/api/talleres/:id/proyectos",
    pathParams: idTaller,
    body: AsignarProyectoSchema,
    responses: { 201: ProyectosTallerDTOSchema, ...errores },
    summary: "D1 Asignar proyecto (1 o 2 tesistas): asistencia, 3 pensiones y avisos",
  },
});
