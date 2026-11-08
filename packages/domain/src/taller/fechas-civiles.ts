/**
 * Aritmética de fechas civiles (AAAA-MM-DD, hora de Perú) sin zonas horarias:
 * se opera en UTC sobre la fecha "tal cual" para que el resultado no dependa
 * del huso del servidor. Uso interno del módulo Taller v1.
 */

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaCivilValida(s: string): boolean {
  if (!FECHA_RE.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  if (a === undefined || m === undefined || d === undefined) return false;
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function aDate(s: string): Date {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function aTexto(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Suma (o resta) días a una fecha civil. */
export function sumarDias(fecha: string, dias: number): string {
  const d = aDate(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return aTexto(d);
}

/** Día ISO: 1 = lunes … 7 = domingo. */
export function diaIso(fecha: string): number {
  return ((aDate(fecha).getUTCDay() + 6) % 7) + 1;
}

/** Días transcurridos de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diferenciaDias(desde: string, hasta: string): number {
  return Math.round((aDate(hasta).getTime() - aDate(desde).getTime()) / 86_400_000);
}

const NOMBRES_DIA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function nombreDia(fecha: string): string {
  return NOMBRES_DIA[diaIso(fecha)] ?? "";
}
