import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * P4 Sesiones y asistencia, P5 grupos de horario y D2 Reprogramar o
 * cancelar (spec v1.0 §9–§10). La asistencia la registra el asesor por
 * grupo de horario; la Secretaría consulta y corrige (con motivo).
 */

const FechaCorta = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const HoraCorta = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM");
const MarcaSchema = z.enum(["PENDIENTE", "PRESENTE", "FALTA", "JUSTIFICADA"]);

export const SesionTallerDTOSchema = z.object({
  id: z.string().uuid(),
  nro: z.number().int(),
  fecha: z.string(),
  horaInicio: z.string(),
  horaFin: z.string(),
  estado: z.enum(["PROGRAMADA", "REPROGRAMADA", "REALIZADA", "CANCELADA"]),
  fechaOriginal: z.string().nullable(),
  motivo: z.string().nullable(),
  /** Grupos que ya guardaron su asistencia. */
  gruposGuardados: z.array(z.string().uuid()),
  /** Null si se puede registrar; si no, el motivo (cancelada, futura…). */
  motivoNoRegistrar: z.string().nullable(),
});

export const GrupoHorarioDTOSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  horaInicio: z.string(),
  horaFin: z.string(),
  proyectos: z.array(
    z.object({ id: z.string().uuid(), codigo: z.string(), tesistas: z.array(z.string()) }),
  ),
  asistenciaPromedio: z.number().nullable(),
});

export const SesionesTallerDTOSchema = z.object({
  sesiones: z.array(SesionTallerDTOSchema),
  /** "Quedan N sesiones de M". */
  restantes: z.number().int(),
  total: z.number().int(),
  grupos: z.array(GrupoHorarioDTOSchema),
  proyectosSinGrupo: z.array(
    z.object({ id: z.string().uuid(), codigo: z.string(), tesistas: z.array(z.string()) }),
  ),
  /** El actor puede registrar asistencia nueva (asesor del taller o administrador). */
  puedeRegistrar: z.boolean(),
  /** El actor puede reprogramar, cancelar y agregar sesiones. */
  puedeProgramar: z.boolean(),
});

export const AsistenciaSesionDTOSchema = z.object({
  sesion: SesionTallerDTOSchema,
  grupos: z.array(
    z.object({
      /** Null = proyectos sin grupo de horario. */
      id: z.string().uuid().nullable(),
      nombre: z.string(),
      guardado: z.boolean(),
      alumnos: z.array(
        z.object({
          alumnoId: z.string().uuid(),
          nombre: z.string(),
          proyecto: z.string(),
          estado: MarcaSchema,
          marcadaAt: z.string().nullable(),
          motivo: z.string().nullable(),
        }),
      ),
    }),
  ),
  /** Alumnos que llegaron a las faltas consecutivas del retiro con este guardado. */
  alertas: z.array(z.string()),
});

export const GuardarAsistenciaSchema = z.object({
  grupoId: z.string().uuid().nullable(),
  marcas: z
    .array(
      z.object({
        alumnoId: z.string().uuid(),
        estado: z.enum(["PRESENTE", "FALTA", "JUSTIFICADA"]),
        motivo: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(60),
});

export const ReprogramarSesionSchema = z.object({
  fecha: FechaCorta,
  horaInicio: HoraCorta,
  horaFin: HoraCorta,
  motivo: z.string().max(500),
});

export const CancelarSesionSchema = z.object({ motivo: z.string().max(500) });

export const AgregarSesionSchema = ReprogramarSesionSchema;

export const GrupoHorarioInputSchema = z.object({
  nombre: z.string().max(120),
  horaInicio: HoraCorta,
  horaFin: HoraCorta,
  proyectoIds: z.array(z.string().uuid()).max(60),
});

export type SesionTallerDTO = z.infer<typeof SesionTallerDTOSchema>;
export type SesionesTallerDTO = z.infer<typeof SesionesTallerDTOSchema>;
export type AsistenciaSesionDTO = z.infer<typeof AsistenciaSesionDTOSchema>;
export type GrupoHorarioDTO = z.infer<typeof GrupoHorarioDTOSchema>;

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const idTaller = z.object({ id: z.string().uuid() });
const idSesion = z.object({ id: z.string().uuid() });

export const sesionesContract = c.router({
  listar: {
    method: "GET",
    path: "/api/talleres/:id/sesiones",
    pathParams: idTaller,
    responses: { 200: SesionesTallerDTOSchema, ...errores },
    summary: "P4 Sesiones del taller con grupos y permisos del actor",
  },
  agregar: {
    method: "POST",
    path: "/api/talleres/:id/sesiones",
    pathParams: idTaller,
    body: AgregarSesionSchema,
    responses: { 201: SesionesTallerDTOSchema, ...errores },
    summary: "P4 Agregar sesión extra (siguiente número, PROGRAMADA)",
  },
  asistencia: {
    method: "GET",
    path: "/api/sesiones/:id/asistencia",
    pathParams: idSesion,
    responses: { 200: AsistenciaSesionDTOSchema, ...errores },
    summary: "P4 Asistencia de la sesión por grupo de horario",
  },
  guardarAsistencia: {
    method: "POST",
    path: "/api/sesiones/:id/asistencia",
    pathParams: idSesion,
    body: GuardarAsistenciaSchema,
    responses: { 200: AsistenciaSesionDTOSchema, ...errores },
    summary: "P4 Guardar la asistencia de un grupo (corregir exige motivo)",
  },
  reprogramar: {
    method: "POST",
    path: "/api/sesiones/:id/reprogramar",
    pathParams: idSesion,
    body: ReprogramarSesionSchema,
    responses: { 200: SesionesTallerDTOSchema, ...errores },
    summary: "D2 Reprogramar (conserva número y asistencia)",
  },
  cancelar: {
    method: "POST",
    path: "/api/sesiones/:id/cancelar",
    pathParams: idSesion,
    body: CancelarSesionSchema,
    responses: { 200: SesionesTallerDTOSchema, ...errores },
    summary: "D2 Cancelar (no admite asistencia ni cuenta para el %)",
  },
  crearGrupo: {
    method: "POST",
    path: "/api/talleres/:id/grupos",
    pathParams: idTaller,
    body: GrupoHorarioInputSchema,
    responses: { 201: SesionesTallerDTOSchema, ...errores },
    summary: "P5 Crear grupo de horario con los proyectos elegidos",
  },
  editarGrupo: {
    method: "PATCH",
    path: "/api/grupos/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: GrupoHorarioInputSchema,
    responses: { 200: SesionesTallerDTOSchema, ...errores },
    summary: "P5 Renombrar, cambiar horario o mover proyectos (vale para las sesiones futuras)",
  },
  eliminarGrupo: {
    method: "DELETE",
    path: "/api/grupos/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}).optional(),
    responses: { 200: SesionesTallerDTOSchema, ...errores },
    summary: "P5 Eliminar un grupo sin proyectos (se desactiva)",
  },
});
