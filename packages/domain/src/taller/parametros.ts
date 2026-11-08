import { DomainError } from "../shared/domain-error.base.js";
import { fail, ok, type Result } from "../shared/result.js";

/**
 * Parámetros del Módulo Taller de Tesis (spec v1.0 §0 y §16 P16).
 *
 * Toda regla marcada "(POR CONFIRMAR)" en la especificación se implementa
 * como parámetro con un valor por defecto, nunca como código fijo. Los
 * valores vigentes viven en la tabla `parametros_taller`; este objeto es el
 * respaldo cuando una clave no existe y la fuente del seed.
 */
export interface ParametrosTaller {
  /** §3 Cupo de proyectos por taller (POR CONFIRMAR: la guía del asesor dice 12). */
  cupoProyectos: number;
  /** §3 Sesiones del curso (12 semanas × 2). */
  numeroSesiones: number;
  /** §3 Monto de cada una de las 3 pensiones, en soles. */
  montoPension: number;
  /** §5 (POR CONFIRMAR) La asistencia JUSTIFICADA cuenta como asistida. */
  justificadaCuentaComoAsistencia: boolean;
  /** §5 (POR CONFIRMAR) Una JUSTIFICADA corta la racha de faltas consecutivas. */
  justificadaInterrumpeRacha: boolean;
  /** §3 Faltas consecutivas que dan lugar al retiro (alerta). */
  faltasConsecutivasParaRetiro: number;
  /** §9 P3/P16 (POR CONFIRMAR) Umbral de "asistencia baja", en %. */
  umbralAsistenciaBaja: number;
  /** §9 P8/P16 (POR CONFIRMAR) Días de anticipación del aviso de pensión. */
  diasAvisoPension: number;
  /** §15 (POR CONFIRMAR para entregas) Tamaño máximo de archivo, en MB. */
  maxMbEntrega: number;
  /** §9 P8 Tamaño máximo de un comprobante, en MB. */
  maxMbComprobante: number;
  /** §9 P6 (POR CONFIRMAR) Se acepta una entrega con el plazo vencido. */
  aceptarEntregaFueraDePlazo: boolean;
  /** §10 D3 (POR CONFIRMAR) Las advertencias de "Aprobar plan" bloquean. */
  advertenciasPlanBloquean: boolean;
  /** §9 P12 (POR CONFIRMAR) Un retiro libera el cupo del proyecto. */
  retiroLiberaCupo: boolean;
  /** §9 P14b (propuesta) Mínimo de respuestas para mostrar resultados. */
  minimoRespuestasEncuesta: number;
  /** §9 P2 (POR CONFIRMAR) Si el contador "n de 24" no coincide, solo avisa. */
  calendarioIncompletoBloquea: boolean;
}

export const PARAMETROS_TALLER_DEFECTO: Readonly<ParametrosTaller> = Object.freeze({
  cupoProyectos: 15,
  numeroSesiones: 24,
  montoPension: 1000,
  justificadaCuentaComoAsistencia: true,
  justificadaInterrumpeRacha: true,
  faltasConsecutivasParaRetiro: 2,
  umbralAsistenciaBaja: 70,
  diasAvisoPension: 3,
  maxMbEntrega: 5,
  maxMbComprobante: 5,
  aceptarEntregaFueraDePlazo: false,
  advertenciasPlanBloquean: false,
  retiroLiberaCupo: false,
  minimoRespuestasEncuesta: 5,
  calendarioIncompletoBloquea: false,
});

export type ClaveParametroTaller = keyof ParametrosTaller;

export interface DefinicionParametroTaller {
  /** Texto para la pantalla P16 (lenguaje simple). */
  etiqueta: string;
  /** Regla de la especificación que lo origina. */
  origen: string;
  /** La especificación lo marca "(POR CONFIRMAR)" o "(propuesta)". */
  porConfirmar: boolean;
  /** Solo numéricos: rango permitido (enteros). */
  min?: number;
  max?: number;
  unidad?: string;
}

/** Metadatos de cada parámetro: única fuente para el seed, el API y la pantalla P16. */
export const DEFINICION_PARAMETROS_TALLER: Readonly<
  Record<ClaveParametroTaller, DefinicionParametroTaller>
> = Object.freeze({
  cupoProyectos: {
    etiqueta: "Cupo de proyectos por taller",
    origen: "§3 (la guía del asesor dice 12)",
    porConfirmar: true,
    min: 1,
    max: 60,
    unidad: "proyectos",
  },
  numeroSesiones: {
    etiqueta: "Sesiones por taller al crearlo",
    origen: "§3",
    porConfirmar: false,
    min: 1,
    max: 52,
    unidad: "sesiones",
  },
  montoPension: {
    etiqueta: "Monto de cada pensión",
    origen: "§3",
    porConfirmar: false,
    min: 1,
    max: 100_000,
    unidad: "soles",
  },
  justificadaCuentaComoAsistencia: {
    etiqueta: "La falta justificada cuenta como asistencia",
    origen: "§5",
    porConfirmar: true,
  },
  justificadaInterrumpeRacha: {
    etiqueta: "La falta justificada corta la racha de faltas seguidas",
    origen: "§5",
    porConfirmar: true,
  },
  faltasConsecutivasParaRetiro: {
    etiqueta: "Faltas seguidas que generan la alerta de retiro",
    origen: "§3",
    porConfirmar: false,
    min: 1,
    max: 10,
    unidad: "faltas",
  },
  umbralAsistenciaBaja: {
    etiqueta: "Asistencia baja por debajo de",
    origen: "§9 P3 y P16",
    porConfirmar: true,
    min: 0,
    max: 100,
    unidad: "%",
  },
  diasAvisoPension: {
    etiqueta: "Aviso de pensión con anticipación de",
    origen: "§9 P8 y P16",
    porConfirmar: true,
    min: 0,
    max: 60,
    unidad: "días",
  },
  maxMbEntrega: {
    etiqueta: "Tamaño máximo de una entrega",
    origen: "§15",
    porConfirmar: true,
    min: 1,
    max: 50,
    unidad: "MB",
  },
  maxMbComprobante: {
    etiqueta: "Tamaño máximo de un comprobante",
    origen: "§9 P8",
    porConfirmar: false,
    min: 1,
    max: 20,
    unidad: "MB",
  },
  aceptarEntregaFueraDePlazo: {
    etiqueta: "Aceptar entregas con el plazo vencido",
    origen: "§9 P6",
    porConfirmar: true,
  },
  advertenciasPlanBloquean: {
    etiqueta: "Las advertencias impiden aprobar el plan",
    origen: "§10 D3",
    porConfirmar: true,
  },
  retiroLiberaCupo: {
    etiqueta: "Un retiro libera el cupo del proyecto",
    origen: "§9 P12",
    porConfirmar: true,
  },
  minimoRespuestasEncuesta: {
    etiqueta: "Respuestas mínimas para mostrar una encuesta",
    origen: "§9 P14b (propuesta)",
    porConfirmar: true,
    min: 1,
    max: 100,
    unidad: "respuestas",
  },
  calendarioIncompletoBloquea: {
    etiqueta: "Impedir guardar un taller si las sesiones no suman el total",
    origen: "§9 P2",
    porConfirmar: true,
  },
});

export const CLAVES_PARAMETROS_TALLER = Object.keys(
  PARAMETROS_TALLER_DEFECTO,
) as ClaveParametroTaller[];

export function esClaveParametroTaller(clave: string): clave is ClaveParametroTaller {
  return Object.hasOwn(PARAMETROS_TALLER_DEFECTO, clave);
}

/**
 * Valida un valor para un parámetro: mismo tipo que su valor por defecto y,
 * si es numérico, entero dentro del rango definido.
 */
export function validarParametroTaller(
  clave: string,
  valor: unknown,
): Result<number | boolean, DomainError> {
  if (!esClaveParametroTaller(clave))
    return fail(new DomainError("NO_ENCONTRADO", `Parámetro desconocido: ${clave}`));
  const defecto = PARAMETROS_TALLER_DEFECTO[clave];
  const def = DEFINICION_PARAMETROS_TALLER[clave];
  if (typeof defecto === "boolean") {
    return typeof valor === "boolean"
      ? ok(valor)
      : fail(new DomainError("VALIDACION_FALLIDA", "Elige Sí o No"));
  }
  if (typeof valor !== "number" || !Number.isInteger(valor))
    return fail(new DomainError("VALIDACION_FALLIDA", "Escribe un número entero"));
  const min = def.min ?? 0;
  const max = def.max ?? Number.MAX_SAFE_INTEGER;
  if (valor < min || valor > max)
    return fail(new DomainError("VALIDACION_FALLIDA", `El valor debe estar entre ${min} y ${max}`));
  return ok(valor);
}

/**
 * Combina lo guardado en BD con los valores por defecto. Descarta claves
 * desconocidas y valores inválidos (tipo o rango): nunca lanza.
 */
export function resolverParametrosTaller(
  guardados: ReadonlyArray<{ clave: string; valor: unknown }>,
): ParametrosTaller {
  const out: ParametrosTaller = { ...PARAMETROS_TALLER_DEFECTO };
  const destino = out as unknown as Record<string, unknown>;
  for (const { clave, valor } of guardados) {
    const r = validarParametroTaller(clave, valor);
    if (r.ok) destino[clave] = r.value;
  }
  return out;
}
