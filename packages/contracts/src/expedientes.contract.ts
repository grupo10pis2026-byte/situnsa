import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  ErrorEnvelopeSchema,
  PaginacionMetaSchema,
  PaginacionQuerySchema,
} from "./api-conventions.js";
import { EstadoExpedienteSchema, ModalidadSchema } from "./enums.js";

/** Registro de Nuevo Expediente §10: 1–2 participantes + validaciones RN-01.1. */
export const ParticipanteInputSchema = z.object({
  nombres: z.string().min(2).max(160),
  apellidos: z.string().min(2).max(160),
  dni: z.string().regex(/^\d{8}$/, "DNI debe tener 8 dígitos"),
  cui: z.string().max(16).optional(),
  email: z.string().email("Correo inválido"),
  telefono: z.string().max(20).optional(),
});

export const InscribirPlanSchema = z
  .object({
    modalidad: ModalidadSchema,
    programa: z.string().min(3).max(160),
    titulo: z.string().min(10).max(500),
    participante1: ParticipanteInputSchema,
    participante2: ParticipanteInputSchema.optional(),
    asesorDni: z.string().length(8).optional(),
  })
  .refine((v) => !v.participante2 || v.participante2.dni !== v.participante1.dni, {
    message: "DNIs duplicados",
    path: ["participante2", "dni"],
  });

export const ExpedienteDTOSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  estado: EstadoExpedienteSchema,
  modalidad: ModalidadSchema,
  programa: z.string(),
  titulo: z.string(),
});

export const FiltrosExpedienteSchema = PaginacionQuerySchema.extend({
  estado: EstadoExpedienteSchema.optional(),
  programa: z.string().optional(),
  q: z.string().optional(),
  orden: z.enum(["recientes", "antiguos", "menor-avance", "mayor-avance"]).optional(),
  /** vista=mis: filtra por el actor autenticado (tesista→propios, asesor→asesorados). */
  vista: z.enum(["mis"]).optional(),
});

/** Persona con campos del formulario legacy (ETAPA 01 · datos personales). */
export const PersonaDTOSchema = z.object({
  id: z.string().uuid(),
  dni: z.string(),
  cui: z.string().nullable(),
  nombres: z.string(),
  apellidos: z.string(),
  email: z.string(),
  telefono: z.string().nullable(),
  nacionalidad: z.string().nullable(),
  ciudad: z.string().nullable(),
  direccion: z.string().nullable(),
  grado: z.string().nullable(),
  activo: z.boolean(),
  rol: z.string(),
  /** Tiene clave configurada (puede ingresar a su portal). */
  accesoActivo: z.boolean(),
});

/** Etiquetas del ComboBox legacy (RN-L10, HU-0069 catálogos). */
export const EtiquetaModalidadSchema = z.enum([
  "Plan de Tesis",
  "Plan de Trabajo Académico",
  "Plan de Tesis Formato Artículo",
]);
export const EtiquetaModalidadFinalSchema = z.enum([
  "La Tesis",
  "El Trabajo Académico",
  "La Tesis Formato Artículo",
]);

/** Administrativos ETAPA 01 + sustentación ETAPA 02 (labels legacy exactos). */
export const DatosAdminDTOSchema = z.object({
  modalidad02: z.string().nullable(),
  modalidadFinal: z.string().nullable(),
  titulo02: z.string().nullable(),
  asesorNombre: z.string().nullable(),
  nroDecreto: z.string().nullable(),
  recomendacion: z.string().nullable(),
  presidente: z.string().nullable(),
  secretario: z.string().nullable(),
  coAsesor: z.string().nullable(),
  fechaApertura: z.string().nullable(),
  fechaPresentacion: z.string().nullable(),
  nroOficio: z.string().nullable(),
  integrante: z.string().nullable(),
  presidenteE2: z.string().nullable(),
  secretarioE2: z.string().nullable(),
  suplenteE2: z.string().nullable(),
  decanal: z.string().nullable(),
  fechaSustentacion: z.string().nullable(),
  horaSustentacion: z.string().nullable(),
  lugarSustentacion: z.string().nullable(),
  modalidadVirtual: z.string().nullable(),
});

/** Documento del checklist (tarjeta documental §7–§8 INTERFACES). */
export const ChecklistItemDTOSchema = z.object({
  tipo: z.string(),
  nombre: z.string(),
  etapa: z.enum(["E1", "E2"]),
  obligatorio: z.boolean(),
  /** Clave de la subetapa que lo exige (y en la que lo carga el tesista, RN-06). */
  requeridoEn: z.string().nullable(),
  estado: z.enum(["PENDIENTE", "CARGADO", "OBSERVADO", "APROBADO", "RECHAZADO"]),
  documentoId: z.string().uuid().nullable(),
  version: z.number().nullable(),
  updatedAt: z.string().nullable(),
  faltantes: z.array(z.string()),
});

export const SemaforoSchema = z.enum(["VERDE", "AMARILLO", "ROJO"]);

export const SubetapaDTOSchema = z.object({
  id: z.string().uuid(),
  /** Clave estable (reglas de avance); null = subetapa personalizada. */
  clave: z.string().nullable(),
  etapa: z.number(),
  etapaNombre: z.string(),
  orden: z.number(),
  nombre: z.string(),
  plazo: z.string().nullable(),
  estado: z.enum(["NO_INICIADO", "EN_CURSO", "FINALIZADO"]),
  responsable: z.string().nullable(),
  inicio: z.string().nullable(),
  fin: z.string().nullable(),
  /** Plazo de la subetapa EN_CURSO en días hábiles (RN-PLZ-07). */
  vencimiento: z.string().nullable(),
  diasRestantes: z.number().nullable(),
  vencida: z.boolean(),
  semaforo: SemaforoSchema.nullable(),
});

export const AvanceDTOSchema = z.object({
  marcados: z.number(),
  total: z.number(),
  pct: z.number(),
  etapaActual: z.number(),
  subetapaActual: z.string().nullable(),
});

export const MensajeDTOSchema = z.object({
  id: z.string().uuid(),
  texto: z.string(),
  autorDni: z.string().nullable(),
  createdAt: z.string(),
});

export const AuditoriaItemDTOSchema = z.object({
  estadoAnterior: z.string().nullable(),
  estadoNuevo: z.string(),
  actorDni: z.string().nullable(),
  detalle: z.string().nullable(),
  createdAt: z.string(),
});

/** Formato generado por "Insertar datos" (HU-0017/0018) con sus campos pendientes. */
export const DocumentoGeneradoDTOSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  nombre: z.string(),
  etapa: z.enum(["E1", "E2", "E6"]),
  version: z.number(),
  pendientes: z.array(z.string()),
  createdAt: z.string(),
  documentoId: z.string().uuid().nullable().optional(),
  documentoEstado: z.string().nullable().optional(),
  documentoVersion: z.number().nullable().optional(),
});

/** Detalle completo: pestañas Datos/Documentos/Resumen + mensajes. */
export const ExpedienteDetalleDTOSchema = ExpedienteDTOSchema.extend({
  /** Estado al que se vuelve al levantar la observación vigente. */
  observadoDesde: EstadoExpedienteSchema.nullable(),
  participante1: PersonaDTOSchema.nullable(),
  participante2: PersonaDTOSchema.nullable(),
  asesor: PersonaDTOSchema.nullable(),
  datosAdmin: DatosAdminDTOSchema,
  checklist: z.array(ChecklistItemDTOSchema),
  generados: z.array(DocumentoGeneradoDTOSchema),
  subetapas: z.array(SubetapaDTOSchema),
  subetapaActiva: z
    .object({
      id: z.string().uuid(),
      clave: z.string().nullable(),
      etapa: z.number(),
      orden: z.number(),
    })
    .nullable(),
  avance: AvanceDTOSchema,
  mensajes: z.array(MensajeDTOSchema),
  historial: z.array(AuditoriaItemDTOSchema),
  updatedAt: z.string(),
});

export type ExpedienteDetalleDTO = z.infer<typeof ExpedienteDetalleDTOSchema>;

/** Fila del Dashboard Administrativo §4. */
export const ExpedienteResumenDTOSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  tesista: z.string(),
  dni: z.string(),
  programa: z.string(),
  etapaActual: z.number(),
  subetapaActual: z.string().nullable(),
  estado: EstadoExpedienteSchema,
  avancePct: z.number(),
  updatedAt: z.string(),
});

const patchBase = {
  titulo: z.string().min(10).max(500).optional(),
  titulo02: z.string().max(500).optional(),
  programa: z.string().min(3).max(160).optional(),
  /** RN-L10: etiqueta del ComboBox; el backend deriva el enum canónico. */
  modalidad: EtiquetaModalidadSchema.optional(),
  modalidad02: EtiquetaModalidadSchema.optional(),
  modalidadFinal: EtiquetaModalidadFinalSchema.optional(),
  asesorNombre: z.string().max(160).optional(),
  participante1Email: z.string().email().optional(),
  participante1Telefono: z.string().max(20).optional(),
  participante1Cui: z.string().max(16).optional(),
  participante1Nacionalidad: z.string().max(64).optional(),
  participante1Ciudad: z.string().max(64).optional(),
  participante1Direccion: z.string().max(500).optional(),
  participante2Email: z.string().email().optional(),
  participante2Telefono: z.string().max(20).optional(),
  participante2Cui: z.string().max(16).optional(),
  participante2Nacionalidad: z.string().max(64).optional(),
  participante2Ciudad: z.string().max(64).optional(),
  participante2Direccion: z.string().max(500).optional(),
  nroDecreto: z.string().max(64).optional(),
  recomendacion: z.string().max(2000).optional(),
  presidente: z.string().max(160).optional(),
  secretario: z.string().max(160).optional(),
  coAsesor: z.string().max(160).optional(),
  fechaApertura: z.string().max(32).optional(),
  fechaPresentacion: z.string().max(32).optional(),
  nroOficio: z.string().max(64).optional(),
  integrante: z.string().max(160).optional(),
  presidenteE2: z.string().max(160).optional(),
  secretarioE2: z.string().max(160).optional(),
  suplenteE2: z.string().max(160).optional(),
  decanal: z.string().max(160).optional(),
  fechaSustentacion: z.string().max(32).optional(),
  horaSustentacion: z.string().max(16).optional(),
  lugarSustentacion: z.string().max(160).optional(),
  modalidadVirtual: z.string().max(64).optional(),
  expectedUpdatedAt: z.string().optional(),
};

/**
 * PATCH autoguardado (§6: DNI/correo/CUI obligatorios con formato).
 * expectedUpdatedAt = concurrencia optimista → 409 si otro guardó antes.
 */
export const ActualizarDatosSchema = z.object(patchBase);

export type ActualizarDatosInput = z.infer<typeof ActualizarDatosSchema>;

const c = initContract();

export const expedientesContract = c.router({
  inscribirPlan: {
    method: "POST",
    path: "/api/expedientes/inscribir-plan",
    body: InscribirPlanSchema,
    responses: {
      201: z.object({ id: z.string().uuid(), codigo: z.string() }),
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      409: ErrorEnvelopeSchema,
    },
    summary: "§10 Registro de Nuevo Expediente (crea REGISTRADO; admite Idempotency-Key)",
  },
  validar: {
    method: "POST",
    path: "/api/expedientes/:id/validar",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: ExpedienteDetalleDTOSchema,
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "§12 Validar inscripción → EN_PLAN + genera seguimiento",
  },
  levantarObservacion: {
    method: "POST",
    path: "/api/expedientes/:id/levantar-observacion",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({ comentario: z.string().max(2000).optional() }),
    responses: {
      200: z.object({ id: z.string().uuid(), estado: EstadoExpedienteSchema }),
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "OBSERVADO → estado de origen (subsanación verificada por el área)",
  },
  enviarAcceso: {
    method: "POST",
    path: "/api/expedientes/:id/enviar-acceso",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: z.object({ enviados: z.number(), destinatarios: z.array(z.string()) }),
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Envía a los participantes el enlace de activación de su portal (HU-0002)",
  },
  publicarMensaje: {
    method: "POST",
    path: "/api/expedientes/:id/mensajes",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({ texto: z.string().min(2).max(2000) }),
    responses: {
      201: MensajeDTOSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Mensaje administrativo (§5 Historial de mensajes)",
  },
  getById: {
    method: "GET",
    path: "/api/expedientes/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: ExpedienteDetalleDTOSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Detalle del expediente (pestañas Datos/Documentos/Resumen)",
  },
  anular: {
    method: "POST",
    path: "/api/expedientes/:id/anular",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({ motivo: z.string().max(500).optional() }),
    responses: {
      200: ExpedienteDetalleDTOSchema,
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "ELIMINAR REGISTRO: borrado lógico → ANULADO",
  },
  actualizarDatos: {
    method: "PATCH",
    path: "/api/expedientes/:id",
    pathParams: z.object({ id: z.string().uuid() }),
    body: ActualizarDatosSchema,
    responses: {
      200: ExpedienteDetalleDTOSchema,
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
      409: ErrorEnvelopeSchema.extend({ updatedAt: z.string().optional() }),
    },
    summary: "Autoguardado de Datos (§6 INTERFACES)",
  },
  listar: {
    method: "GET",
    path: "/api/expedientes",
    query: FiltrosExpedienteSchema,
    responses: {
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      200: PaginacionMetaSchema.extend({
        items: z.array(ExpedienteResumenDTOSchema),
        resumen: z.object({
          total: z.number(),
          enCurso: z.number(),
          finalizados: z.number(),
          sinIniciar: z.number(),
        }),
      }),
    },
    summary: "Dashboard §4: tabla + indicadores (paginado page/limit)",
  },
});

export type InscribirPlanInput = z.infer<typeof InscribirPlanSchema>;
