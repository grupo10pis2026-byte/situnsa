import type { ConfigTallerDTO } from "@pis/contracts";
import {
  asesorEspecialidades,
  type DbExecutor,
  db,
  especialidades,
  feriados,
  parametrosTaller,
  planInstitucional,
} from "@pis/db";
import {
  CLAVES_PARAMETROS_TALLER,
  DEFINICION_PARAMETROS_TALLER,
  marcasHitoSemana,
  PARAMETROS_TALLER_DEFECTO,
  type ParametrosTaller,
  resolverParametrosTaller,
} from "@pis/domain";
import { and, asc, count, eq, gte, lte } from "drizzle-orm";

/**
 * Lecturas de la configuración del taller (P16). `leerParametrosTaller` y
 * `feriadosActivos` son el punto de entrada para los demás cortes del
 * módulo (crear taller, asistencia, pagos…): nadie lee esas tablas a mano.
 */

/** Parámetros vigentes: lo guardado en BD sobre los valores por defecto del dominio. */
export async function leerParametrosTaller(tx: DbExecutor = db): Promise<ParametrosTaller> {
  const filas = await tx
    .select({ clave: parametrosTaller.clave, valor: parametrosTaller.valor })
    .from(parametrosTaller);
  return resolverParametrosTaller(filas);
}

/** Feriados activos en un rango (ambos extremos incluidos): fecha → nombre. */
export async function feriadosActivos(
  desde: string,
  hasta: string,
  tx: DbExecutor = db,
): Promise<Map<string, string>> {
  const filas = await tx
    .select({ fecha: feriados.fecha, nombre: feriados.nombre })
    .from(feriados)
    .where(and(eq(feriados.activo, true), gte(feriados.fecha, desde), lte(feriados.fecha, hasta)));
  return new Map(filas.map((f) => [f.fecha, f.nombre]));
}

export async function leerConfigTaller(tx: DbExecutor = db): Promise<ConfigTallerDTO> {
  const listaFeriados = await tx.select().from(feriados).orderBy(asc(feriados.fecha));
  const semanas = await tx.select().from(planInstitucional).orderBy(asc(planInstitucional.semana));
  const listaEspecialidades = await tx
    .select({
      id: especialidades.id,
      nombre: especialidades.nombre,
      activa: especialidades.activa,
      asesores: count(asesorEspecialidades.asesorId),
    })
    .from(especialidades)
    .leftJoin(asesorEspecialidades, eq(asesorEspecialidades.especialidadId, especialidades.id))
    .groupBy(especialidades.id)
    .orderBy(asc(especialidades.nombre));
  const parametros = await leerParametrosTaller(tx);

  return {
    feriados: listaFeriados.map((f) => ({
      id: f.id,
      fecha: f.fecha,
      nombre: f.nombre,
      activo: f.activo,
    })),
    // Las marcas de hito salen de las reglas del taller, no de la fila (§3).
    plan: semanas.map((s) => {
      const m = marcasHitoSemana(s.semana);
      return {
        semana: s.semana,
        contenido: s.contenido,
        entregable: s.entregable,
        esHito: m.esHito,
        fijo: m.fijo,
      };
    }),
    especialidades: listaEspecialidades.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      activa: e.activa,
      asesores: Number(e.asesores),
    })),
    parametros: CLAVES_PARAMETROS_TALLER.map((clave) => {
      const def = DEFINICION_PARAMETROS_TALLER[clave];
      const porDefecto = PARAMETROS_TALLER_DEFECTO[clave];
      return {
        clave,
        etiqueta: def.etiqueta,
        origen: def.origen,
        porConfirmar: def.porConfirmar,
        tipo: typeof porDefecto === "boolean" ? ("SI_NO" as const) : ("NUMERO" as const),
        valor: parametros[clave],
        porDefecto,
        min: def.min ?? null,
        max: def.max ?? null,
        unidad: def.unidad ?? null,
      };
    }),
  };
}
