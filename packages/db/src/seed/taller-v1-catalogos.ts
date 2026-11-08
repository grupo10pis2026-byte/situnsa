import {
  type ClaveParametroTaller,
  DEFINICION_PARAMETROS_TALLER,
  marcasHitoSemana,
  PARAMETROS_TALLER_DEFECTO,
} from "@pis/domain";
import { count } from "drizzle-orm";
import type { Db } from "../client.js";
import {
  encuestaPreguntas,
  feriados,
  parametrosTaller,
  planInstitucional,
} from "../schema/taller-v1.js";

/**
 * Catálogos del Módulo Taller v1.0 (seed BASE: idempotente y seguro en
 * prod). Nunca pisa lo que el Administrador ya editó en P16: todo es
 * `onConflictDoNothing` o "solo si está vacío".
 */

/**
 * Plan institucional de 12 semanas (mockup P6). Qué semana es hito y cuál
 * es fija no se escribe aquí: lo define `marcasHitoSemana` (@pis/domain).
 */
export const PLAN_INSTITUCIONAL_INICIAL: ReadonlyArray<{
  semana: number;
  contenido: string;
  entregable: string | null;
}> = [
  { semana: 1, contenido: "Del tema al problema", entregable: "Problema delimitado" },
  { semana: 2, contenido: "Taller del Plan", entregable: "Plan de tesis" },
  { semana: 3, contenido: "Marco teórico", entregable: null },
  { semana: 4, contenido: "Marco teórico", entregable: "Avance 1" },
  { semana: 5, contenido: "Metodología", entregable: null },
  { semana: 6, contenido: "Metodología", entregable: "Avance 2" },
  { semana: 7, contenido: "Resultados", entregable: null },
  { semana: 8, contenido: "Resultados", entregable: "Avance 3" },
  { semana: 9, contenido: "Discusión y conclusiones", entregable: null },
  { semana: 10, contenido: "Discusión y conclusiones", entregable: "Avance 4" },
  { semana: 11, contenido: "Integración y similitud preliminar", entregable: "Borrador integrado" },
  { semana: 12, contenido: "Observaciones y cierre", entregable: "Borrador final" },
];

/** Preguntas de la encuesta (mockup P14; POR CONFIRMAR con el cliente). */
export const PREGUNTAS_ENCUESTA_INICIALES = [
  "El asesor domina los temas del taller",
  "Explica con claridad",
  "Revisa mis avances a tiempo",
  "Es puntual y cumple el horario",
] as const;

/** Feriados nacionales (misma base que `dias-habiles.ts`); el Administrador agrega los demás. */
const FERIADOS_FIJOS: ReadonlyArray<readonly [string, string]> = [
  ["01-01", "Año Nuevo"],
  ["05-01", "Día del Trabajo"],
  ["06-29", "San Pedro y San Pablo"],
  ["07-28", "Fiestas Patrias"],
  ["07-29", "Fiestas Patrias"],
  ["08-30", "Santa Rosa de Lima"],
  ["10-08", "Combate de Angamos"],
  ["11-01", "Día de Todos los Santos"],
  ["12-08", "Inmaculada Concepción"],
  ["12-25", "Navidad"],
];

const FERIADOS_MOVIBLES: ReadonlyArray<readonly [string, string]> = [
  ["2026-04-02", "Jueves Santo"],
  ["2026-04-03", "Viernes Santo"],
  ["2027-03-25", "Jueves Santo"],
  ["2027-03-26", "Viernes Santo"],
];

export async function seedTallerV1Catalogos(db: Db, anios: readonly number[]): Promise<void> {
  for (const s of PLAN_INSTITUCIONAL_INICIAL) {
    await db
      .insert(planInstitucional)
      .values({
        semana: s.semana,
        contenido: s.contenido,
        entregable: s.entregable,
        esHito: marcasHitoSemana(s.semana).esHito,
        fijo: marcasHitoSemana(s.semana).fijo,
      })
      .onConflictDoNothing({ target: planInstitucional.semana });
  }

  for (const [clave, valor] of Object.entries(PARAMETROS_TALLER_DEFECTO)) {
    await db
      .insert(parametrosTaller)
      .values({
        clave,
        valor,
        descripcion: DEFINICION_PARAMETROS_TALLER[clave as ClaveParametroTaller].etiqueta,
      })
      .onConflictDoNothing({ target: parametrosTaller.clave });
  }

  const filasFeriados = [
    ...anios.flatMap((a) =>
      FERIADOS_FIJOS.map(([mmdd, nombre]) => [`${a}-${mmdd}`, nombre] as const),
    ),
    ...FERIADOS_MOVIBLES.filter(([f]) => anios.includes(Number(f.slice(0, 4)))),
  ];
  for (const [fecha, nombre] of filasFeriados) {
    await db
      .insert(feriados)
      .values({ fecha, nombre })
      .onConflictDoNothing({ target: feriados.fecha });
  }

  const [preguntas] = await db.select({ n: count() }).from(encuestaPreguntas);
  if ((preguntas?.n ?? 0) === 0) {
    await db
      .insert(encuestaPreguntas)
      .values(PREGUNTAS_ENCUESTA_INICIALES.map((texto, i) => ({ texto, orden: i + 1 })));
  }

  console.log(
    `Taller v1: plan institucional (12 semanas), parámetros (${Object.keys(PARAMETROS_TALLER_DEFECTO).length}), feriados ${anios.join("/")}, encuesta`,
  );
}
