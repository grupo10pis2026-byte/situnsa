import { DomainError } from "../shared/domain-error.base.js";
import { fail, ok, type Result } from "../shared/result.js";
import { HITOS_TALLER, SEMANAS_CURSO, type TipoHito } from "./calendario.js";
import { esFechaCivilValida } from "./fechas-civiles.js";

/**
 * Reglas de la Configuración del taller (spec v1.0 §9 P16): feriados,
 * plan institucional de 12 semanas y catálogo de especialidades.
 */

const negar = (motivo: string) => fail(new DomainError("VALIDACION_FALLIDA", motivo));

/** Colapsa espacios repetidos y recorta (los nombres se comparan sin esto). */
export function normalizarTexto(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ── Feriados ───────────────────────────────────────────────────────────
export function validarFeriado(input: {
  fecha: string;
  nombre: string;
}): Result<{ fecha: string; nombre: string }, DomainError> {
  if (!esFechaCivilValida(input.fecha)) return negar("Elige una fecha válida");
  const nombre = normalizarTexto(input.nombre);
  if (nombre.length < 3) return negar("Escribe el nombre del feriado");
  if (nombre.length > 160) return negar("El nombre es demasiado largo (máximo 160 caracteres)");
  return ok({ fecha: input.fecha, nombre });
}

// ── Plan institucional ─────────────────────────────────────────────────
export interface MarcasHito {
  esHito: boolean;
  fijo: boolean;
  tipo: TipoHito | null;
}

/**
 * Qué semanas son hito y cuáles son fijas lo definen las reglas del taller
 * (§3: hitos en las semanas 2, 4, 6, 8, 10, 11 y 12; fijas la 2 y la 12),
 * no la pantalla: los hitos de cada proyecto dependen de ellas.
 */
export function marcasHitoSemana(semana: number): MarcasHito {
  const h = HITOS_TALLER.find((x) => x.semana === semana);
  return h
    ? { esHito: true, fijo: h.fijo, tipo: h.tipo }
    : { esHito: false, fijo: false, tipo: null };
}

export function validarSemanaPlan(input: {
  semana: number;
  contenido: string;
  entregable: string | null;
}): Result<{ semana: number; contenido: string; entregable: string | null }, DomainError> {
  if (!Number.isInteger(input.semana) || input.semana < 1 || input.semana > SEMANAS_CURSO)
    return negar(`La semana debe estar entre 1 y ${SEMANAS_CURSO}`);
  const contenido = normalizarTexto(input.contenido);
  if (contenido.length < 3) return negar("Escribe el contenido de la semana");
  if (contenido.length > 500) return negar("El contenido es demasiado largo (máximo 500)");
  const entregable = input.entregable === null ? "" : normalizarTexto(input.entregable);
  if (entregable.length > 200) return negar("El entregable es demasiado largo (máximo 200)");
  if (entregable === "" && marcasHitoSemana(input.semana).esHito)
    return negar("Esta semana es un hito: escribe su entregable");
  return ok({ semana: input.semana, contenido, entregable: entregable === "" ? null : entregable });
}

// ── Especialidades de los asesores ─────────────────────────────────────
export function validarNombreEspecialidad(nombre: string): Result<string, DomainError> {
  const n = normalizarTexto(nombre);
  if (n.length < 2) return negar("Escribe el nombre de la especialidad");
  if (n.length > 120) return negar("El nombre es demasiado largo (máximo 120 caracteres)");
  return ok(n);
}
