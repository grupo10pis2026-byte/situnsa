import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Portales del taller (spec v1.0 §9): P7 Mi Taller del alumno (sesiones,
 * su asistencia con el aviso rojo, enlaces de reunión, pensiones) y P5 los
 * talleres del asesor. Las entregas, el plan y los pagos usan sus propios
 * contratos.
 */

export const SesionAlumnoDTOSchema = z.object({
  id: z.string().uuid(),
  nro: z.number().int(),
  fecha: z.string(),
  horaInicio: z.string(),
  horaFin: z.string(),
  estado: z.enum(["PROGRAMADA", "REPROGRAMADA", "REALIZADA", "CANCELADA"]),
  marca: z.enum(["PENDIENTE", "PRESENTE", "FALTA", "JUSTIFICADA"]).nullable(),
  enlace: z.string().nullable(),
  motivo: z.string().nullable(),
});

export const MiTallerDTOSchema = z.object({
  taller: z
    .object({
      id: z.string().uuid(),
      nombre: z.string(),
      estado: z.string(),
      asesor: z.string().nullable(),
      asesorEmail: z.string().nullable(),
      fechaInicio: z.string().nullable(),
      fechaFin: z.string().nullable(),
    })
    .nullable(),
  proyecto: z
    .object({
      id: z.string().uuid(),
      codigo: z.string(),
      titulo: z.string().nullable(),
      grupo: z.string().nullable(),
    })
    .nullable(),
  estadoTesista: z.enum(["EN_TALLER", "PLAN_APROBADO", "ASESORIA_CERRADA", "RETIRADO"]).nullable(),
  asistencia: z.object({
    porcentaje: z.number().nullable(),
    realizadas: z.number().int(),
    /** §9 P7 aviso rojo por faltas consecutivas (null si no aplica). */
    aviso: z.string().nullable(),
  }),
  sesiones: z.array(SesionAlumnoDTOSchema),
  proximaSesion: SesionAlumnoDTOSchema.nullable(),
  pensiones: z.object({
    pagadas: z.number().int(),
    total: z.number().int(),
    conDeuda: z.number().int(),
  }),
});

export const TallerAsesorDTOSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  estado: z.string(),
  periodo: z.string().nullable(),
  fechaInicio: z.string().nullable(),
  proyectos: z.number().int(),
});

export type MiTallerDTO = z.infer<typeof MiTallerDTOSchema>;
export type SesionAlumnoDTO = z.infer<typeof SesionAlumnoDTOSchema>;
export type TallerAsesorDTO = z.infer<typeof TallerAsesorDTOSchema>;

const c = initContract();

const errores = {
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
} as const;

export const miTallerContract = c.router({
  miTaller: {
    method: "GET",
    path: "/api/mi-taller",
    responses: { 200: MiTallerDTOSchema, ...errores },
    summary: "P7 Mi Taller (alumno)",
  },
  talleresAsesor: {
    method: "GET",
    path: "/api/asesor/talleres",
    responses: { 200: z.object({ items: z.array(TallerAsesorDTOSchema) }), ...errores },
    summary: "P5 Talleres del asesor (el vigente primero)",
  },
});
