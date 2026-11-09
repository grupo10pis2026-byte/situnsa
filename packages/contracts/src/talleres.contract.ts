import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/** Spec v1.0 §6. */
export const EstadoTallerSchema = z.enum([
  "ABIERTO_INSCRIPCIONES",
  "COMPLETO",
  "EN_CURSO",
  "FINALIZADO",
  "CANCELADO",
]);

const FechaCorta = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const HoraCorta = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM");

export const DiaSesionSchema = z.object({
  /** Día ISO: 1 = lunes … 7 = domingo. */
  dia: z.number().int().min(1).max(7),
  horaInicio: HoraCorta,
  horaFin: HoraCorta,
});

/**
 * P1: columnas Taller, Asesor, Período, Días y hora, Inicio - fin, Proyectos,
 * Sesiones y Estado.
 */
export const TallerDTOSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  asesorId: z.string().uuid().nullable(),
  asesorNombre: z.string().nullable(),
  asesorDni: z.string().nullable(),
  periodo: z.string().nullable(),
  estado: EstadoTallerSchema,
  fechaInicio: z.string().nullable(),
  fechaFin: z.string().nullable(),
  numeroSesiones: z.number().int(),
  dias: z.array(DiaSesionSchema),
  cupoProyectos: z.number().int(),
  /** Proyectos asignados (cuentan en el cupo). */
  proyectos: z.number().int(),
  enlaceSabado: z.string().nullable(),
  enlaceDomingo: z.string().nullable(),
  sesiones: z.object({ realizadas: z.number(), total: z.number() }),
});

export type TallerDTO = z.infer<typeof TallerDTOSchema>;

export const PensionTallerDTOSchema = z.object({
  numero: z.number().int(),
  /** Null en la 1.ª ("al inscribirse"). */
  semana: z.number().int().nullable(),
  fecha: z.string().nullable(),
  monto: z.number().int(),
  /** Alumnos con esta pensión validada. */
  pagadas: z.number().int(),
});

export const SesionTallerResumenSchema = z.object({
  nro: z.number().int(),
  fecha: z.string(),
  horaInicio: z.string(),
  horaFin: z.string(),
  estado: z.string(),
});

export const TallerDetalleDTOSchema = TallerDTOSchema.extend({
  asesorEspecialidades: z.array(z.string()),
  pensiones: z.array(PensionTallerDTOSchema),
  calendario: z.array(SesionTallerResumenSchema),
  motivoCancelacion: z.string().nullable(),
  /** Semanas del plan copiadas del plan institucional al crear el taller. */
  planSemanas: z.number().int(),
  /** P2: inicio, fin, días y calendario se bloquean con sesiones realizadas. */
  fechasEditables: z.boolean(),
});

export type TallerDetalleDTO = z.infer<typeof TallerDetalleDTOSchema>;

const enlace = z.string().max(512).nullable().optional();

/**
 * P2 Nuevo taller. Las reglas de negocio (fin posterior al inicio, horarios,
 * https, 3.ª pensión posterior a la 2.ª…) las valida el dominio y responden
 * con el campo de cada error en `detalles`.
 */
export const DatosTallerSchema = z.object({
  nombre: z.string().max(160),
  periodo: z.string().max(32),
  inicio: FechaCorta,
  fin: FechaCorta,
  numeroSesiones: z.number().int(),
  dias: z.array(DiaSesionSchema).max(7),
  cupoProyectos: z.number().int(),
  enlaceSabado: enlace,
  enlaceDomingo: enlace,
  pensiones: z.object({
    montos: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
    fecha2: FechaCorta,
    fecha3: FechaCorta,
  }),
  /** Calendario final (propuesto y ajustado a mano). */
  sesiones: z
    .array(z.object({ fecha: FechaCorta, horaInicio: HoraCorta, horaFin: HoraCorta }))
    .max(60),
});

export const CrearTallerSchema = DatosTallerSchema.extend({
  asesorId: z.string().uuid(),
});

/** P2 en modo editar: el asesor se cambia con "Cambiar asesor" (P3). */
export const EditarTallerSchema = DatosTallerSchema;

export type DatosTallerInput = z.infer<typeof DatosTallerSchema>;
export type CrearTallerInput = z.infer<typeof CrearTallerSchema>;

export const ProponerCalendarioSchema = z.object({
  inicio: FechaCorta,
  fin: FechaCorta,
  dias: z.array(DiaSesionSchema).max(7),
  numeroSesiones: z.number().int(),
});

export const CalendarioPropuestoDTOSchema = z.object({
  sesiones: z.array(
    z.object({
      nro: z.number().int(),
      fecha: z.string(),
      dia: z.string(),
      horaInicio: z.string(),
      horaFin: z.string(),
    }),
  ),
  omitidas: z.array(z.object({ fecha: z.string(), dia: z.string(), nota: z.string() })),
  contador: z.string(),
  coincide: z.boolean(),
  /** Si el parámetro lo exige, no se puede guardar sin coincidir. */
  bloquea: z.boolean(),
  finSugerido: z.string(),
  pensionesSugeridas: z.object({ fecha2: z.string(), fecha3: z.string() }),
  /** Feriados activos del rango (para anotar las fechas agregadas a mano). */
  feriados: z.array(z.object({ fecha: z.string(), nombre: z.string() })),
});

export type CalendarioPropuestoDTO = z.infer<typeof CalendarioPropuestoDTOSchema>;

export const CambiarAsesorSchema = z.object({
  asesorId: z.string().uuid(),
  motivo: z.string().max(500),
});

export const CancelarTallerSchema = z.object({
  motivo: z.string().max(500),
});

export const FiltrosTallerSchema = z.object({
  periodo: z.string().optional(),
  estado: EstadoTallerSchema.optional(),
  asesorDni: z.string().optional(),
});

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const idTaller = z.object({ id: z.string().uuid() });

export const talleresContract = c.router({
  listar: {
    method: "GET",
    path: "/api/talleres",
    query: FiltrosTallerSchema,
    responses: { 200: z.object({ items: z.array(TallerDTOSchema) }), ...errores },
    summary: "P1 Lista de talleres (filtros combinables)",
  },
  defectos: {
    method: "GET",
    path: "/api/talleres/defectos",
    responses: {
      200: z.object({
        cupoProyectos: z.number().int(),
        numeroSesiones: z.number().int(),
        montoPension: z.number().int(),
      }),
      ...errores,
    },
    summary: "P2 Valores iniciales del formulario (parámetros del taller)",
  },
  proponerCalendario: {
    method: "POST",
    path: "/api/talleres/calendario",
    body: ProponerCalendarioSchema,
    responses: { 200: CalendarioPropuestoDTOSchema, ...errores },
    summary: "P2 Calendario propuesto sin guardar (omite feriados activos)",
  },
  crear: {
    method: "POST",
    path: "/api/talleres",
    body: CrearTallerSchema,
    responses: { 201: TallerDetalleDTOSchema, ...errores },
    summary: "P2 Nuevo taller: sesiones, 3 pensiones y copia del plan institucional",
  },
  detalle: {
    method: "GET",
    path: "/api/talleres/:id",
    pathParams: idTaller,
    responses: { 200: TallerDetalleDTOSchema, ...errores },
    summary: "P3 Detalle del taller",
  },
  editar: {
    method: "PATCH",
    path: "/api/talleres/:id",
    pathParams: idTaller,
    body: EditarTallerSchema,
    responses: { 200: TallerDetalleDTOSchema, ...errores },
    summary: "P2 Editar (fechas bloqueadas con sesiones realizadas)",
  },
  cambiarAsesor: {
    method: "POST",
    path: "/api/talleres/:id/asesor",
    pathParams: idTaller,
    body: CambiarAsesorSchema,
    responses: { 200: TallerDetalleDTOSchema, ...errores },
    summary: "P3 Cambiar asesor (solo disponibles) con motivo",
  },
  cancelar: {
    method: "POST",
    path: "/api/talleres/:id/cancelar",
    pathParams: idTaller,
    body: CancelarTallerSchema,
    responses: { 200: TallerDetalleDTOSchema, ...errores },
    summary: "P1/P3 Cancelar con motivo (solo sin sesiones realizadas)",
  },
});
