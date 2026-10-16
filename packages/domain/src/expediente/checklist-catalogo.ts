/** Catálogo de checklist documental por etapa (INTERFACES §§7–8, RF-01/RF-03). Puro, sin I/O. */

import type { ClaveSubetapa } from "./seguimiento-catalogo.js";

export interface ChecklistDef {
  readonly tipo: string;
  readonly nombre: string;
  readonly etapa: "E1" | "E2";
  readonly obligatorio: boolean;
  /**
   * Subetapa que no puede finalizarse sin este documento (guarda de
   * reglas-avance.ts) y en la que el tesista lo carga (RN-06). `null` =
   * documento informativo sin guarda.
   */
  readonly requeridoEn: ClaveSubetapa | null;
}

/** Etapa 01 — documentos de entrada del plan (carga del tesista, E1.1). */
export const CHECKLIST_E1: readonly ChecklistDef[] = [
  {
    tipo: "SOLICITUD_INSCRIPCION",
    nombre: "Solicitud de inscripción del plan",
    etapa: "E1",
    obligatorio: true,
    requeridoEn: "E1_PRESENTACION_PLAN",
  },
  {
    tipo: "ACEPTACION_ASESORIA",
    nombre: "Formato de aceptación de asesoría",
    etapa: "E1",
    obligatorio: true,
    requeridoEn: "E1_PRESENTACION_PLAN",
  },
  {
    tipo: "PLAN_ESTRUCTURADO",
    nombre: "Plan estructurado de tesis",
    etapa: "E1",
    obligatorio: true,
    requeridoEn: "E1_PRESENTACION_PLAN",
  },
  {
    tipo: "DJ_CONFIDENCIALIDAD",
    nombre: "DJ de confidencialidad",
    etapa: "E1",
    obligatorio: true,
    requeridoEn: "E1_PRESENTACION_PLAN",
  },
  {
    tipo: "ANEXO_17",
    nombre: "Anexo 17",
    etapa: "E1",
    obligatorio: true,
    requeridoEn: "E1_PRESENTACION_PLAN",
  },
  {
    tipo: "ANEXO_18",
    nombre: "Anexo 18",
    etapa: "E1",
    obligatorio: true,
    requeridoEn: "E1_PRESENTACION_PLAN",
  },
  {
    tipo: "ANEXO_33",
    nombre: "Anexo 33",
    etapa: "E1",
    obligatorio: true,
    requeridoEn: "E1_PRESENTACION_PLAN",
  },
];

/** Etapa 02 — actas y anexos del borrador/sustentación (RF-03/04/05). */
export const CHECKLIST_E2: readonly ChecklistDef[] = [
  {
    tipo: "ACTA_CONFORMIDAD",
    nombre: "Acta de conformidad de tesis",
    etapa: "E2",
    obligatorio: true,
    requeridoEn: "E2_CARGA_DOCUMENTOS",
  },
  {
    tipo: "ACTA_DICTAMEN",
    nombre: "Acta de dictamen de tesis",
    etapa: "E2",
    obligatorio: true,
    requeridoEn: "E3_CONFORMIDAD_FINAL",
  },
  {
    tipo: "ACTA_SUSTENTACION",
    nombre: "Acta de sustentación",
    etapa: "E2",
    obligatorio: true,
    requeridoEn: "E4_SUSTENTACION",
  },
  {
    tipo: "ANEXO_27",
    nombre: "Anexo N° 27 — Solicitud para optar título 2da especialidad",
    etapa: "E2",
    obligatorio: true,
    requeridoEn: "E2_CARGA_DOCUMENTOS",
  },
  {
    tipo: "ANEXO_01_DJ",
    nombre: "Anexo N° 01 — Declaración jurada",
    etapa: "E2",
    obligatorio: true,
    requeridoEn: "E2_CARGA_DOCUMENTOS",
  },
  {
    tipo: "ANEXO_02_DJ",
    nombre: "Anexo N° 02 — DJ no antecedentes penales y terrorismo",
    etapa: "E2",
    obligatorio: true,
    requeridoEn: "E2_CARGA_DOCUMENTOS",
  },
  {
    tipo: "ANEXO_32_VERACIDAD",
    nombre: "Anexo N° 32 — DJ veracidad de la información",
    etapa: "E2",
    obligatorio: true,
    requeridoEn: "E2_CARGA_DOCUMENTOS",
  },
  {
    tipo: "AUTORIZACION_IMPRESION",
    nombre: "Autorización de impresión de tesis",
    etapa: "E2",
    obligatorio: true,
    requeridoEn: "E4_VERSION_FINAL",
  },
  {
    tipo: "AUTORIZACION_PUBLICACION",
    nombre: "Autorización de publicación de tesis",
    etapa: "E2",
    obligatorio: true,
    requeridoEn: "E5_REPOSITORIO",
  },
  {
    tipo: "CARATULA_FINAL",
    nombre: "Carátula plan de tesis final",
    etapa: "E2",
    obligatorio: false,
    requeridoEn: "E4_VERSION_FINAL",
  },
];

export const CHECKLIST_COMPLETO: readonly ChecklistDef[] = [...CHECKLIST_E1, ...CHECKLIST_E2];

/**
 * RN-06: documentos que el tesista puede cargar en este momento — los
 * requeridos en la subetapa activa, los OBSERVADOS (subsanación) y, durante
 * el levantamiento de observaciones del plan (E1.5), la nueva versión del plan.
 */
export function cargaHabilitadaTesista(
  doc: { tipo: string; requeridoEn: string | null; estado: string },
  subetapaActiva: string | null,
): boolean {
  if (doc.estado === "OBSERVADO") return true;
  if (!subetapaActiva) return false;
  if (doc.requeridoEn === subetapaActiva) return true;
  return subetapaActiva === "E1_LEVANTAMIENTO" && doc.tipo === "PLAN_ESTRUCTURADO";
}
