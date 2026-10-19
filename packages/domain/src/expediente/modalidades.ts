/**
 * Modalidades (RN-L10/L15, HU-0069): etiquetas legacy exactas del ComboBox
 * + enum canónico para lógica/FSM. MODALIDAD_FINAL no se recalcula.
 */

export const ETIQUETAS_MODALIDAD = [
  "Plan de Tesis",
  "Plan de Trabajo Académico",
  "Plan de Tesis Formato Artículo",
] as const;

export type EtiquetaModalidad = (typeof ETIQUETAS_MODALIDAD)[number];

export const ETIQUETAS_MODALIDAD_FINAL = [
  "La Tesis",
  "El Trabajo Académico",
  "La Tesis Formato Artículo",
] as const;

export type EtiquetaModalidadFinal = (typeof ETIQUETAS_MODALIDAD_FINAL)[number];

export type ModalidadCanon = "TESIS" | "TRABAJO_ACADEMICO" | "ARTICULO";

const A_CANON: Readonly<Record<EtiquetaModalidad, ModalidadCanon>> = {
  "Plan de Tesis": "TESIS",
  "Plan de Trabajo Académico": "TRABAJO_ACADEMICO",
  "Plan de Tesis Formato Artículo": "ARTICULO",
};

const A_ETIQUETA: Readonly<Record<ModalidadCanon, EtiquetaModalidad>> = {
  TESIS: "Plan de Tesis",
  TRABAJO_ACADEMICO: "Plan de Trabajo Académico",
  ARTICULO: "Plan de Tesis Formato Artículo",
};

export function modalidadACanon(etiqueta: string): ModalidadCanon | null {
  const v = (Object.keys(A_CANON) as EtiquetaModalidad[]).find((k) => k === etiqueta) ?? null;
  return v ? A_CANON[v] : null;
}

export function modalidadAEtiqueta(canon: ModalidadCanon): EtiquetaModalidad {
  return A_ETIQUETA[canon];
}

/** RN-L07: administrativos en MAYÚSCULAS (los nombres y títulos llevan formato formal propio). */
const CAMPOS_MAYUSCULAS = new Set([
  "programa",
  "nroDecreto",
  "recomendacion",
  "nroOficio",
  "lugarSustentacion",
]);

export function normalizarAdministrativo(campo: string, valor: string): string {
  const v = valor.trim();
  if (!CAMPOS_MAYUSCULAS.has(campo)) return v;
  return v.toUpperCase();
}
