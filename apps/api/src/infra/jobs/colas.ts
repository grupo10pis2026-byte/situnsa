import { enqueue } from "./pg-boss.client.js";

/** Colas del sistema (pg-boss sobre Postgres, sin Redis — Lean). */
export const COLA_CORREOS = "correos";
export const COLA_RECORDATORIOS = "recordatorios";
export const COLA_REVISION_DOCUMENTOS = "revision-documentos"; // <-- 1. Nueva cola registrada

/**
 * Correo a encolar (HU-0058/0061/0062). Los destinatarios del expediente se
 * resuelven al enviar (si un correo cambia entre el evento y el envío, se usa
 * el vigente). `codigo/estado` se leen del expediente.
 */
export interface CorreoPayload {
  asunto: string;
  titulo: string;
  texto: string;
  /** Correos explícitos (responsables, usuario que restablece su clave…). */
  para?: string[];
  /** Expediente del evento: aporta código, estado y (opcional) participantes. */
  expedienteId?: string;
  /** Incluir a los participantes del expediente como destinatarios (default true). */
  aParticipantes?: boolean;
  enlace?: string;
  textoEnlace?: string;
}

export interface RecordatorioPayload {
  tipo: "revision-manual";
  notadoEn: string;
}
export interface RevisionDocumentoPayload {
  documentoId: string;
  rutaPdf: string;
  expedienteId: string;
}

/**
 * Encola un correo (best-effort: si la cola cae, el flujo principal ya hizo
 * commit; el error queda en el log y el worker reintenta lo encolado).
 */
export async function enqueueCorreo(payload: CorreoPayload): Promise<void> {
  try {
    await enqueue(COLA_CORREOS, payload, { retryLimit: 3, retryDelay: 60 });
  } catch (err) {
    console.error("[colas] no se pudo encolar correo", err);
  }
}
export async function enqueueRevisionDocumento(payload: RevisionDocumentoPayload): Promise<void> {
  try {
    // retryLimit: 3 intentará procesar el archivo 3 veces si hay error transitorio
    await enqueue(COLA_REVISION_DOCUMENTOS, payload, { retryLimit: 3, retryDelay: 60 });
  } catch (err) {
    console.error("[colas] no se pudo encolar la revisión del documento", err);
  }
}
