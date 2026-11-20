import type {
  EstadoNumeracionDTO,
  FiltroRegistros,
  ImportacionDTO,
  NumeracionExpedienteDTO,
  RegistroNumeracionDTO,
  ResumenImportacionDTO,
} from "@pis/contracts";
import {
  type DbExecutor,
  db,
  expedientes,
  importacionesNumeracion,
  type RegistroNumeracionRow,
  registroNumeracion,
  usuarios,
  vinculosNumeracion,
} from "@pis/db";
import {
  CAMPO_FECHA_DOCUMENTO,
  candidatosPara,
  type ExpedienteComparable,
  formatearNumeroRegistro,
  normalizarTexto,
  type RegistroNumeracion,
  TIPOS_NUMERACION,
  type TipoNumeracion,
} from "@pis/domain";
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export const TAMANO_PAGINA = 50;

/** Columna del expediente y fecha documental que alimenta cada tipo. */
export const CAMPO_EXPEDIENTE = {
  OFICIO: { numero: "nroOficio", fecha: "fechaCircular" },
  DECRETO: { numero: "nroDecreto", fecha: "fechaDecreto" },
} as const satisfies Record<TipoNumeracion, { numero: string; fecha: string }>;

export interface VinculoInfo {
  expedienteId: string;
  codigo: string;
  origen: string;
  createdAt: Date;
}

export function registroDTO(
  r: RegistroNumeracionRow,
  vinculo: VinculoInfo | null,
): RegistroNumeracionDTO {
  return {
    id: r.id,
    tipo: r.tipo as TipoNumeracion,
    numero: r.numero,
    numeroFormateado: formatearNumeroRegistro(r.numero),
    datos: r.datos,
    fila: r.fila,
    vigente: r.vigente,
    vinculo: vinculo
      ? {
          expedienteId: vinculo.expedienteId,
          codigo: vinculo.codigo,
          origen: vinculo.origen === "AUTOMATICO" ? "AUTOMATICO" : "MANUAL",
          createdAt: vinculo.createdAt.toISOString(),
        }
      : null,
  };
}

export function aRegistroDominio(r: RegistroNumeracionRow): RegistroNumeracion {
  return {
    tipo: r.tipo as TipoNumeracion,
    numero: r.numero,
    datos: r.datos,
    fila: r.fila ?? 0,
  };
}

const p1 = alias(usuarios, "p1");
const p2 = alias(usuarios, "p2");

function nombreCompleto(u: { nombres: string | null; apellidos: string | null }): string | null {
  const n = [u.nombres, u.apellidos].filter(Boolean).join(" ").trim();
  return n || null;
}

export interface ExpedienteNumeracion extends ExpedienteComparable {
  id: string;
  estado: string;
}

/** Expedientes (o uno) con los datos que se comparan contra el Excel. */
export async function expedientesComparables(
  ex: DbExecutor = db,
  expedienteId?: string,
): Promise<ExpedienteNumeracion[]> {
  const q = ex
    .select({
      id: expedientes.id,
      codigo: expedientes.codigo,
      estado: expedientes.estado,
      titulo: expedientes.titulo,
      programa: expedientes.programa,
      n1: p1.nombres,
      a1: p1.apellidos,
      n2: p2.nombres,
      a2: p2.apellidos,
    })
    .from(expedientes)
    .leftJoin(p1, eq(p1.id, expedientes.participante1Id))
    .leftJoin(p2, eq(p2.id, expedientes.participante2Id));
  const filas = expedienteId
    ? await q.where(eq(expedientes.id, expedienteId))
    : await q.where(ne(expedientes.estado, "ANULADO"));
  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    estado: f.estado,
    titulo: f.titulo,
    programa: f.programa,
    participantes: [
      nombreCompleto({ nombres: f.n1, apellidos: f.a1 }),
      nombreCompleto({ nombres: f.n2, apellidos: f.a2 }),
    ].filter((x): x is string => x !== null),
  }));
}

/** Vínculos con el código del expediente, indexados por `tipo:clave`. */
async function vinculosPorClave(
  ex: DbExecutor,
  tipo: TipoNumeracion,
  claves: readonly string[],
): Promise<Map<string, VinculoInfo>> {
  if (claves.length === 0) return new Map();
  const filas = await ex
    .select({
      clave: vinculosNumeracion.clave,
      expedienteId: vinculosNumeracion.expedienteId,
      codigo: expedientes.codigo,
      origen: vinculosNumeracion.origen,
      createdAt: vinculosNumeracion.createdAt,
    })
    .from(vinculosNumeracion)
    .innerJoin(expedientes, eq(expedientes.id, vinculosNumeracion.expedienteId))
    .where(and(eq(vinculosNumeracion.tipo, tipo), inArray(vinculosNumeracion.clave, [...claves])));
  return new Map(filas.map((f) => [f.clave, f]));
}

export async function listarRegistros(
  filtro: FiltroRegistros,
  ex: DbExecutor = db,
): Promise<{ items: RegistroNumeracionDTO[]; total: number }> {
  const condiciones = [eq(registroNumeracion.tipo, filtro.tipo)];
  const q = normalizarTexto(filtro.q);
  if (q) condiciones.push(ilike(registroNumeracion.textoBusqueda, `%${q}%`));
  if (filtro.estado === "retirados") condiciones.push(eq(registroNumeracion.vigente, false));
  if (filtro.estado === "libres") {
    condiciones.push(eq(registroNumeracion.vigente, true), isNull(vinculosNumeracion.id));
  }
  if (filtro.estado === "vinculados") condiciones.push(isNotNull(vinculosNumeracion.id));
  const unir = and(
    eq(vinculosNumeracion.tipo, registroNumeracion.tipo),
    eq(vinculosNumeracion.clave, registroNumeracion.clave),
  );
  const donde = and(...condiciones);
  const [totalFila] = await ex
    .select({ n: count() })
    .from(registroNumeracion)
    .leftJoin(vinculosNumeracion, unir)
    .where(donde);
  const filas = await ex
    .select({ r: registroNumeracion })
    .from(registroNumeracion)
    .leftJoin(vinculosNumeracion, unir)
    .where(donde)
    // Más recientes primero: el área busca los últimos números emitidos.
    .orderBy(desc(registroNumeracion.fila))
    .limit(TAMANO_PAGINA)
    .offset((filtro.pagina - 1) * TAMANO_PAGINA);
  const vinculos = await vinculosPorClave(
    ex,
    filtro.tipo,
    filas.map((f) => f.r.clave),
  );
  return {
    items: filas.map((f) => registroDTO(f.r, vinculos.get(f.r.clave) ?? null)),
    total: totalFila?.n ?? 0,
  };
}

export async function ultimaImportacion(ex: DbExecutor = db): Promise<ImportacionDTO | null> {
  const filas = await ex
    .select({
      id: importacionesNumeracion.id,
      nombreArchivo: importacionesNumeracion.nombreArchivo,
      resumen: importacionesNumeracion.resumen,
      createdAt: importacionesNumeracion.createdAt,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
    })
    .from(importacionesNumeracion)
    .leftJoin(usuarios, eq(usuarios.id, importacionesNumeracion.creadoPor))
    .orderBy(desc(importacionesNumeracion.createdAt))
    .limit(1);
  const f = filas[0];
  if (!f) return null;
  return {
    id: f.id,
    nombreArchivo: f.nombreArchivo,
    creadoPor: nombreCompleto(f),
    createdAt: f.createdAt.toISOString(),
    resumen: f.resumen as ResumenImportacionDTO,
  };
}

/** Estado de oficio y decreto del expediente con candidatos para vincular. */
export async function numeracionExpediente(
  expedienteId: string,
  ex: DbExecutor = db,
): Promise<NumeracionExpedienteDTO | null> {
  const [exp] = await expedientesComparables(ex, expedienteId);
  if (!exp) return null;
  const [hay] = await ex.select({ n: count() }).from(registroNumeracion).limit(1);
  const propios = await ex
    .select({
      tipo: vinculosNumeracion.tipo,
      clave: vinculosNumeracion.clave,
      origen: vinculosNumeracion.origen,
      createdAt: vinculosNumeracion.createdAt,
    })
    .from(vinculosNumeracion)
    .where(eq(vinculosNumeracion.expedienteId, expedienteId));

  const estado = async (tipo: TipoNumeracion): Promise<EstadoNumeracionDTO> => {
    const v = propios.find((p) => p.tipo === tipo);
    if (v) {
      const [r] = await ex
        .select()
        .from(registroNumeracion)
        .where(and(eq(registroNumeracion.tipo, tipo), eq(registroNumeracion.clave, v.clave)))
        .limit(1);
      return {
        tipo,
        registro: r
          ? registroDTO(r, {
              expedienteId,
              codigo: exp.codigo,
              origen: v.origen,
              createdAt: v.createdAt,
            })
          : null,
        candidatos: [],
      };
    }
    const libres = await ex
      .select({ r: registroNumeracion })
      .from(registroNumeracion)
      .leftJoin(
        vinculosNumeracion,
        and(
          eq(vinculosNumeracion.tipo, registroNumeracion.tipo),
          eq(vinculosNumeracion.clave, registroNumeracion.clave),
        ),
      )
      .where(
        and(
          eq(registroNumeracion.tipo, tipo),
          eq(registroNumeracion.vigente, true),
          isNull(vinculosNumeracion.id),
        ),
      );
    const porNumero = new Map(libres.map((l) => [l.r.numero, l.r]));
    const candidatos = candidatosPara(
      exp,
      libres.map((l) => aRegistroDominio(l.r)),
    ).flatMap((c) => {
      const fila = porNumero.get(c.registro.numero);
      return fila ? [{ registro: registroDTO(fila, null), puntaje: c.puntaje }] : [];
    });
    return { tipo, registro: null, candidatos };
  };

  const [oficio, decreto] = await Promise.all(TIPOS_NUMERACION.map(estado));
  if (!oficio || !decreto) return null;
  return { registroDisponible: (hay?.n ?? 0) > 0, OFICIO: oficio, DECRETO: decreto };
}

/**
 * Copia el número (formateado) y la fecha del documento del registro al
 * expediente; con `registro = null` libera el número. Devuelve el valor
 * anterior para la auditoría.
 */
export async function sincronizarExpediente(
  tx: DbExecutor,
  expedienteId: string,
  tipo: TipoNumeracion,
  registro: Pick<RegistroNumeracionRow, "numero" | "datos"> | null,
): Promise<{ antes: string | null; despues: string | null; cambio: boolean }> {
  const campos = CAMPO_EXPEDIENTE[tipo];
  const [fila] = await tx
    .select({
      nroOficio: expedientes.nroOficio,
      nroDecreto: expedientes.nroDecreto,
      metadata: expedientes.metadata,
    })
    .from(expedientes)
    .where(eq(expedientes.id, expedienteId))
    .limit(1);
  if (!fila) return { antes: null, despues: null, cambio: false };
  const antes = fila[campos.numero];
  const despues = registro ? formatearNumeroRegistro(registro.numero) : null;

  const meta = (fila.metadata as Record<string, unknown> | null) ?? {};
  const fechas = (meta.fechasDocumentos as Record<string, string | null> | null) ?? {};
  const fechaRegistro = registro?.datos[CAMPO_FECHA_DOCUMENTO[tipo]] ?? "";
  const fechaNueva = /^\d{4}-\d{2}-\d{2}$/.test(fechaRegistro) ? fechaRegistro : null;
  const cambiaFecha = fechaNueva !== null && fechas[campos.fecha] !== fechaNueva;

  if (antes === despues && !cambiaFecha) return { antes, despues, cambio: false };
  await tx
    .update(expedientes)
    .set({
      [campos.numero]: despues,
      ...(cambiaFecha
        ? { metadata: { ...meta, fechasDocumentos: { ...fechas, [campos.fecha]: fechaNueva } } }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(expedientes.id, expedienteId));
  return { antes, despues, cambio: true };
}

/** Tipos con vínculo vigente en el expediente (los campos quedan bloqueados a mano). */
export async function tiposVinculados(
  expedienteId: string,
  ex: DbExecutor = db,
): Promise<Set<TipoNumeracion>> {
  const filas = await ex
    .select({ tipo: vinculosNumeracion.tipo })
    .from(vinculosNumeracion)
    .where(eq(vinculosNumeracion.expedienteId, expedienteId));
  return new Set(filas.map((f) => f.tipo as TipoNumeracion));
}
