import { DomainError } from "../shared/domain-error.base.js";
import type { DomainEvent } from "../shared/domain-event.base.js";
import { fail, ok, type Result } from "../shared/result.js";

export type EstadoSolicitud = "NUEVA" | "EN_REVISION" | "OBSERVADA" | "ACEPTADA" | "RECHAZADA";

export type ViaIngreso = "REGULAR" | "TALLER";

type TransicionSolicitudKey = `${EstadoSolicitud}>${EstadoSolicitud}`;

/**
 * Transiciones legales según la FSM del módulo de obtención de datos:
 * - NUEVA -> EN_REVISION (apertura por personal administrativo)
 * - EN_REVISION -> OBSERVADA (observación con emisión de token)
 * - OBSERVADA -> EN_REVISION (subsanación del postulante)
 * - EN_REVISION -> ACEPTADA (checklist conforme y creación de expediente SET)
 * - EN_REVISION -> RECHAZADA (dictamen de rechazo formal)
 * - OBSERVADA -> RECHAZADA (rechazo si expira el plazo o causal sobreviniente)
 */
const TRANSICIONES_SOLICITUD: ReadonlySet<TransicionSolicitudKey> = new Set<TransicionSolicitudKey>(
  [
    "NUEVA>EN_REVISION",
    "EN_REVISION>OBSERVADA",
    "OBSERVADA>EN_REVISION",
    "EN_REVISION>ACEPTADA",
    "EN_REVISION>RECHAZADA",
    "OBSERVADA>RECHAZADA",
  ],
);

export function canTransitionSolicitud(from: EstadoSolicitud, to: EstadoSolicitud): boolean {
  return TRANSICIONES_SOLICITUD.has(`${from}>${to}` as TransicionSolicitudKey);
}

export function assertTransitionSolicitud(
  from: EstadoSolicitud,
  to: EstadoSolicitud,
): Result<void, DomainError> {
  if (canTransitionSolicitud(from, to)) {
    return ok(undefined);
  }
  return fail(
    new DomainError("TRANSICION_INVALIDA", `Transición de solicitud ilegal: ${from} → ${to}`),
  );
}

export interface SolicitudParticipanteData {
  nombres: string;
  apellidos: string;
  dni: string;
  email: string;
  telefono?: string;
  cui?: string;
}

/**
 * Reglas de validación pura para participantes de la solicitud:
 * - DNI exactamente de 8 dígitos numéricos.
 * - Nombres y apellidos obligatorios.
 * - Emails sintácticamente válidos.
 * - Si hay dos participantes, DNI y correo deben ser distintos.
 */
export function validarParticipantesSolicitud(
  p1: SolicitudParticipanteData,
  p2?: SolicitudParticipanteData | null,
): Result<void, DomainError> {
  const dniRegex = /^\d{8}$/;
  if (!dniRegex.test(p1.dni.trim())) {
    return fail(
      new DomainError("VALIDACION_FALLIDA", "El DNI del Tesista 01 debe tener 8 dígitos numéricos"),
    );
  }
  if (!p1.nombres.trim() || !p1.apellidos.trim()) {
    return fail(
      new DomainError("VALIDACION_FALLIDA", "Nombres y apellidos del Tesista 01 son obligatorios"),
    );
  }
  if (!p1.email.trim() || !p1.email.includes("@")) {
    return fail(new DomainError("VALIDACION_FALLIDA", "Correo del Tesista 01 es inválido"));
  }

  if (p2) {
    if (!dniRegex.test(p2.dni.trim())) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          "El DNI del Tesista 02 debe tener 8 dígitos numéricos",
        ),
      );
    }
    if (!p2.nombres.trim() || !p2.apellidos.trim()) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          "Nombres y apellidos del Tesista 02 son obligatorios",
        ),
      );
    }
    if (!p2.email.trim() || !p2.email.includes("@")) {
      return fail(new DomainError("VALIDACION_FALLIDA", "Correo del Tesista 02 es inválido"));
    }
    if (p1.dni.trim() === p2.dni.trim()) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          "El Tesista 01 y el Tesista 02 no pueden tener el mismo DNI",
        ),
      );
    }
    if (p1.email.trim().toLowerCase() === p2.email.trim().toLowerCase()) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          "Cada tesista debe registrar un correo electrónico distinto",
        ),
      );
    }
  }

  return ok(undefined);
}

export interface SolicitudObservadaEvent extends DomainEvent {
  readonly type: "SolicitudObservada";
  readonly solicitudId: string;
  readonly fechaLimite: Date;
}

export interface SolicitudAceptadaEvent extends DomainEvent {
  readonly type: "SolicitudAceptada";
  readonly solicitudId: string;
  readonly expedienteId: string;
  readonly codigoSet: string;
}

/**
 * Agregado raíz Solicitud (Pre-expediente).
 * Controla el ciclo de vida, invariantes y emisión de eventos de dominio.
 */
export class SolicitudAggregate {
  private events: DomainEvent[] = [];

  constructor(
    readonly id: string,
    readonly codigo: string,
    readonly via: ViaIngreso,
    private estado: EstadoSolicitud,
    private expedienteId: string | null = null,
  ) {}

  getEstado(): EstadoSolicitud {
    return this.estado;
  }

  getExpedienteId(): string | null {
    return this.expedienteId;
  }

  pullEvents(): DomainEvent[] {
    const ev = [...this.events];
    this.events = [];
    return ev;
  }

  abrirRevision(): Result<void, DomainError> {
    const check = assertTransitionSolicitud(this.estado, "EN_REVISION");
    if (!check.ok) return check;
    this.estado = "EN_REVISION";
    return ok(undefined);
  }

  observar(fechaLimite: Date): Result<void, DomainError> {
    const check = assertTransitionSolicitud(this.estado, "OBSERVADA");
    if (!check.ok) return check;
    this.estado = "OBSERVADA";
    this.events.push({
      type: "SolicitudObservada",
      occurredAt: new Date(),
      solicitudId: this.id,
      fechaLimite,
    } as SolicitudObservadaEvent);
    return ok(undefined);
  }

  subsanar(): Result<void, DomainError> {
    const check = assertTransitionSolicitud(this.estado, "EN_REVISION");
    if (!check.ok) return check;
    this.estado = "EN_REVISION";
    return ok(undefined);
  }

  rechazar(): Result<void, DomainError> {
    const check = assertTransitionSolicitud(this.estado, "RECHAZADA");
    if (!check.ok) return check;
    this.estado = "RECHAZADA";
    return ok(undefined);
  }

  aceptar(expedienteId: string, codigoSet: string): Result<void, DomainError> {
    const check = assertTransitionSolicitud(this.estado, "ACEPTADA");
    if (!check.ok) return check;
    this.estado = "ACEPTADA";
    this.expedienteId = expedienteId;
    this.events.push({
      type: "SolicitudAceptada",
      occurredAt: new Date(),
      solicitudId: this.id,
      expedienteId,
      codigoSet,
    } as SolicitudAceptadaEvent);
    return ok(undefined);
  }
}
