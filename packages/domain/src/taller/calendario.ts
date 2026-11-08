import { DomainError } from "../shared/domain-error.base.js";
import { fail, ok, type Result } from "../shared/result.js";
import { diaIso, esFechaCivilValida, nombreDia, sumarDias } from "./fechas-civiles.js";

/**
 * Calendario del Curso Taller de Tesis (spec v1.0 §3 y §5). Puro: recibe los
 * feriados como dato (tabla `feriados`), nunca los lee.
 *
 * Semana n: la semana 1 es el primer fin de semana del curso (sábado y
 * domingo del inicio); la semana n empieza n−1 semanas después.
 */

export const SEMANAS_CURSO = 12;

/** Hitos por proyecto (§3). `fijo` = no se prorroga ni se ajusta por proyecto. */
export const HITOS_TALLER = [
  { tipo: "PLAN", semana: 2, nombre: "Plan de tesis", fijo: true },
  { tipo: "AVANCE_1", semana: 4, nombre: "Avance 1", fijo: false },
  { tipo: "AVANCE_2", semana: 6, nombre: "Avance 2", fijo: false },
  { tipo: "AVANCE_3", semana: 8, nombre: "Avance 3", fijo: false },
  { tipo: "AVANCE_4", semana: 10, nombre: "Avance 4", fijo: false },
  { tipo: "BORRADOR_INTEGRADO", semana: 11, nombre: "Borrador integrado", fijo: false },
  { tipo: "BORRADOR_FINAL", semana: 12, nombre: "Borrador final", fijo: true },
] as const;

export type TipoHito = (typeof HITOS_TALLER)[number]["tipo"];

export const TIPOS_HITO: readonly TipoHito[] = HITOS_TALLER.map((h) => h.tipo);

/** Ficha de Control (Anexo 1, §9 P11): 6 filas fijas por proyecto. */
export const FICHA_SEMANAS = [
  { semana: 2, avanceRevisado: "Plan de tesis" },
  { semana: 4, avanceRevisado: "Avance 1" },
  { semana: 6, avanceRevisado: "Avance 2" },
  { semana: 8, avanceRevisado: "Avance 3" },
  { semana: 10, avanceRevisado: "Avance 4" },
  { semana: 12, avanceRevisado: "Borrador final" },
] as const;

/** Pensiones (§3): siempre 3. La 1.ª "al inscribirse" (sin semana). */
export const PENSIONES_TALLER = [
  { numero: 1, semana: null },
  { numero: 2, semana: 4 },
  { numero: 3, semana: 8 },
] as const;

/** Días de sesión por defecto (§3): sábado 15–20 h y domingo 08–13 h. */
export const DIAS_SESION_DEFECTO = [
  { dia: 6, horaInicio: "15:00", horaFin: "20:00" },
  { dia: 7, horaInicio: "08:00", horaFin: "13:00" },
] as const;

/**
 * Sábado de la semana 1. Si el inicio cae sábado es ese día; si cae domingo,
 * el sábado anterior (mismo fin de semana); en otro caso, el sábado siguiente.
 */
export function sabadoSemana1(inicio: string): string {
  const d = diaIso(inicio);
  if (d === 6) return inicio;
  if (d === 7) return sumarDias(inicio, -1);
  return sumarDias(inicio, 6 - d);
}

export function sabadoDeSemana(inicio: string, semana: number): string {
  return sumarDias(sabadoSemana1(inicio), 7 * (semana - 1));
}

/** §5 Fecha de un hito: el domingo de su semana. */
export function fechaHito(inicio: string, semana: number): string {
  return sumarDias(sabadoDeSemana(inicio, semana), 1);
}

/** §5 Fecha de pensión por defecto: el sábado de su semana. */
export function fechaPensionPorDefecto(inicio: string, semana: number): string {
  return sabadoDeSemana(inicio, semana);
}

/** §9 P2 (propuesta): fin sugerido = domingo de la semana 12. */
export function finSugerido(inicio: string): string {
  return fechaHito(inicio, SEMANAS_CURSO);
}

export interface HitoProgramado {
  tipo: TipoHito;
  semana: number;
  nombre: string;
  fijo: boolean;
  fechaLimite: string;
}

export function hitosProgramados(inicio: string): HitoProgramado[] {
  return HITOS_TALLER.map((h) => ({
    tipo: h.tipo,
    semana: h.semana,
    nombre: h.nombre,
    fijo: h.fijo,
    fechaLimite: fechaHito(inicio, h.semana),
  }));
}

export type TipoReporteTaller = "SEMANA_2" | "QUINCENAL" | "CIERRE";

export interface ReporteProgramado {
  tipo: TipoReporteTaller;
  /** Hito tras el que se genera. */
  hito: TipoHito;
  fecha: string;
}

/**
 * §3/§5 Reportes a la Unidad: el lunes siguiente al hito de la semana 2,
 * el lunes siguiente a cada avance (quincenal) y el lunes tras la semana 12.
 */
export function reportesProgramados(inicio: string): ReporteProgramado[] {
  const lunesTras = (semana: number) => sumarDias(fechaHito(inicio, semana), 1);
  return [
    { tipo: "SEMANA_2", hito: "PLAN", fecha: lunesTras(2) },
    { tipo: "QUINCENAL", hito: "AVANCE_1", fecha: lunesTras(4) },
    { tipo: "QUINCENAL", hito: "AVANCE_2", fecha: lunesTras(6) },
    { tipo: "QUINCENAL", hito: "AVANCE_3", fecha: lunesTras(8) },
    { tipo: "QUINCENAL", hito: "AVANCE_4", fecha: lunesTras(10) },
    { tipo: "CIERRE", hito: "BORRADOR_FINAL", fecha: lunesTras(12) },
  ];
}

export interface DiaSesion {
  /** Día ISO 1 (lunes) … 7 (domingo). */
  dia: number;
  horaInicio: string;
  horaFin: string;
}

export interface ProponerSesionesInput {
  inicio: string;
  fin: string;
  dias: DiaSesion[];
  /** Feriados ACTIVOS: fecha → nombre. */
  feriados: ReadonlyMap<string, string>;
  /** Número de sesiones del taller (24 por defecto). */
  objetivo: number;
}

export interface SesionPropuesta {
  nro: number;
  fecha: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
}

export interface FechaOmitida {
  fecha: string;
  dia: string;
  nota: string;
}

export interface CalendarioPropuesto {
  sesiones: SesionPropuesta[];
  omitidas: FechaOmitida[];
  objetivo: number;
  /** Diferencia con el objetivo: > 0 faltan, < 0 sobran. */
  diferencia: number;
  coincide: boolean;
  /** Texto del contador de P2: "24 de 24" o "23 de 24 · falta 1". */
  contador: string;
}

/** Tope anti-abuso (RNF-02): un rango absurdo no genera miles de filas. */
const MAX_DIAS_RANGO = 400;

/**
 * §5/§9 P2: propone las sesiones en los días marcados dentro de inicio–fin,
 * omitiendo feriados activos, y las compara con el objetivo. No impide
 * guardar si no coinciden (eso lo decide el parámetro del use-case).
 */
export function proponerSesiones(
  input: ProponerSesionesInput,
): Result<CalendarioPropuesto, DomainError> {
  if (!esFechaCivilValida(input.inicio) || !esFechaCivilValida(input.fin))
    return fail(new DomainError("VALIDACION_FALLIDA", "Fecha inválida (usa AAAA-MM-DD)"));
  if (input.fin <= input.inicio)
    return fail(
      new DomainError("VALIDACION_FALLIDA", "El fin del curso debe ser posterior al inicio"),
    );
  if (input.dias.length === 0)
    return fail(new DomainError("VALIDACION_FALLIDA", "Marca al menos un día de sesión"));
  const porDia = new Map(input.dias.map((d) => [d.dia, d]));
  const sesiones: SesionPropuesta[] = [];
  const omitidas: FechaOmitida[] = [];
  let cursor = input.inicio;
  for (let i = 0; cursor <= input.fin && i <= MAX_DIAS_RANGO; i += 1) {
    const dia = porDia.get(diaIso(cursor));
    if (dia) {
      const feriado = input.feriados.get(cursor);
      if (feriado !== undefined) {
        omitidas.push({ fecha: cursor, dia: nombreDia(cursor), nota: "Feriado, omitida" });
      } else {
        sesiones.push({
          nro: sesiones.length + 1,
          fecha: cursor,
          dia: nombreDia(cursor),
          horaInicio: dia.horaInicio,
          horaFin: dia.horaFin,
        });
      }
    }
    cursor = sumarDias(cursor, 1);
  }
  const diferencia = input.objetivo - sesiones.length;
  return ok({
    sesiones,
    omitidas,
    objetivo: input.objetivo,
    diferencia,
    coincide: diferencia === 0,
    contador: textoContador(sesiones.length, input.objetivo),
  });
}

export function textoContador(n: number, objetivo: number): string {
  const base = `${n} de ${objetivo}`;
  if (n === objetivo) return base;
  if (n < objetivo) {
    const f = objetivo - n;
    return `${base} · ${f === 1 ? "falta 1" : `faltan ${f}`}`;
  }
  const s = n - objetivo;
  return `${base} · ${s === 1 ? "sobra 1" : `sobran ${s}`}`;
}
