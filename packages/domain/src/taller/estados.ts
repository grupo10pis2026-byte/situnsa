import { DomainError } from "../shared/domain-error.base.js";
import { fail, ok, type Result } from "../shared/result.js";

/**
 * Máquinas de estado del Módulo Taller v1.0 (spec §6). Paridad con los
 * enums de `packages/db/src/schema/enums.ts`. Cada `assert*` devuelve un
 * Result (nunca lanza) para usarse dentro de `uow.run`.
 */

function crearFsm<E extends string>(entidad: string, pares: ReadonlyArray<readonly [E, E]>) {
  const permitidas = new Set(pares.map(([a, b]) => `${a}>${b}`));
  const puede = (desde: E, hacia: E): boolean => permitidas.has(`${desde}>${hacia}`);
  const assert = (desde: E, hacia: E): Result<E, DomainError> =>
    puede(desde, hacia)
      ? ok(hacia)
      : fail(
          new DomainError(
            "TRANSICION_INVALIDA",
            `${entidad}: no se puede pasar de ${desde} a ${hacia}`,
          ),
        );
  return { puede, assert };
}

// ── Taller ─────────────────────────────────────────────────────────────
export type EstadoTallerCurso =
  | "ABIERTO_INSCRIPCIONES"
  | "COMPLETO"
  | "EN_CURSO"
  | "FINALIZADO"
  | "CANCELADO";

/** Estados en que el asesor "tiene taller activo" (§3: uno solo). */
export const ESTADOS_TALLER_VIGENTE: readonly EstadoTallerCurso[] = [
  "ABIERTO_INSCRIPCIONES",
  "COMPLETO",
  "EN_CURSO",
];

const fsmTaller = crearFsm<EstadoTallerCurso>("Taller", [
  ["ABIERTO_INSCRIPCIONES", "COMPLETO"],
  // Mover un proyecto a otro taller (o un retiro, si libera cupo) reabre.
  ["COMPLETO", "ABIERTO_INSCRIPCIONES"],
  ["ABIERTO_INSCRIPCIONES", "EN_CURSO"],
  ["COMPLETO", "EN_CURSO"],
  ["EN_CURSO", "FINALIZADO"],
  ["ABIERTO_INSCRIPCIONES", "CANCELADO"],
  ["COMPLETO", "CANCELADO"],
  ["EN_CURSO", "CANCELADO"],
]);
export const puedeTransitarTaller = fsmTaller.puede;
export const assertTransicionTaller = fsmTaller.assert;

// ── Sesión ─────────────────────────────────────────────────────────────
export type EstadoSesionCurso = "PROGRAMADA" | "REPROGRAMADA" | "REALIZADA" | "CANCELADA";

const fsmSesion = crearFsm<EstadoSesionCurso>("Sesión", [
  ["PROGRAMADA", "REALIZADA"],
  ["PROGRAMADA", "REPROGRAMADA"],
  ["REPROGRAMADA", "REPROGRAMADA"],
  ["REPROGRAMADA", "REALIZADA"],
  ["PROGRAMADA", "CANCELADA"],
  ["REPROGRAMADA", "CANCELADA"],
]);
export const puedeTransitarSesion = fsmSesion.puede;
export const assertTransicionSesion = fsmSesion.assert;

// ── Tesista dentro del taller ──────────────────────────────────────────
export type EstadoTesistaTaller = "EN_TALLER" | "PLAN_APROBADO" | "ASESORIA_CERRADA" | "RETIRADO";

/** Estados que ocupan al alumno (§3: un alumno, un solo taller activo). */
export const ESTADOS_TESISTA_ACTIVO: readonly EstadoTesistaTaller[] = [
  "EN_TALLER",
  "PLAN_APROBADO",
];

const fsmTesista = crearFsm<EstadoTesistaTaller>("Tesista", [
  ["EN_TALLER", "PLAN_APROBADO"],
  ["PLAN_APROBADO", "ASESORIA_CERRADA"],
  ["EN_TALLER", "RETIRADO"],
  ["PLAN_APROBADO", "RETIRADO"],
]);
export const puedeTransitarTesista = fsmTesista.puede;
export const assertTransicionTesista = fsmTesista.assert;

// ── Hito (por proyecto) ────────────────────────────────────────────────
export type EstadoHito =
  | "NO_HABILITADO"
  | "HABILITADO"
  | "ENTREGADO"
  | "APROBADO"
  | "OBSERVADO"
  | "NO_ENTREGADO";

const fsmHito = crearFsm<EstadoHito>("Hito", [
  ["NO_HABILITADO", "HABILITADO"],
  ["HABILITADO", "ENTREGADO"],
  ["ENTREGADO", "APROBADO"],
  ["ENTREGADO", "OBSERVADO"],
  ["OBSERVADO", "ENTREGADO"],
  ["HABILITADO", "NO_ENTREGADO"],
  ["OBSERVADO", "NO_ENTREGADO"],
]);
export const puedeTransitarHito = fsmHito.puede;
export const assertTransicionHito = fsmHito.assert;

// ── Entrega (versión) ──────────────────────────────────────────────────
/** Paridad con el enum de BD `estado_entrega` (ENTREGADA/CONFORME/OBSERVADA). */
export type EstadoEntregaVersion = "ENTREGADA" | "CONFORME" | "OBSERVADA";

/** §6: una versión revisada no vuelve a cambiar. */
const fsmEntrega = crearFsm<EstadoEntregaVersion>("Entrega", [
  ["ENTREGADA", "CONFORME"],
  ["ENTREGADA", "OBSERVADA"],
]);
export const puedeTransitarEntrega = fsmEntrega.puede;
export const assertTransicionEntrega = fsmEntrega.assert;

// ── Pensión del alumno ─────────────────────────────────────────────────
export type EstadoPension = "PENDIENTE" | "EN_REVISION" | "VALIDADA" | "OBSERVADA" | "VENCIDA";

const fsmPension = crearFsm<EstadoPension>("Pensión", [
  ["PENDIENTE", "EN_REVISION"],
  ["VENCIDA", "EN_REVISION"],
  ["EN_REVISION", "VALIDADA"],
  ["EN_REVISION", "OBSERVADA"],
  ["OBSERVADA", "EN_REVISION"],
  ["PENDIENTE", "VENCIDA"],
  // P9 "Registrar pago" sin comprobante.
  ["PENDIENTE", "VALIDADA"],
  ["VENCIDA", "VALIDADA"],
  ["OBSERVADA", "VALIDADA"],
]);
export const puedeTransitarPension = fsmPension.puede;
export const assertTransicionPension = fsmPension.assert;

// ── Registro de la Ficha de Control ───────────────────────────────────
export type EstadoRegistroFicha = "SIN_REVISION" | "REVISADO" | "FIRMADO";

const fsmFicha = crearFsm<EstadoRegistroFicha>("Ficha", [
  ["SIN_REVISION", "REVISADO"],
  ["REVISADO", "FIRMADO"],
  // (propuesta) modificar un registro firmado exige motivo y reinicia la firma.
  ["FIRMADO", "REVISADO"],
]);
export const puedeTransitarFicha = fsmFicha.puede;
export const assertTransicionFicha = fsmFicha.assert;

// ── Alerta ─────────────────────────────────────────────────────────────
export type EstadoAlertaTaller = "ACTIVA" | "ATENDIDA" | "DESCARTADA";
export type TipoAlertaTaller = "FALTAS_CONSECUTIVAS" | "PLAN_NO_PRESENTADO" | "AVANCE_INCUMPLIDO";

const fsmAlerta = crearFsm<EstadoAlertaTaller>("Alerta", [
  ["ACTIVA", "ATENDIDA"],
  ["ACTIVA", "DESCARTADA"],
]);
export const puedeTransitarAlerta = fsmAlerta.puede;
export const assertTransicionAlerta = fsmAlerta.assert;
