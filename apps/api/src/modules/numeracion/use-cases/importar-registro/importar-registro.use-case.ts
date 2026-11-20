import { createHash } from "node:crypto";
import type { ImportacionDTO, ResumenImportacionDTO } from "@pis/contracts";
import {
  type DbExecutor,
  db,
  importacionesNumeracion,
  registroNumeracion,
  vinculosNumeracion,
} from "@pis/db";
import {
  claveNumero,
  coincidenciaExacta,
  DomainError,
  type ExpedienteComparable,
  fail,
  HOJAS_REGISTRO,
  type LecturaRegistro,
  leerRegistros,
  normalizarTexto,
  ok,
  type RegistroNumeracion,
  type Result,
  TIPOS_NUMERACION,
  type TipoNumeracion,
  textoBusqueda,
} from "@pis/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { type HojaLeida, leerXlsx } from "../../../../infra/xlsx/leer-xlsx.js";
import { appendAuditoria } from "../../../expedientes/expedientes.auditoria.js";
import {
  expedientesComparables,
  sincronizarExpediente,
  ultimaImportacion,
} from "../../numeracion.repository.js";

export interface Actor {
  id: string;
  dni: string;
}

/** 15 MB: el registro histórico de oficios/decretos es texto (pocas miles de filas). */
export const TAMANO_MAXIMO_EXCEL = 15 * 1024 * 1024;

export type LecturaLibro = Record<TipoNumeracion, LecturaRegistro | null>;

/**
 * Ubica las hojas OFICIOS/DECRETOS y las interpreta. Falla si no hay
 * ninguna, o si una hoja existe pero no tiene la columna del número.
 */
export function leerLibroRegistro(hojas: readonly HojaLeida[]): Result<LecturaLibro, DomainError> {
  const lectura: LecturaLibro = { OFICIO: null, DECRETO: null };
  for (const tipo of TIPOS_NUMERACION) {
    const nombres = HOJAS_REGISTRO[tipo];
    const hoja = hojas.find((h) => nombres.includes(normalizarTexto(h.nombre)));
    if (!hoja) continue;
    const r = leerRegistros(tipo, hoja.filas);
    if (!r) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          `La hoja ${hoja.nombre} no tiene la columna del número (${tipo === "OFICIO" ? "N°" : "Nro.CC"}) en sus primeras filas`,
        ),
      );
    }
    lectura[tipo] = r;
  }
  if (!lectura.OFICIO && !lectura.DECRETO) {
    return fail(
      new DomainError(
        "VALIDACION_FALLIDA",
        "El Excel debe tener una hoja llamada OFICIOS y/o DECRETOS",
      ),
    );
  }
  return ok(lectura);
}

/**
 * Vinculación automática conservadora (legacy `SIG102_leer`): solo pares
 * con coincidencia exacta **única en ambos sentidos**; lo dudoso queda
 * para que el área lo vincule a mano.
 */
export function planVinculacionAutomatica(
  registros: readonly RegistroNumeracion[],
  expedientes: ReadonlyArray<ExpedienteComparable & { id: string }>,
): Array<{ registro: RegistroNumeracion; expedienteId: string }> {
  const porExpediente = new Map<string, RegistroNumeracion[]>();
  const pares: Array<{ registro: RegistroNumeracion; expedienteId: string }> = [];
  const candidatosDe = new Map<RegistroNumeracion, string[]>();
  // Índice por la clave exacta para no comparar todos contra todos.
  const indice = new Map<string, Array<ExpedienteComparable & { id: string }>>();
  for (const e of expedientes) {
    for (const k of [normalizarTexto(e.codigo), normalizarTexto(e.titulo)]) {
      if (!k) continue;
      const lista = indice.get(k) ?? [];
      lista.push(e);
      indice.set(k, lista);
    }
  }
  for (const r of registros) {
    const k = normalizarTexto(r.tipo === "OFICIO" ? r.datos.expediente : r.datos.tesis);
    const ids = (indice.get(k) ?? []).filter((e) => coincidenciaExacta(r, e)).map((e) => e.id);
    const unicos = [...new Set(ids)];
    candidatosDe.set(r, unicos);
    for (const id of unicos) porExpediente.set(id, [...(porExpediente.get(id) ?? []), r]);
  }
  for (const [r, ids] of candidatosDe) {
    const id = ids[0];
    if (ids.length === 1 && id && porExpediente.get(id)?.length === 1) {
      pares.push({ registro: r, expedienteId: id });
    }
  }
  return pares;
}

function resumenVacio(): ResumenImportacionDTO["OFICIO"] {
  return {
    hojaEncontrada: false,
    leidos: 0,
    nuevos: 0,
    actualizados: 0,
    retirados: 0,
    duplicados: [],
    columnasFaltantes: [],
  };
}

const LOTE = 500;

/** Igualdad por clave (jsonb de Postgres no conserva el orden de las claves). */
export function mismosDatos(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of claves) if ((a[k] ?? "") !== (b[k] ?? "")) return false;
  return true;
}

async function aplicarHoja(
  tx: DbExecutor,
  tipo: TipoNumeracion,
  lectura: LecturaRegistro,
  ahora: Date,
): Promise<ResumenImportacionDTO["OFICIO"]> {
  const existentes = await tx
    .select({
      clave: registroNumeracion.clave,
      datos: registroNumeracion.datos,
      vigente: registroNumeracion.vigente,
    })
    .from(registroNumeracion)
    .where(eq(registroNumeracion.tipo, tipo));
  const previos = new Map(existentes.map((e) => [e.clave, e]));
  const resumen = {
    ...resumenVacio(),
    hojaEncontrada: true,
    leidos: lectura.registros.length,
    duplicados: lectura.duplicados,
    columnasFaltantes: lectura.columnasFaltantes,
  };
  const presentes = new Set<string>();
  const valores = lectura.registros.map((r) => {
    const clave = claveNumero(r.numero);
    presentes.add(clave);
    const previo = previos.get(clave);
    if (!previo) resumen.nuevos++;
    else if (!previo.vigente || !mismosDatos(previo.datos, r.datos)) {
      resumen.actualizados++;
    }
    return {
      tipo,
      clave,
      numero: r.numero,
      datos: r.datos,
      textoBusqueda: textoBusqueda(r),
      fila: r.fila,
      vigente: true,
      actualizadoEn: ahora,
    };
  });
  for (let i = 0; i < valores.length; i += LOTE) {
    await tx
      .insert(registroNumeracion)
      .values(valores.slice(i, i + LOTE))
      .onConflictDoUpdate({
        target: [registroNumeracion.tipo, registroNumeracion.clave],
        set: {
          numero: sql`excluded.numero`,
          datos: sql`excluded.datos`,
          textoBusqueda: sql`excluded.texto_busqueda`,
          fila: sql`excluded.fila`,
          vigente: true,
          actualizadoEn: ahora,
        },
      });
  }
  const retirar = existentes
    .filter((e) => e.vigente && !presentes.has(e.clave))
    .map((e) => e.clave);
  for (let i = 0; i < retirar.length; i += LOTE) {
    await tx
      .update(registroNumeracion)
      .set({ vigente: false, actualizadoEn: ahora })
      .where(
        and(
          eq(registroNumeracion.tipo, tipo),
          inArray(registroNumeracion.clave, retirar.slice(i, i + LOTE)),
        ),
      );
  }
  resumen.retirados = retirar.length;
  return resumen;
}

/**
 * Importa el Excel maestro de oficios y decretos (solo lectura: el Excel
 * sigue siendo la fuente de verdad). Todo en un COMMIT: registro,
 * vinculación automática, sincronización de expedientes y auditoría.
 */
export class ImportarRegistroUseCase {
  async execute(input: {
    nombreArchivo: string;
    bytes: Uint8Array;
    actor: Actor;
    ahora?: Date;
  }): Promise<Result<ImportacionDTO, DomainError>> {
    const ahora = input.ahora ?? new Date();
    if (!/\.xlsx$/i.test(input.nombreArchivo)) {
      return fail(
        new DomainError(
          "DOCUMENTO_INVALIDO",
          "Suba el registro como Excel (.xlsx); guarde el .xls como .xlsx",
        ),
      );
    }
    if (input.bytes.length === 0 || input.bytes.length > TAMANO_MAXIMO_EXCEL) {
      return fail(new DomainError("DOCUMENTO_INVALIDO", "El archivo está vacío o supera 15 MB"));
    }
    const hojas = leerXlsx(input.bytes);
    if (!hojas) {
      return fail(
        new DomainError("DOCUMENTO_INVALIDO", "El archivo no es un Excel (.xlsx) válido"),
      );
    }
    const lectura = leerLibroRegistro(hojas);
    if (!lectura.ok) return lectura;

    const uow = new DrizzleUnitOfWork(db);
    const r = await uow.run(async (tx) => {
      // Una importación a la vez (evita intercalar instantáneas del Excel).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('registro-numeracion'))`);
      const resumen: ResumenImportacionDTO = {
        OFICIO: resumenVacio(),
        DECRETO: resumenVacio(),
        vinculadosAutomaticamente: 0,
        vinculosRetirados: [],
      };
      for (const tipo of TIPOS_NUMERACION) {
        const l = lectura.value[tipo];
        if (l) resumen[tipo] = await aplicarHoja(tx, tipo, l, ahora);
      }

      const exps = await expedientesComparables(tx);
      const porId = new Map(exps.map((e) => [e.id, e]));
      const vinculos = await tx.select().from(vinculosNumeracion);
      const registros = await tx.select().from(registroNumeracion);
      const porClave = new Map(registros.map((x) => [`${x.tipo}:${x.clave}`, x]));

      // 1) El Excel manda: re-sincroniza número/fecha de los ya vinculados.
      for (const v of vinculos) {
        const reg = porClave.get(`${v.tipo}:${v.clave}`);
        const tipo = v.tipo as TipoNumeracion;
        if (!reg || !reg.vigente) {
          resumen.vinculosRetirados.push({
            tipo,
            numero: reg?.numero ?? v.clave,
            codigo: porId.get(v.expedienteId)?.codigo ?? "",
          });
          continue;
        }
        // Expedientes anulados conservan el número con que se cerraron.
        if (!porId.has(v.expedienteId)) continue;
        const s = await sincronizarExpediente(tx, v.expedienteId, tipo, reg);
        if (s.cambio && s.antes !== s.despues) {
          const exp = porId.get(v.expedienteId);
          await appendAuditoria(tx, {
            expedienteId: v.expedienteId,
            actorId: input.actor.id || null,
            actorDni: input.actor.dni,
            estadoAnterior: exp?.estado ?? null,
            estadoNuevo: exp?.estado ?? "REGISTRADO",
            detalle: `Registro de ${tipo === "OFICIO" ? "oficios" : "decretos"}: N° ${s.antes ?? "—"} → ${s.despues ?? "—"} (Excel ${input.nombreArchivo})`,
          });
        }
      }

      // 2) Vinculación automática de registros libres con expedientes sin vínculo.
      for (const tipo of TIPOS_NUMERACION) {
        if (!lectura.value[tipo]) continue;
        const usadas = new Set(vinculos.filter((v) => v.tipo === tipo).map((v) => v.clave));
        const conVinculo = new Set(
          vinculos.filter((v) => v.tipo === tipo).map((v) => v.expedienteId),
        );
        const libres = registros
          .filter((x) => x.tipo === tipo && x.vigente && !usadas.has(x.clave))
          .map((x) => ({ tipo, numero: x.numero, datos: x.datos, fila: x.fila ?? 0 }));
        const candidatos = exps.filter((e) => !conVinculo.has(e.id));
        for (const par of planVinculacionAutomatica(libres, candidatos)) {
          const clave = claveNumero(par.registro.numero);
          await tx.insert(vinculosNumeracion).values({
            tipo,
            clave,
            expedienteId: par.expedienteId,
            origen: "AUTOMATICO",
            vinculadoPor: input.actor.id || null,
            createdAt: ahora,
          });
          const s = await sincronizarExpediente(tx, par.expedienteId, tipo, par.registro);
          const exp = porId.get(par.expedienteId);
          await appendAuditoria(tx, {
            expedienteId: par.expedienteId,
            actorId: input.actor.id || null,
            actorDni: input.actor.dni,
            estadoAnterior: exp?.estado ?? null,
            estadoNuevo: exp?.estado ?? "REGISTRADO",
            detalle: `${tipo === "OFICIO" ? "Oficio circular" : "Decreto"} N° ${s.despues ?? par.registro.numero} vinculado automáticamente desde el registro${s.antes && s.antes !== s.despues ? ` (antes: ${s.antes})` : ""}`,
          });
          resumen.vinculadosAutomaticamente++;
        }
      }

      await tx.insert(importacionesNumeracion).values({
        nombreArchivo: input.nombreArchivo.slice(0, 255),
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        resumen,
        creadoPor: input.actor.id || null,
        createdAt: ahora,
      });
      const ultima = await ultimaImportacion(tx);
      return ultima ? ok(ultima) : fail(new DomainError("VALIDACION_FALLIDA", "No se registró"));
    });
    return r;
  }
}
