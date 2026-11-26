import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  ErrorEnvelopeSchema,
  PaginacionMetaSchema,
  PaginacionQuerySchema,
} from "./api-conventions.js";
import {
  EstadoConformidadDocumentoSchema,
  EstadoSolicitudSchema,
  ModalidadSchema,
  ViaIngresoSchema,
} from "./enums.js";

const c = initContract();

/* ========================================================================== */
/* ESQUEMAS DE ENTRADA (WIZARD PÚBLICO Y ACCIONES ADMINISTRATIVAS)           */
/* ========================================================================== */

export const ParticipanteSolicitudInputSchema = z.object({
  nombres: z.string().trim().min(2, "Nombres mínimos 2 caracteres").max(160),
  apellidos: z.string().trim().min(2, "Apellidos mínimos 2 caracteres").max(160),
  dni: z
    .string()
    .trim()
    .regex(/^\d{8}$/, "DNI debe tener exactamente 8 dígitos"),
  cui: z
    .string()
    .trim()
    .refine((val) => val === "" || /^\d{8}$/.test(val), {
      message: "El CUI debe tener exactamente 8 dígitos numéricos",
    })
    .optional(),
  email: z
    .string()
    .trim()
    .email("Correo electrónico inválido")
    .regex(/@unsa\.edu\.pe$/i, "Debe usar su correo institucional UNSA")
    .max(255),
  telefono: z
    .string()
    .trim()
    .refine((val) => !val || /^\d{9}$/.test(val), {
      message: "El teléfono debe tener exactamente 9 dígitos",
    })
    .optional(),
  nacionalidad: z.string().trim().max(64).optional().default("Peruana"),
  ciudad: z.string().trim().max(64).optional(),
  direccion: z.string().trim().max(300).optional(),
  departamento: z.string().trim().max(64).optional(),
  provincia: z.string().trim().max(64).optional(),
});
export type ParticipanteSolicitudInput = z.infer<typeof ParticipanteSolicitudInputSchema>;

export const CrearSolicitudPayloadSchema = z
  .object({
    modalidad: ModalidadSchema,
    programa: z.string().trim().min(3).max(160),
    titulo: z.string().trim().min(10, "El título debe tener al menos 10 caracteres").max(500),
    anioEgreso: z.coerce.number().int().min(1970).max(2100).optional(),
    cantidadTesistas: z.coerce.number().int().min(1).max(2).default(1),
    participante1: ParticipanteSolicitudInputSchema,
    participante2: ParticipanteSolicitudInputSchema.optional(),
    declaracionJurada: z.literal(true, {
      errorMap: () => ({ message: "Debe aceptar la declaración jurada de veracidad" }),
    }),
  })
  .refine(
    (val) => {
      if (val.cantidadTesistas === 2 && !val.participante2) return false;
      return true;
    },
    {
      message: "Debe registrar los datos del segundo participante",
      path: ["participante2"],
    },
  )
  .refine(
    (val) => {
      if (val.participante2) {
        return val.participante1.dni.trim() !== val.participante2.dni.trim();
      }
      return true;
    },
    {
      message: "El Participante 1 y el Participante 2 no pueden tener el mismo DNI",
      path: ["participante2", "dni"],
    },
  )
  .refine(
    (val) => {
      if (val.participante2) {
        return (
          val.participante1.email.trim().toLowerCase() !==
          val.participante2.email.trim().toLowerCase()
        );
      }
      return true;
    },
    {
      message: "Cada participante debe registrar un correo institucional distinto",
      path: ["participante2", "email"],
    },
  );
export type CrearSolicitudPayload = z.infer<typeof CrearSolicitudPayloadSchema>;

export const ObservarSolicitudSchema = z.object({
  detalleObservacion: z.string().trim().min(5, "Detalle mínimo de 5 caracteres").max(2000),
});
export type ObservarSolicitudInput = z.infer<typeof ObservarSolicitudSchema>;

export const RechazarSolicitudSchema = z.object({
  fundamentoReglamentario: z
    .string()
    .trim()
    .min(10, "Fundamento mínimo de 10 caracteres")
    .max(2000),
});
export type RechazarSolicitudInput = z.infer<typeof RechazarSolicitudSchema>;

export const ParticipanteConfigAceptacionSchema = z.object({
  orden: z.number().int().min(1).max(2),
  dni: z.string().length(8),
  usuarioAsignado: z.string().min(3).max(64),
  /** Enviar el correo de alta: enlace de activación (cuenta nueva) o aviso (cuenta previa). */
  enviarActivacionCorreo: z.boolean().default(true),
});

export const AceptarSolicitudSchema = z.object({
  codigoSetConfirmado: z
    .string()
    .regex(/^SET\d{3,}$/, "El código debe ser SET seguido de 3 o más dígitos (ej. SET001)"),
  tituloConfirmado: z.string().trim().min(10).max(500),
  programaConfirmado: z.string().trim().min(3).max(160),
  crearCuentasUsuarios: z.boolean().default(true),
  participantesConfig: z.array(ParticipanteConfigAceptacionSchema),
  tallerGrupoId: z.string().uuid().optional(),
  asesorId: z.string().uuid().optional(),
});
export type AceptarSolicitudInput = z.infer<typeof AceptarSolicitudSchema>;

export const ActualizarDatosMenoresSchema = z.object({
  titulo: z.string().trim().min(10).max(500).optional(),
  programa: z.string().trim().min(3).max(160).optional(),
  modalidad: ModalidadSchema.optional(),
  participantes: z
    .array(
      z.object({
        id: z.string().uuid(),
        nombres: z.string().trim().min(2, "Nombres mínimos 2 caracteres").max(160).optional(),
        apellidos: z.string().trim().min(2, "Apellidos mínimos 2 caracteres").max(160).optional(),
        cui: z
          .string()
          .trim()
          .refine((val) => val === "" || /^\d{8}$/.test(val), {
            message: "El CUI debe tener exactamente 8 dígitos numéricos",
          })
          .optional(),
        telefono: z
          .string()
          .trim()
          .refine((val) => !val || /^\d{9}$/.test(val), {
            message: "El teléfono debe tener exactamente 9 dígitos",
          })
          .optional(),
        ciudad: z.string().trim().max(64).optional(),
        direccion: z.string().trim().max(300).optional(),
      }),
    )
    .optional(),
});
export type ActualizarDatosMenoresInput = z.infer<typeof ActualizarDatosMenoresSchema>;

export const ActualizarConformidadDocumentoSchema = z.object({
  estadoConformidad: EstadoConformidadDocumentoSchema,
});

/* ========================================================================== */
/* ESQUEMAS DTO DE SALIDA (BANDEJA, DETALLE Y KPIS)                           */
/* ========================================================================== */

export const FiltrosSolicitudesQuerySchema = PaginacionQuerySchema.extend({
  modalidad: ModalidadSchema.optional(),
  via: ViaIngresoSchema.optional(),
  estado: EstadoSolicitudSchema.optional(),
  programa: z.string().optional(),
  q: z.string().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});
export type FiltrosSolicitudesQuery = z.infer<typeof FiltrosSolicitudesQuerySchema>;

export const KpisSolicitudesSchema = z.object({
  nuevas: z.number().int(),
  enRevision: z.number().int(),
  expedientesCreados: z.number().int(),
  observadas: z.number().int(),
  tiempoPromedioEsperaHoras: z.number(),
});
export type KpisSolicitudes = z.infer<typeof KpisSolicitudesSchema>;

export const SolicitudResumenSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  fechaHora: z.string(),
  via: ViaIngresoSchema,
  modalidad: ModalidadSchema,
  programa: z.string(),
  titulo: z.string(),
  tesistaTitular: z.object({
    nombresCompletos: z.string(),
    dni: z.string(),
    cui: z.string().nullable(),
  }),
  coTesista: z
    .object({
      nombresCompletos: z.string(),
      dni: z.string(),
      cui: z.string().nullable(),
    })
    .nullable(),
  totalDocumentos: z.number().int(),
  documentosConformes: z.number().int(),
  estado: EstadoSolicitudSchema,
  expedienteCodigo: z.string().nullable(),
});
export type SolicitudResumen = z.infer<typeof SolicitudResumenSchema>;

export const SolicitudParticipanteDTOSchema = z.object({
  id: z.string().uuid(),
  orden: z.number().int(),
  nombres: z.string(),
  apellidos: z.string(),
  dni: z.string(),
  cui: z.string().nullable(),
  email: z.string(),
  telefono: z.string().nullable(),
  nacionalidad: z.string().nullable(),
  ciudad: z.string().nullable(),
  direccion: z.string().nullable(),
  departamento: z.string().nullable(),
  provincia: z.string().nullable(),
  distrito: z.string().nullable(),
  esCuentaInstitucional: z.boolean(),
  poseeCuentaPrevia: z.boolean(),
  usuarioId: z.string().uuid().nullable(),
});
export type SolicitudParticipanteDTO = z.infer<typeof SolicitudParticipanteDTOSchema>;

export const SolicitudDocumentoDTOSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  nombreOriginal: z.string(),
  mimeType: z.string(),
  pesoBytes: z.number().int(),
  version: z.number().int(),
  estadoConformidad: EstadoConformidadDocumentoSchema,
  participanteOrden: z.number().int().nullable(),
  sha256: z.string(),
  createdAt: z.string(),
});
export type SolicitudDocumentoDTO = z.infer<typeof SolicitudDocumentoDTOSchema>;

export const SolicitudHistorialDTOSchema = z.object({
  id: z.string().uuid(),
  accion: z.string(),
  actor: z.string(),
  actorDni: z.string().nullable(),
  ip: z.string().nullable(),
  detalle: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  fechaHora: z.string(),
});
export type SolicitudHistorialDTO = z.infer<typeof SolicitudHistorialDTOSchema>;

export const SolicitudDetalleDTOSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  via: ViaIngresoSchema,
  modalidad: ModalidadSchema,
  programa: z.string(),
  titulo: z.string(),
  anioEgreso: z.number().int().nullable(),
  cantidadTesistas: z.number().int(),
  estado: EstadoSolicitudSchema,
  responsableAsignado: z.string().nullable(),
  fechaRecepcion: z.string(),
  motivoObservacion: z.string().nullable(),
  motivoRechazo: z.string().nullable(),
  expedienteId: z.string().uuid().nullable(),
  expedienteCodigo: z.string().nullable(),
  tallerGrupoId: z.string().uuid().nullable(),
  participantes: z.array(SolicitudParticipanteDTOSchema),
  documentos: z.array(SolicitudDocumentoDTOSchema),
  trazabilidad: z.array(SolicitudHistorialDTOSchema),
});
export type SolicitudDetalleDTO = z.infer<typeof SolicitudDetalleDTOSchema>;

/**
 * Solicitud propia vista desde el portal del tesista (sin trazabilidad ni
 * datos de otros participantes). Al observarla se crean las cuentas de los
 * participantes, que corrigen sus documentos aquí: no hay fecha límite ni
 * enlace de subsanación aparte (decisión del cliente, 2026-11-26).
 */
export const MiSolicitudDocumentoDTOSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  nombreOriginal: z.string(),
  mimeType: z.string(),
  version: z.number().int(),
  estadoConformidad: EstadoConformidadDocumentoSchema,
  participanteOrden: z.number().int().nullable(),
  /** Requisito de fotografía: solo se acepta JPG; el resto, PDF. */
  esFoto: z.boolean(),
});
export type MiSolicitudDocumentoDTO = z.infer<typeof MiSolicitudDocumentoDTOSchema>;

export const MiSolicitudDTOSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  estado: EstadoSolicitudSchema,
  modalidad: ModalidadSchema,
  programa: z.string(),
  titulo: z.string(),
  fechaRecepcion: z.string(),
  motivoObservacion: z.string().nullable(),
  motivoRechazo: z.string().nullable(),
  /** OBSERVADA: el tesista puede reemplazar documentos y reenviarla a revisión. */
  puedeSubsanar: z.boolean(),
  documentos: z.array(MiSolicitudDocumentoDTOSchema),
});
export type MiSolicitudDTO = z.infer<typeof MiSolicitudDTOSchema>;

/**
 * Respuesta de `POST /api/v1/mi-solicitud/:id/subsanar` (ruta multipart nativa:
 * un campo `archivo_<documentoId>` por cada documento reemplazado).
 */
export const SubsanacionPortalRespuestaSchema = z.object({
  ok: z.literal(true),
  mensaje: z.string(),
  documentosActualizados: z.number().int(),
});
export type SubsanacionPortalRespuesta = z.infer<typeof SubsanacionPortalRespuestaSchema>;

/* ========================================================================== */
/* CONTRATO TS-REST                                                           */
/* ========================================================================== */

export const solicitudesContract = c.router({
  // Bandeja Administrativa (Mockup Vista 1)
  listar: {
    method: "GET",
    path: "/api/v1/solicitudes",
    query: FiltrosSolicitudesQuerySchema,
    responses: {
      200: z.object({
        items: z.array(SolicitudResumenSchema),
        meta: PaginacionMetaSchema,
        kpis: KpisSolicitudesSchema,
      }),
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
    },
    summary: "Listar solicitudes en bandeja con filtros y KPIs",
  },

  // Código SET sugerido para modal de aprobación
  sugerirCodigoSet: {
    method: "GET",
    path: "/api/v1/solicitudes/sugerir-codigo-set",
    responses: {
      200: z.object({
        codigoSugerido: z.string(),
      }),
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
    },
    summary: "Calcula el siguiente código SET correlativo sugerido",
  },

  // Detalle Completo de Solicitud (Mockup Vista 2)
  obtenerPorId: {
    method: "GET",
    path: "/api/v1/solicitudes/:id",
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    responses: {
      200: z.object({
        solicitud: SolicitudDetalleDTOSchema,
      }),
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Obtener detalle completo de una solicitud",
  },

  // Corrección de datos menores antes de aceptar (RF-02xx[005])
  actualizarDatosMenores: {
    method: "PATCH",
    path: "/api/v1/solicitudes/:id/datos",
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: ActualizarDatosMenoresSchema,
    responses: {
      200: z.object({ ok: z.literal(true), mensaje: z.string() }),
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
      409: ErrorEnvelopeSchema,
    },
    summary: "Corregir errores menores en campos de la solicitud antes de aceptar",
  },

  // Checklist documentario: marcar conformidad por archivo
  actualizarConformidadDocumento: {
    method: "PATCH",
    path: "/api/v1/solicitudes/:id/documentos/:documentoId/conformidad",
    pathParams: z.object({
      id: z.string().uuid(),
      documentoId: z.string().uuid(),
    }),
    body: ActualizarConformidadDocumentoSchema,
    responses: {
      200: z.object({ ok: z.literal(true), estadoConformidad: EstadoConformidadDocumentoSchema }),
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Actualizar conformidad de un documento de la solicitud",
  },

  // Acción: Observar Solicitud
  observar: {
    method: "POST",
    path: "/api/v1/solicitudes/:id/observar",
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: ObservarSolicitudSchema,
    responses: {
      200: z.object({ ok: z.literal(true), mensaje: z.string() }),
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
      409: ErrorEnvelopeSchema,
    },
    summary: "Observar solicitud: crea las cuentas de los participantes y les avisa por correo",
  },

  // Acción: Rechazar Solicitud Definitivamente
  rechazar: {
    method: "POST",
    path: "/api/v1/solicitudes/:id/rechazar",
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: RechazarSolicitudSchema,
    responses: {
      200: z.object({ ok: z.literal(true), mensaje: z.string() }),
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
      409: ErrorEnvelopeSchema,
    },
    summary: "Rechazar solicitud con fundamento reglamentario",
  },

  // Acción: Aceptar y Generar Expediente SET (Mockup Vista 3)
  aceptar: {
    method: "POST",
    path: "/api/v1/solicitudes/:id/aceptar",
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: AceptarSolicitudSchema,
    responses: {
      200: z.object({
        ok: z.literal(true),
        expedienteId: z.string().uuid(),
        codigoSet: z.string(),
      }),
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
      409: ErrorEnvelopeSchema,
    },
    summary: "Aceptar solicitud y generar expediente SET con aprovisionamiento de cuentas",
  },

  // Portal del tesista: su solicitud más reciente (null si no tiene)
  miSolicitud: {
    method: "GET",
    path: "/api/v1/mi-solicitud",
    responses: {
      200: z.object({ solicitud: MiSolicitudDTOSchema.nullable() }),
      401: ErrorEnvelopeSchema,
    },
    summary: "Solicitud propia del tesista en sesión (observaciones y documentos)",
  },
});
