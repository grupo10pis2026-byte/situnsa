import { pgEnum } from "drizzle-orm/pg-core";

/** Estados macro del expediente — docs/02-domain/state-machine.md §2 */
export const estadoExpedienteEnum = pgEnum("estado_expediente", [
  "REGISTRADO",
  "EN_PLAN",
  "PLAN_APROBADO",
  "EN_BORRADOR",
  "EN_DICTAMEN",
  "APTO_SUSTENTACION",
  "SUSTENTADO",
  "EN_VALIDACION",
  "EN_APROBACION",
  "TITULO_EMITIDO",
  "OBSERVADO",
  "DESAPROBADO_TRUNCO",
  "ANULADO",
]);

export type EstadoExpediente =
  | "REGISTRADO"
  | "EN_PLAN"
  | "PLAN_APROBADO"
  | "EN_BORRADOR"
  | "EN_DICTAMEN"
  | "APTO_SUSTENTACION"
  | "SUSTENTADO"
  | "EN_VALIDACION"
  | "EN_APROBACION"
  | "TITULO_EMITIDO"
  | "OBSERVADO"
  | "DESAPROBADO_TRUNCO"
  | "ANULADO";

export const rolUsuarioEnum = pgEnum("rol_usuario", [
  "TESISTA",
  "ASESOR",
  "JURADO",
  "ADMIN_FIPS",
  "SECRETARIA",
  "DECANO",
  "INVITADO",
]);

export type RolUsuario =
  | "TESISTA"
  | "ASESOR"
  | "JURADO"
  | "ADMIN_FIPS"
  | "SECRETARIA"
  | "DECANO"
  | "INVITADO";

export const modalidadEnum = pgEnum("modalidad", ["TESIS", "TRABAJO_ACADEMICO", "ARTICULO"]);

export type Modalidad = "TESIS" | "TRABAJO_ACADEMICO" | "ARTICULO";

export const estadoDocumentoEnum = pgEnum("estado_documento", [
  "PENDIENTE",
  "CARGADO",
  "OBSERVADO",
  "APROBADO",
  "RECHAZADO",
]);

/** Seguimiento de subetapas (legacy FLUJO_TITULACION, INTERFACES §9). */
export const estadoSubetapaEnum = pgEnum("estado_subetapa", [
  "NO_INICIADO",
  "EN_CURSO",
  "FINALIZADO",
]);

export type EstadoSubetapa = "NO_INICIADO" | "EN_CURSO" | "FINALIZADO";

export const estadoTallerEnum = pgEnum("estado_taller", ["ACTIVO", "CERRADO", "CANCELADO"]);

export type EstadoTaller = "ACTIVO" | "CERRADO" | "CANCELADO";

export const estadoGrupoEnum = pgEnum("estado_grupo", ["PLANIFICADO", "ACTIVO", "CONCLUIDO"]);

export type EstadoGrupo = "PLANIFICADO" | "ACTIVO" | "CONCLUIDO";

export const estadoCuotaEnum = pgEnum("estado_cuota", [
  "PENDIENTE",
  "EN_REVISION",
  "VALIDADO",
  "OBSERVADO",
  "PAGADA",
  "VENCIDA",
  "EXONERADA",
]);

export type EstadoCuota =
  | "PENDIENTE"
  | "EN_REVISION"
  | "VALIDADO"
  | "OBSERVADO"
  | "PAGADA"
  | "VENCIDA"
  | "EXONERADA";

/** Sesiones del taller P4 (RF-0202 a RF-0205). */
export const estadoSesionEnum = pgEnum("estado_sesion", [
  "PROGRAMADA",
  "ABIERTA",
  "REALIZADA",
  "CANCELADA",
]);

export type EstadoSesion = "PROGRAMADA" | "ABIERTA" | "REALIZADA" | "CANCELADA";

/** Asistencia por alumno (PENDIENTE solo con ventana abierta). */
export const estadoAsistenciaEnum = pgEnum("estado_asistencia", [
  "PENDIENTE",
  "PRESENTE",
  "FALTA",
  "JUSTIFICADA",
]);

export type EstadoAsistencia = "PENDIENTE" | "PRESENTE" | "FALTA" | "JUSTIFICADA";

/** Cumplimiento de fase por alumno P6 (observada exige comentario). */
export const estadoCumplimientoEnum = pgEnum("estado_cumplimiento", [
  "PENDIENTE",
  "CUMPLIDA",
  "OBSERVADA",
]);

export type EstadoCumplimiento = "PENDIENTE" | "CUMPLIDA" | "OBSERVADA";

/** Entregas de avances P6/P7 (se conserva el historial de versiones). */
export const estadoEntregaEnum = pgEnum("estado_entrega", ["ENTREGADA", "CONFORME", "OBSERVADA"]);

export type EstadoEntrega = "ENTREGADA" | "CONFORME" | "OBSERVADA";

/** Revisión automática de documentos (carátula, datos, ortografía). */
export const estadoRevisionDocumentoEnum = pgEnum("estado_revision_documento", [
  "PENDIENTE",
  "EN_PROCESO",
  "COMPLETADO",
  "FALLIDO",
]);

export type EstadoRevisionDocumento = "PENDIENTE" | "EN_PROCESO" | "COMPLETADO" | "FALLIDO";

/** Módulo de Obtención de Datos: Estados de la Solicitud (RF-02xx[000..015]) */
export const estadoSolicitudEnum = pgEnum("estado_solicitud", [
  "NUEVA",
  "EN_REVISION",
  "OBSERVADA",
  "ACEPTADA",
  "RECHAZADA",
]);

export type EstadoSolicitud = "NUEVA" | "EN_REVISION" | "OBSERVADA" | "ACEPTADA" | "RECHAZADA";

export const viaIngresoEnum = pgEnum("via_ingreso", ["REGULAR", "TALLER"]);

export type ViaIngreso = "REGULAR" | "TALLER";

export const estadoConformidadDocumentoEnum = pgEnum("estado_conformidad_documento", [
  "PENDIENTE",
  "CONFORME",
  "OBSERVADO",
]);

export type EstadoConformidadDocumento = "PENDIENTE" | "CONFORME" | "OBSERVADO";
