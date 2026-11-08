import { DomainError } from "../shared/domain-error.base.js";
import { fail, ok, type Result } from "../shared/result.js";
import { FICHA_SEMANAS, HITOS_TALLER, type TipoHito } from "./calendario.js";
import type {
  EstadoEntregaVersion,
  EstadoHito,
  EstadoPension,
  EstadoRegistroFicha,
  EstadoSesionCurso,
  EstadoTallerCurso,
} from "./estados.js";
import { diferenciaDias } from "./fechas-civiles.js";
import type { ParametrosTaller } from "./parametros.js";

/**
 * Reglas de negocio puras del Módulo Taller v1.0. Cada función que puede
 * negar una acción devuelve un Result con el motivo en lenguaje simple:
 * el mismo texto se muestra junto al botón deshabilitado (§15).
 */

const negar = (code: DomainError["code"], motivo: string) => fail(new DomainError(code, motivo));

// ── Asistencia (§5) ────────────────────────────────────────────────────
export type MarcaAsistencia = "PENDIENTE" | "PRESENTE" | "FALTA" | "JUSTIFICADA";

export interface RegistroAsistenciaCurso {
  sesion: EstadoSesionCurso;
  marca: MarcaAsistencia | null;
}

type ParamsAsistencia = Pick<
  ParametrosTaller,
  "justificadaCuentaComoAsistencia" | "justificadaInterrumpeRacha" | "faltasConsecutivasParaRetiro"
>;

/**
 * (PRESENTE + JUSTIFICADA) ÷ sesiones REALIZADAS, entero 0–100. Las
 * canceladas y las futuras no cuentan. `null` si aún no hay realizadas
 * (la UI muestra "—", no 0 %).
 */
export function porcentajeAsistenciaCurso(
  registros: readonly RegistroAsistenciaCurso[],
  p: Pick<ParamsAsistencia, "justificadaCuentaComoAsistencia">,
): number | null {
  const realizadas = registros.filter((r) => r.sesion === "REALIZADA");
  if (realizadas.length === 0) return null;
  const asistidas = realizadas.filter(
    (r) =>
      r.marca === "PRESENTE" || (r.marca === "JUSTIFICADA" && p.justificadaCuentaComoAsistencia),
  ).length;
  return Math.round((asistidas / realizadas.length) * 100);
}

/**
 * Faltas consecutivas al final de la serie (registros en orden de sesión).
 * Solo cuentan las sesiones REALIZADAS; una JUSTIFICADA corta la racha o se
 * salta según el parámetro (POR CONFIRMAR).
 */
export function faltasConsecutivasActuales(
  registros: readonly RegistroAsistenciaCurso[],
  p: Pick<ParamsAsistencia, "justificadaInterrumpeRacha">,
): number {
  let racha = 0;
  for (let i = registros.length - 1; i >= 0; i -= 1) {
    const r = registros[i];
    if (!r || r.sesion !== "REALIZADA") continue;
    if (r.marca === "FALTA") racha += 1;
    else if (r.marca === "JUSTIFICADA" && !p.justificadaInterrumpeRacha) continue;
    else break;
  }
  return racha;
}

export function alcanzaFaltasParaRetiro(
  registros: readonly RegistroAsistenciaCurso[],
  p: Pick<ParamsAsistencia, "justificadaInterrumpeRacha" | "faltasConsecutivasParaRetiro">,
): boolean {
  return faltasConsecutivasActuales(registros, p) >= p.faltasConsecutivasParaRetiro;
}

export function esAsistenciaBaja(
  porcentaje: number | null,
  p: Pick<ParametrosTaller, "umbralAsistenciaBaja">,
): boolean {
  return porcentaje !== null && porcentaje < p.umbralAsistenciaBaja;
}

/** P7 aviso rojo: según la última marca y la racha. */
export function avisoAsistenciaAlumno(
  registros: readonly RegistroAsistenciaCurso[],
  p: Pick<ParamsAsistencia, "justificadaInterrumpeRacha" | "faltasConsecutivasParaRetiro">,
): string | null {
  const racha = faltasConsecutivasActuales(registros, p);
  if (racha >= p.faltasConsecutivasParaRetiro) return "Comunícate con la Unidad";
  if (racha >= 1) return "Otra falta consecutiva puede implicar tu retiro";
  return null;
}

/** §9 P4: corregir o justificar una marca ya guardada exige motivo. */
export function validarCambioAsistencia(
  anterior: MarcaAsistencia,
  nueva: MarcaAsistencia,
  motivo: string | null | undefined,
): Result<true, DomainError> {
  if (nueva === "PENDIENTE")
    return negar("VALIDACION_FALLIDA", "Elige Presente, Falta o Justificada");
  if (anterior !== "PENDIENTE" && anterior !== nueva && (motivo ?? "").trim() === "")
    return negar("VALIDACION_FALLIDA", "Escribe el motivo del cambio");
  return ok(true);
}

// ── Sesión (§9 P4) ─────────────────────────────────────────────────────
export function puedeRegistrarAsistencia(
  sesion: { estado: EstadoSesionCurso; fecha: string },
  hoy: string,
): Result<true, DomainError> {
  if (sesion.estado === "CANCELADA")
    return negar("TRANSICION_INVALIDA", "La sesión está cancelada: no admite asistencia");
  if (sesion.fecha > hoy)
    return negar("VALIDACION_FALLIDA", "La sesión aún no llega: no se registra asistencia futura");
  return ok(true);
}

/** La sesión pasa a REALIZADA cuando todos sus grupos guardaron (o al guardar si no hay grupos). */
export function sesionCompleta(
  gruposDelTaller: readonly string[],
  gruposGuardados: ReadonlySet<string>,
): boolean {
  return gruposDelTaller.every((g) => gruposGuardados.has(g));
}

export function sesionesRestantes(estados: readonly EstadoSesionCurso[]): number {
  return estados.filter((e) => e === "PROGRAMADA" || e === "REPROGRAMADA").length;
}

// ── Taller y asignación (§3, §9 P3, §10 D1) ────────────────────────────
export interface ContextoAsignacion {
  estadoTaller: EstadoTallerCurso;
  proyectosAsignados: number;
  cupoProyectos: number;
  inscripcionValidada: boolean;
  /** Ya está en un taller activo (otro o este). */
  tieneTallerActivo: boolean;
}

export function puedeAsignarProyecto(c: ContextoAsignacion): Result<true, DomainError> {
  if (c.estadoTaller === "CANCELADO" || c.estadoTaller === "FINALIZADO")
    return negar("TRANSICION_INVALIDA", "El taller ya no recibe alumnos");
  if (c.proyectosAsignados >= c.cupoProyectos)
    return negar(
      "VALIDACION_FALLIDA",
      `Cupo lleno: ${c.proyectosAsignados} de ${c.cupoProyectos} proyectos`,
    );
  if (!c.inscripcionValidada)
    return negar("REQUISITO_PENDIENTE", "La inscripción del alumno aún no está validada");
  if (c.tieneTallerActivo) return negar("DATOS_DUPLICADOS", "El alumno ya está en otro taller");
  return ok(true);
}

/** Estado tras un cambio en el número de proyectos (COMPLETO automático). */
export function estadoPorCupo(
  actual: EstadoTallerCurso,
  proyectos: number,
  cupo: number,
): EstadoTallerCurso {
  if (actual === "ABIERTO_INSCRIPCIONES" && proyectos >= cupo) return "COMPLETO";
  if (actual === "COMPLETO" && proyectos < cupo) return "ABIERTO_INSCRIPCIONES";
  return actual;
}

/** §6 CANCELADO: manual, con motivo, solo sin sesiones realizadas. */
export function puedeCancelarTaller(
  estado: EstadoTallerCurso,
  sesionesRealizadas: number,
  motivo: string,
): Result<true, DomainError> {
  if (motivo.trim() === "") return negar("VALIDACION_FALLIDA", "Escribe el motivo");
  if (estado === "CANCELADO" || estado === "FINALIZADO")
    return negar("TRANSICION_INVALIDA", "El taller ya está cerrado");
  if (sesionesRealizadas > 0)
    return negar("TRANSICION_INVALIDA", "El taller ya tiene sesiones realizadas");
  return ok(true);
}

/** §9 P2: inicio y fin quedan bloqueados con sesiones realizadas. */
export function fechasCursoEditables(sesionesRealizadas: number): boolean {
  return sesionesRealizadas === 0;
}

/** §9 P15 (propuesta): no se desactiva un asesor con taller vigente. */
export function puedeDesactivarAsesor(tieneTallerVigente: boolean): Result<true, DomainError> {
  return tieneTallerVigente
    ? negar("REQUISITO_PENDIENTE", "Tiene un taller activo: ciérralo o cambia de asesor primero")
    : ok(true);
}

// ── Hitos y entregas (§3, §9 P6, P6b, P7) ─────────────────────────────
export function hitoAnterior(tipo: TipoHito): TipoHito | null {
  const i = HITOS_TALLER.findIndex((h) => h.tipo === tipo);
  return i > 0 ? (HITOS_TALLER[i - 1]?.tipo ?? null) : null;
}

export function esHitoFijo(tipo: TipoHito): boolean {
  return HITOS_TALLER.find((h) => h.tipo === tipo)?.fijo ?? false;
}

export function puedeHabilitarHito(
  tipo: TipoHito,
  estados: ReadonlyMap<TipoHito, EstadoHito>,
): Result<true, DomainError> {
  if (estados.get(tipo) !== "NO_HABILITADO")
    return negar("TRANSICION_INVALIDA", "El hito ya fue habilitado");
  const previo = hitoAnterior(tipo);
  if (previo && estados.get(previo) !== "APROBADO")
    return negar("REQUISITO_PENDIENTE", "El hito anterior aún no está aprobado");
  return ok(true);
}

/** §3: las fechas de los hitos de las semanas 2 y 12 no se ajustan. */
export function puedeAjustarFechaHito(tipo: TipoHito): Result<true, DomainError> {
  return esHitoFijo(tipo)
    ? negar("VALIDACION_FALLIDA", "La fecha de este hito es fija y no se prorroga")
    : ok(true);
}

export interface ContextoSubida {
  tipo: TipoHito;
  estado: EstadoHito;
  fechaLimite: string;
  hoy: string;
  /** Solo para el borrador final (§9 P7). */
  fichaCompletaYFirmada: boolean;
  tesistaRetirado: boolean;
}

export function puedeSubirEntrega(
  c: ContextoSubida,
  p: Pick<ParametrosTaller, "aceptarEntregaFueraDePlazo">,
): Result<true, DomainError> {
  if (c.tesistaRetirado) return negar("PERMISO_DENEGADO", "Retirado: solo lectura");
  if (c.estado !== "HABILITADO" && c.estado !== "OBSERVADO")
    return negar("TRANSICION_INVALIDA", "El hito no está habilitado para entregas");
  if (c.hoy > c.fechaLimite && !p.aceptarEntregaFueraDePlazo)
    return negar("PLAZO_VENCIDO", "El plazo de entrega venció");
  if (c.tipo === "BORRADOR_FINAL" && !c.fichaCompletaYFirmada)
    return negar("REQUISITO_PENDIENTE", "Tu asesor debe completar y firmar la ficha");
  return ok(true);
}

export const FORMATOS_ENTREGA = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const FORMATOS_COMPROBANTE = ["application/pdf", "image/jpeg", "image/png"] as const;

export function validarArchivo(
  archivo: { mime: string; bytes: number },
  formatos: readonly string[],
  maxMb: number,
): Result<true, DomainError> {
  if (!formatos.includes(archivo.mime))
    return negar("DOCUMENTO_INVALIDO", "Formato de archivo no permitido");
  if (archivo.bytes <= 0) return negar("DOCUMENTO_INVALIDO", "El archivo está vacío");
  if (archivo.bytes > maxMb * 1024 * 1024)
    return negar("DOCUMENTO_INVALIDO", `El archivo pasa de ${maxMb} MB`);
  return ok(true);
}

/** §9 P6b: solo se revisa la última versión, si está ENTREGADA. */
export function puedeRevisarEntrega(
  version: { estado: EstadoEntregaVersion; esUltima: boolean },
  resultado: "CONFORME" | "OBSERVADA",
  observaciones: string | null | undefined,
): Result<true, DomainError> {
  if (!version.esUltima) return negar("TRANSICION_INVALIDA", "Solo se revisa la última versión");
  if (version.estado !== "ENTREGADA")
    return negar("TRANSICION_INVALIDA", "Esta versión ya fue revisada");
  if (resultado === "OBSERVADA" && (observaciones ?? "").trim() === "")
    return negar("VALIDACION_FALLIDA", "Escribe las observaciones");
  return ok(true);
}

/** Estado del hito tras revisar su última versión. */
export function estadoHitoTrasRevision(
  tipo: TipoHito,
  resultado: "CONFORME" | "OBSERVADA",
): EstadoHito {
  if (resultado === "OBSERVADA") return "OBSERVADO";
  // El plan no se aprueba con "Conforme": requiere D3 (genera el expediente).
  return tipo === "PLAN" ? "ENTREGADO" : "APROBADO";
}

/** §6: HABILITADO u OBSERVADO sin entrega al vencer → NO_ENTREGADO. */
export function hitoVencido(estado: EstadoHito, fechaLimite: string, hoy: string): boolean {
  return (estado === "HABILITADO" || estado === "OBSERVADO") && hoy > fechaLimite;
}

// ── Aprobar plan (§10 D3) ──────────────────────────────────────────────
export interface ContextoAprobacionPlan {
  estadoHitoPlan: EstadoHito;
  /** Última versión del plan revisada como CONFORME (o sin revisar). */
  ultimaVersion: EstadoEntregaVersion | null;
  tieneExpediente: boolean;
  faltasConsecutivas: boolean;
  asistenciaBaja: boolean;
  pensionVencida: boolean;
}

export interface EvaluacionAprobacionPlan {
  advertencias: string[];
}

export function evaluarAprobacionPlan(
  c: ContextoAprobacionPlan,
  p: Pick<ParametrosTaller, "advertenciasPlanBloquean">,
): Result<EvaluacionAprobacionPlan, DomainError> {
  if (c.tieneExpediente) return negar("TRANSICION_INVALIDA", "El plan ya fue aprobado");
  if (c.estadoHitoPlan !== "ENTREGADO" || c.ultimaVersion === null)
    return negar("REQUISITO_PENDIENTE", "El plan aún no fue entregado");
  if (c.ultimaVersion === "OBSERVADA")
    return negar("REQUISITO_PENDIENTE", "La última versión del plan está observada");
  const advertencias: string[] = [];
  if (c.faltasConsecutivas) advertencias.push("Tiene faltas consecutivas");
  if (c.asistenciaBaja) advertencias.push("Tiene asistencia baja");
  if (c.pensionVencida) advertencias.push("Tiene una pensión vencida");
  if (advertencias.length > 0 && p.advertenciasPlanBloquean)
    return negar("REQUISITO_PENDIENTE", advertencias.join(". "));
  return ok({ advertencias });
}

// ── Ficha de Control (§9 P11) ──────────────────────────────────────────
export interface FilaFicha {
  semana: number;
  estado: EstadoRegistroFicha;
}

export function resumenFicha(filas: readonly FilaFicha[]): {
  registros: number;
  firmados: number;
  completa: boolean;
  contador: string;
} {
  const porSemana = new Map(filas.map((f) => [f.semana, f.estado]));
  const total = FICHA_SEMANAS.length;
  const registros = FICHA_SEMANAS.filter(
    (s) => (porSemana.get(s.semana) ?? "SIN_REVISION") !== "SIN_REVISION",
  ).length;
  const firmados = FICHA_SEMANAS.filter((s) => porSemana.get(s.semana) === "FIRMADO").length;
  return {
    registros,
    firmados,
    completa: firmados === total,
    contador: `${registros} de ${total} registros`,
  };
}

export function validarRegistroFicha(
  semana: number,
  observaciones: string,
  estadoActual: EstadoRegistroFicha,
  motivo?: string | null,
): Result<true, DomainError> {
  if (!FICHA_SEMANAS.some((s) => s.semana === semana))
    return negar("VALIDACION_FALLIDA", "Elige una semana de la ficha (2, 4, 6, 8, 10 o 12)");
  if (observaciones.trim() === "")
    return negar("VALIDACION_FALLIDA", "Escribe las observaciones y acuerdos");
  if (estadoActual === "FIRMADO" && (motivo ?? "").trim() === "")
    return negar("VALIDACION_FALLIDA", "El registro está firmado: escribe el motivo del cambio");
  return ok(true);
}

// ── Cierre de asesoría (§9 P13) ────────────────────────────────────────
export function puedeEmitirConformidad(c: {
  tieneBorradorFinal: boolean;
  fichaCompletaYFirmada: boolean;
  observacionesLevantadas: boolean;
}): Result<true, DomainError> {
  if (!c.tieneBorradorFinal)
    return negar("REQUISITO_PENDIENTE", "Aún no hay borrador final entregado");
  if (!c.fichaCompletaYFirmada)
    return negar("REQUISITO_PENDIENTE", "La ficha de control no está completa y firmada");
  if (!c.observacionesLevantadas)
    return negar("REQUISITO_PENDIENTE", "Faltan levantar las observaciones");
  return ok(true);
}

export function validarSimilitudPreliminar(valor: number): Result<number, DomainError> {
  if (!Number.isFinite(valor) || valor < 0 || valor > 100)
    return negar("VALIDACION_FALLIDA", "La similitud debe estar entre 0 y 100 %");
  return ok(Math.round(valor * 100) / 100);
}

// ── Pensiones (§9 P8, P9) ──────────────────────────────────────────────
export function puedeSubirComprobante(estado: EstadoPension): Result<true, DomainError> {
  if (estado === "VALIDADA") return negar("TRANSICION_INVALIDA", "Esta pensión ya está pagada");
  if (estado === "EN_REVISION")
    return negar("TRANSICION_INVALIDA", "Ya hay un comprobante en revisión");
  return ok(true);
}

export function validarObservacionComprobante(motivo: string): Result<true, DomainError> {
  return motivo.trim() === ""
    ? negar("VALIDACION_FALLIDA", "Escribe el motivo de la observación")
    : ok(true);
}

/** Días de atraso (0 si aún no vence o ya está pagada). */
export function diasAtraso(
  pension: { estado: EstadoPension; fecha: string | null },
  hoy: string,
): number {
  if (pension.estado === "VALIDADA" || pension.fecha === null) return 0;
  return Math.max(0, diferenciaDias(pension.fecha, hoy));
}

export function debeVencer(estado: EstadoPension, fecha: string | null, hoy: string): boolean {
  return estado === "PENDIENTE" && fecha !== null && hoy > fecha;
}

/** ¿Toca avisar hoy? (exactamente N días antes del vencimiento). */
export function tocaAvisoPension(
  pension: { estado: EstadoPension; fecha: string | null },
  hoy: string,
  p: Pick<ParametrosTaller, "diasAvisoPension">,
): boolean {
  if (pension.estado !== "PENDIENTE" || pension.fecha === null) return false;
  return diferenciaDias(hoy, pension.fecha) === p.diasAvisoPension;
}

/** §9 P3/P9: un cambio de fechas o montos afecta solo a las no pagadas. */
export function pensionEditable(estado: EstadoPension): boolean {
  return estado !== "VALIDADA";
}

// ── Encuestas (§9 P14, P14b) ───────────────────────────────────────────
export function validarPuntajes(puntajes: readonly number[]): Result<true, DomainError> {
  if (puntajes.length === 0) return negar("VALIDACION_FALLIDA", "Responde al menos una pregunta");
  if (puntajes.some((x) => !Number.isInteger(x) || x < 1 || x > 5))
    return negar("VALIDACION_FALLIDA", "Cada respuesta va de 1 a 5");
  return ok(true);
}

export function resultadosVisibles(
  respuestas: number,
  p: Pick<ParametrosTaller, "minimoRespuestasEncuesta">,
): boolean {
  return respuestas >= p.minimoRespuestasEncuesta;
}

export function promedioPuntaje(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10;
}

// ── Proyectos ──────────────────────────────────────────────────────────
/** Código correlativo por taller: P-01, P-02… */
export function codigoProyecto(correlativo: number): string {
  return `P-${String(correlativo).padStart(2, "0")}`;
}
