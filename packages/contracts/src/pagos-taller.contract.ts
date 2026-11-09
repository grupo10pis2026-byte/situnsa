import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Pensiones del taller (spec v1.0 §9 P8 Mis pagos y P9 Pagos y deudores).
 * Cada alumno tiene 3 pensiones; la 1.ª queda pagada con la inscripción.
 * El alumno sube un comprobante (imagen o PDF); la Secretaría lo valida u
 * observa con motivo, o registra un pago directo. Subir y descargar el
 * comprobante son rutas nativas (multipart / archivo protegido).
 */

export const EstadoPensionSchema = z.enum([
  "PENDIENTE",
  "EN_REVISION",
  "VALIDADA",
  "OBSERVADA",
  "VENCIDA",
]);

export const ComprobanteDTOSchema = z.object({
  id: z.string().uuid(),
  nombreArchivo: z.string(),
  mime: z.string(),
  estado: z.enum(["EN_REVISION", "VALIDADO", "OBSERVADO"]),
  motivo: z.string().nullable(),
  subidoAt: z.string(),
  validadoAt: z.string().nullable(),
});

export const PensionFilaDTOSchema = z.object({
  id: z.string().uuid(),
  alumnoId: z.string().uuid(),
  alumno: z.string(),
  dni: z.string(),
  tallerId: z.string().uuid(),
  taller: z.string(),
  proyecto: z.string().nullable(),
  numero: z.number().int(),
  fecha: z.string().nullable(),
  monto: z.number().int(),
  estado: EstadoPensionSchema,
  medio: z.enum(["INSCRIPCION", "COMPROBANTE", "PAGO_DIRECTO"]).nullable(),
  montoPagado: z.number().int().nullable(),
  diasAtraso: z.number().int(),
  observacion: z.string().nullable(),
  comprobante: ComprobanteDTOSchema.nullable(),
});

export const PagosTallerDTOSchema = z.object({
  items: z.array(PensionFilaDTOSchema),
  resumen: z.object({
    porValidar: z.number().int(),
    vencidas: z.number().int(),
    deudores: z.number().int(),
    deudaTotal: z.number().int(),
  }),
  talleres: z.array(z.object({ id: z.string().uuid(), nombre: z.string() })),
});

export const FiltrosPagosSchema = z.object({
  tallerId: z.string().uuid().optional(),
  estado: EstadoPensionSchema.optional(),
  /** Solo pensiones con deuda (pendiente vencida, vencida u observada). */
  deudores: z.enum(["true", "false"]).optional(),
  q: z.string().max(80).optional(),
});

export const MiPensionDTOSchema = z.object({
  id: z.string().uuid(),
  numero: z.number().int(),
  fecha: z.string().nullable(),
  monto: z.number().int(),
  estado: EstadoPensionSchema,
  medio: z.enum(["INSCRIPCION", "COMPROBANTE", "PAGO_DIRECTO"]).nullable(),
  diasAtraso: z.number().int(),
  observacion: z.string().nullable(),
  comprobantes: z.array(ComprobanteDTOSchema),
  motivoNoSubir: z.string().nullable(),
});

export const MisPagosDTOSchema = z.object({
  taller: z.object({ id: z.string().uuid(), nombre: z.string() }).nullable(),
  pensiones: z.array(MiPensionDTOSchema),
  formatos: z.array(z.string()),
  maxMb: z.number(),
});

export const ObservarComprobanteSchema = z.object({
  motivo: z.string().trim().min(1, "Escribe el motivo").max(1000),
});

export const PagoDirectoSchema = z.object({
  observacion: z.string().max(1000).nullable().optional(),
});

export type PensionFilaDTO = z.infer<typeof PensionFilaDTOSchema>;
export type PagosTallerDTO = z.infer<typeof PagosTallerDTOSchema>;
export type MisPagosDTO = z.infer<typeof MisPagosDTOSchema>;
export type MiPensionDTO = z.infer<typeof MiPensionDTOSchema>;
export type ComprobanteDTO = z.infer<typeof ComprobanteDTOSchema>;
export type FiltrosPagos = z.infer<typeof FiltrosPagosSchema>;

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const id = z.object({ id: z.string().uuid() });

export const pagosTallerContract = c.router({
  listar: {
    method: "GET",
    path: "/api/pagos-taller",
    query: FiltrosPagosSchema,
    responses: { 200: PagosTallerDTOSchema, ...errores },
    summary: "P9 Pagos y deudores (filtros combinables)",
  },
  validar: {
    method: "POST",
    path: "/api/comprobantes/:id/validar",
    pathParams: id,
    body: z.object({}).optional(),
    responses: { 200: PensionFilaDTOSchema, ...errores },
    summary: "P9 Validar comprobante (la pensión queda pagada)",
  },
  observar: {
    method: "POST",
    path: "/api/comprobantes/:id/observar",
    pathParams: id,
    body: ObservarComprobanteSchema,
    responses: { 200: PensionFilaDTOSchema, ...errores },
    summary: "P9 Observar comprobante (con motivo; el alumno sube otro)",
  },
  pagoDirecto: {
    method: "POST",
    path: "/api/pensiones-alumno/:id/pago-directo",
    pathParams: id,
    body: PagoDirectoSchema,
    responses: { 200: PensionFilaDTOSchema, ...errores },
    summary: "P9 Registrar pago sin comprobante",
  },
  misPagos: {
    method: "GET",
    path: "/api/mis-pagos",
    responses: { 200: MisPagosDTOSchema, ...errores },
    summary: "P8 Mis pagos (alumno)",
  },
});
