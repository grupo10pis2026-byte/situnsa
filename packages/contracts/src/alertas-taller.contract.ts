import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * P12 Alertas, retiros y reportes (spec v1.0 §9). Las alertas las crean
 * procesos (faltas consecutivas, plan no presentado, avance incumplido);
 * la Secretaría las atiende registrando el retiro o las descarta con
 * motivo. Los reportes a la Unidad (semana 2, quincenales y de cierre) se
 * descargan en PDF o Excel (ruta nativa).
 */

export const TipoAlertaSchema = z.enum([
  "FALTAS_CONSECUTIVAS",
  "PLAN_NO_PRESENTADO",
  "AVANCE_INCUMPLIDO",
]);
export const EstadoAlertaSchema = z.enum(["ACTIVA", "ATENDIDA", "DESCARTADA"]);

export const AlertaTallerDTOSchema = z.object({
  id: z.string().uuid(),
  tipo: TipoAlertaSchema,
  estado: EstadoAlertaSchema,
  tallerId: z.string().uuid(),
  taller: z.string(),
  proyectoId: z.string().uuid().nullable(),
  proyecto: z.string().nullable(),
  alumnoId: z.string().uuid().nullable(),
  alumno: z.string().nullable(),
  hito: z.string().nullable(),
  detalle: z.string(),
  creadaAt: z.string(),
  motivoDescarte: z.string().nullable(),
  /** El alumno de la alerta ya está retirado. */
  retirado: z.boolean(),
});

export const AlertasTallerDTOSchema = z.object({
  items: z.array(AlertaTallerDTOSchema),
  activas: z.number().int(),
  talleres: z.array(z.object({ id: z.string().uuid(), nombre: z.string() })),
});

export const RetiroSchema = z.object({
  alumnoId: z.string().uuid(),
  motivo: z.string().trim().min(1, "Escribe el motivo del retiro").max(1000),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  alertaId: z.string().uuid().nullable().optional(),
});

export const ReporteTallerDTOSchema = z.object({
  tipo: z.enum(["SEMANA_2", "QUINCENAL", "CIERRE"]),
  hito: z.string(),
  nombre: z.string(),
  fecha: z.string(),
  disponible: z.boolean(),
});

export const ReportesTallerDTOSchema = z.object({
  tallerId: z.string().uuid(),
  taller: z.string(),
  reportes: z.array(ReporteTallerDTOSchema),
});

export type AlertaTallerDTO = z.infer<typeof AlertaTallerDTOSchema>;
export type AlertasTallerDTO = z.infer<typeof AlertasTallerDTOSchema>;
export type RetiroInput = z.infer<typeof RetiroSchema>;
export type ReporteTallerDTO = z.infer<typeof ReporteTallerDTOSchema>;
export type ReportesTallerDTO = z.infer<typeof ReportesTallerDTOSchema>;

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const id = z.object({ id: z.string().uuid() });

export const alertasTallerContract = c.router({
  listar: {
    method: "GET",
    path: "/api/alertas-taller",
    query: z.object({
      tallerId: z.string().uuid().optional(),
      estado: EstadoAlertaSchema.optional(),
    }),
    responses: { 200: AlertasTallerDTOSchema, ...errores },
    summary: "P12 Alertas del taller",
  },
  descartar: {
    method: "POST",
    path: "/api/alertas-taller/:id/descartar",
    pathParams: id,
    body: z.object({ motivo: z.string().trim().min(1, "Escribe el motivo").max(1000) }),
    responses: { 200: AlertaTallerDTOSchema, ...errores },
    summary: "P12 Descartar una alerta (con motivo)",
  },
  retirar: {
    method: "POST",
    path: "/api/talleres/:id/retiros",
    pathParams: id,
    body: RetiroSchema,
    responses: { 201: z.object({ ok: z.literal(true) }), ...errores },
    summary: "P12 Registrar retiro de un alumno (atiende la alerta)",
  },
  reportes: {
    method: "GET",
    path: "/api/talleres/:id/reportes",
    pathParams: id,
    responses: { 200: ReportesTallerDTOSchema, ...errores },
    summary: "P12 Reportes programados del taller",
  },
});
