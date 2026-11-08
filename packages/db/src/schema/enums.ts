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

/**
 * Estados del taller. v1.0 (spec §6): ABIERTO_INSCRIPCIONES → COMPLETO →
 * EN_CURSO → FINALIZADO, y CANCELADO. ACTIVO y CERRADO son del modelo
 * anterior: se conservan hasta que el corte 3.3 migre los datos (Postgres no
 * permite quitar valores de un enum sin recrearlo).
 */
export const estadoTallerEnum = pgEnum("estado_taller", [
  "ACTIVO",
  "CERRADO",
  "CANCELADO",
  "ABIERTO_INSCRIPCIONES",
  "COMPLETO",
  "EN_CURSO",
  "FINALIZADO",
]);

export type EstadoTaller =
  | "ACTIVO"
  | "CERRADO"
  | "CANCELADO"
  | "ABIERTO_INSCRIPCIONES"
  | "COMPLETO"
  | "EN_CURSO"
  | "FINALIZADO";

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

/**
 * Sesiones del taller P4 (RF-0202 a RF-0205). v1.0 agrega REPROGRAMADA;
 * ABIERTA (ventana de automarcado) queda obsoleta: en v1.0 marca el asesor.
 */
export const estadoSesionEnum = pgEnum("estado_sesion", [
  "PROGRAMADA",
  "ABIERTA",
  "REALIZADA",
  "CANCELADA",
  "REPROGRAMADA",
]);

export type EstadoSesion = "PROGRAMADA" | "ABIERTA" | "REALIZADA" | "CANCELADA" | "REPROGRAMADA";

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

// ── Módulo Taller de Tesis v1.0 (spec §6) — paridad con @pis/domain taller/estados.ts ──

export const estadoTesistaTallerEnum = pgEnum("estado_tesista_taller", [
  "EN_TALLER",
  "PLAN_APROBADO",
  "ASESORIA_CERRADA",
  "RETIRADO",
]);

export const tipoHitoEnum = pgEnum("tipo_hito", [
  "PLAN",
  "AVANCE_1",
  "AVANCE_2",
  "AVANCE_3",
  "AVANCE_4",
  "BORRADOR_INTEGRADO",
  "BORRADOR_FINAL",
]);

export const estadoHitoEnum = pgEnum("estado_hito", [
  "NO_HABILITADO",
  "HABILITADO",
  "ENTREGADO",
  "APROBADO",
  "OBSERVADO",
  "NO_ENTREGADO",
]);

export const estadoPensionEnum = pgEnum("estado_pension", [
  "PENDIENTE",
  "EN_REVISION",
  "VALIDADA",
  "OBSERVADA",
  "VENCIDA",
]);

/** Cómo quedó validada una pensión (P9: comprobante o pago directo; D1: inscripción). */
export const medioPensionEnum = pgEnum("medio_pension", [
  "INSCRIPCION",
  "COMPROBANTE",
  "PAGO_DIRECTO",
]);

export const estadoComprobanteEnum = pgEnum("estado_comprobante", [
  "EN_REVISION",
  "VALIDADO",
  "OBSERVADO",
]);

export const estadoRegistroFichaEnum = pgEnum("estado_registro_ficha", [
  "SIN_REVISION",
  "REVISADO",
  "FIRMADO",
]);

export const tipoAlertaTallerEnum = pgEnum("tipo_alerta_taller", [
  "FALTAS_CONSECUTIVAS",
  "PLAN_NO_PRESENTADO",
  "AVANCE_INCUMPLIDO",
]);

export const estadoAlertaTallerEnum = pgEnum("estado_alerta_taller", [
  "ACTIVA",
  "ATENDIDA",
  "DESCARTADA",
]);
