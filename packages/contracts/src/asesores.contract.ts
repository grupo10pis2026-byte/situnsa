import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Asesores del Taller de Tesis (spec v1.0 §9 P15 lista y P10 perfil).
 * Lo gestiona la Secretaría del Taller; lo leen el personal administrativo.
 *
 * Archivos del perfil (multipart y descarga) son rutas nativas, fuera de
 * ts-rest: POST /api/asesores/:id/archivos (PDF, campo `file`) y
 * GET /api/asesores/:id/archivos/:archivoId (descarga protegida).
 */

export const DisponibilidadAsesorSchema = z.enum(["DISPONIBLE", "CON_TALLER_ACTIVO"]);

export const EspecialidadResumenSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
});

export const AsesorDTOSchema = z.object({
  id: z.string().uuid(),
  dni: z.string(),
  nombres: z.string(),
  apellidos: z.string(),
  email: z.string(),
  telefono: z.string().nullable(),
  grado: z.string().nullable(),
  activo: z.boolean(),
  /** Talleres en los que fue asesor (todos los estados). */
  talleres: z.number().int(),
  especialidades: z.array(EspecialidadResumenSchema),
  /** Taller vigente (abierto, completo o en curso), si tiene uno. */
  tallerActual: z.object({ id: z.string().uuid(), nombre: z.string() }).nullable(),
  disponibilidad: DisponibilidadAsesorSchema,
});

export const ArchivoAsesorDTOSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  bytes: z.number().int(),
  subidoEn: z.string(),
});

export const TallerHistorialDTOSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  periodo: z.string().nullable(),
  proyectos: z.number().int(),
  estado: z.string(),
});

export const PerfilAsesorDTOSchema = z.object({
  asesor: AsesorDTOSchema,
  archivos: z.array(ArchivoAsesorDTOSchema),
  historial: z.array(TallerHistorialDTOSchema),
  encuesta: z.object({
    respuestas: z.number().int(),
    /** Promedio general 1–5; null si no hay respuestas suficientes para mostrarlo. */
    promedio: z.number().nullable(),
    minimo: z.number().int(),
  }),
});

const telefono = z.string().max(40).nullable();
const grado = z.string().max(40).nullable();

export const CrearAsesorSchema = z.object({
  dni: z.string().max(20),
  nombres: z.string().max(200),
  apellidos: z.string().max(200),
  email: z.string().max(255),
  telefono: telefono.optional(),
  grado: grado.optional(),
  /** Nombres de especialidades (se reutilizan o se agregan al catálogo). */
  especialidades: z.array(z.string().max(200)).max(20).optional(),
});

export const EditarAsesorSchema = z.object({
  nombres: z.string().max(200).optional(),
  apellidos: z.string().max(200).optional(),
  email: z.string().max(255).optional(),
  telefono: telefono.optional(),
  grado: grado.optional(),
  activo: z.boolean().optional(),
});

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const idAsesor = z.object({ id: z.string().uuid() });

export const asesoresContract = c.router({
  listar: {
    method: "GET",
    path: "/api/asesores",
    responses: { 200: z.object({ items: z.array(AsesorDTOSchema) }), ...errores },
    summary: "P15 Lista de asesores (personal administrativo)",
  },
  crear: {
    method: "POST",
    path: "/api/asesores",
    body: CrearAsesorSchema,
    responses: { 201: AsesorDTOSchema, ...errores },
    summary: "P15 Nuevo asesor: rol Asesor y envío de su acceso",
  },
  editar: {
    method: "PATCH",
    path: "/api/asesores/:id",
    pathParams: idAsesor,
    body: EditarAsesorSchema,
    responses: { 200: AsesorDTOSchema, ...errores },
    summary: "P15 Editar datos personales, activar o desactivar (no con taller activo)",
  },
  perfil: {
    method: "GET",
    path: "/api/asesores/:id/perfil",
    pathParams: idAsesor,
    responses: { 200: PerfilAsesorDTOSchema, ...errores },
    summary: "P10 Perfil: especialidades, archivos, historial y encuesta",
  },
  agregarEspecialidad: {
    method: "POST",
    path: "/api/asesores/:id/especialidades",
    pathParams: idAsesor,
    body: z.object({ nombre: z.string().max(200) }),
    responses: { 200: PerfilAsesorDTOSchema, ...errores },
    summary: "P10 Agregar especialidad (la crea en el catálogo si no existe)",
  },
  quitarEspecialidad: {
    method: "DELETE",
    path: "/api/asesores/:id/especialidades/:especialidadId",
    pathParams: z.object({ id: z.string().uuid(), especialidadId: z.string().uuid() }),
    body: z.object({}).optional(),
    responses: { 200: PerfilAsesorDTOSchema, ...errores },
    summary: "P10 Quitar especialidad del perfil",
  },
  eliminarArchivo: {
    method: "DELETE",
    path: "/api/asesores/:id/archivos/:archivoId",
    pathParams: z.object({ id: z.string().uuid(), archivoId: z.string().uuid() }),
    body: z.object({}).optional(),
    responses: { 200: PerfilAsesorDTOSchema, ...errores },
    summary: "P10 Eliminar archivo (se marca eliminado, no se borra)",
  },
  especialidades: {
    method: "GET",
    path: "/api/especialidades",
    responses: { 200: z.object({ items: z.array(EspecialidadResumenSchema) }), ...errores },
    summary: "Especialidades activas (autocompletar de P15 y P10)",
  },
});

export type AsesorDTO = z.infer<typeof AsesorDTOSchema>;
export type PerfilAsesorDTO = z.infer<typeof PerfilAsesorDTOSchema>;
export type CrearAsesorInput = z.infer<typeof CrearAsesorSchema>;
export type EditarAsesorInput = z.infer<typeof EditarAsesorSchema>;
