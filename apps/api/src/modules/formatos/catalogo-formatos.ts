/**
 * Catálogo de formatos gestionables: un formato = plantilla DOCX física
 * (tipo canónico × variante 1|2 tesistas). Se arma desde el catálogo
 * canónico de `@pis/contracts` y los nombres de `@pis/domain` (PLANTILLAS).
 */
import {
  DOCUMENTOS_1_TESISTA_ETAPA_01,
  DOCUMENTOS_1_TESISTA_ETAPA_02,
  DOCUMENTOS_2_TESISTAS_ETAPA_01,
  DOCUMENTOS_2_TESISTAS_ETAPA_02,
  METADATA_DOCUMENTOS_2_TESISTAS_E2,
} from "@pis/contracts";
import { PLANTILLAS } from "@pis/domain";
import { archivoBasePlantilla } from "../../infra/docx/render-docx.js";

export type Variante = 1 | 2;
export type EtapaFormato = "E1" | "E2";

export interface FormatoCatalogo {
  readonly tipo: string;
  readonly variante: Variante;
  /** Etapa vigente (la original o la que eligió el área). */
  readonly etapa: EtapaFormato;
  /**
   * Etapa de la plantilla base del repositorio (ubica el archivo en
   * `ETAPA01/ETAPA02`); `null` en un formato agregado por el área.
   */
  readonly etapaBase: EtapaFormato | null;
  /** true = formato nuevo agregado por el área (sin plantilla base). */
  readonly agregado: boolean;
  /** true = el área lo eliminó: no se genera ni se lista (se puede restaurar). */
  readonly archivado: boolean;
  readonly nombre: string;
  readonly archivoBase: string;
}

/** Fila de `formatos_catalogo` que importa al catálogo (ver `@pis/db`). */
export interface AjusteCatalogo {
  readonly tipo: string;
  readonly variante: number;
  readonly etapa: string;
  readonly nombre: string | null;
  readonly agregado: boolean;
  readonly archivado: boolean;
}

/** Tipos alternativos del motor que comparten archivo físico con un tipo canónico. */
const ALIAS: Readonly<Record<string, string>> = {
  SOLICITUD_INSCRIPCION: "ANEXO_17",
  OFICIO_CIRCULAR: "OFICIO_CIRCULAR_TERNA",
  OBSERVACIONES_PLAN_TESIS: "OBSERVACIONES_PLAN",
  INFORME_ASESORAMIENTO: "ANEXO_08",
  ANEXO_18: "ANEXO_08",
  ANEXO_33: "RESOLUCION_DECANAL",
};

/**
 * Tipo canónico del formato que usa `tipo` al generar: con 1 tesista los
 * `_P1/_P2` comparten la plantilla individual; con 2 tesistas los anexos
 * por participante usan su propia plantilla (`_P1` por defecto).
 */
export function tipoFormatoCanonico(tipo: string, variante: Variante): string {
  const t = ALIAS[tipo] ?? tipo;
  if (variante === 1) return t.replace(/_P[12]$/, "");
  if (t === "ANEXO_01_DJ" || t === "ANEXO_02_DJ") return `${t}_P1`;
  return t;
}

function nombreDe(tipo: string): string {
  const p = PLANTILLAS.find((x) => x.tipo === tipo);
  if (p) return p.nombre;
  const base = PLANTILLAS.find((x) => x.tipo === tipo.replace(/_P[12]$/, ""));
  const n = tipo.match(/_P([12])$/)?.[1];
  return base ? `${base.nombre}${n ? ` — participante ${n}` : ""}` : tipo;
}

function entrada(tipo: string, variante: Variante, etapa: EtapaFormato): FormatoCatalogo {
  return {
    tipo,
    variante,
    etapa,
    etapaBase: etapa,
    agregado: false,
    archivado: false,
    nombre: nombreDe(tipo),
    archivoBase: archivoBasePlantilla(tipo, variante) ?? `${tipo}.docx`,
  };
}

function construir(): FormatoCatalogo[] {
  const lista: FormatoCatalogo[] = [];
  for (const t of DOCUMENTOS_1_TESISTA_ETAPA_01) lista.push(entrada(t, 1, "E1"));
  for (const t of DOCUMENTOS_1_TESISTA_ETAPA_02) lista.push(entrada(t, 1, "E2"));
  for (const t of DOCUMENTOS_2_TESISTAS_ETAPA_01) lista.push(entrada(t, 2, "E1"));
  for (const t of DOCUMENTOS_2_TESISTAS_ETAPA_02) {
    const meta = METADATA_DOCUMENTOS_2_TESISTAS_E2[t];
    const tipos = meta.alcance === "participante" && meta.subdocumentos ? meta.subdocumentos : [t];
    for (const sub of tipos) lista.push(entrada(sub, 2, "E2"));
  }
  return lista;
}

/** Formatos del sistema en su etapa original (sin los ajustes del área). */
export const CATALOGO_FORMATOS: readonly FormatoCatalogo[] = construir();

export function esEtapaFormato(v: unknown): v is EtapaFormato {
  return v === "E1" || v === "E2";
}

/** Nombre del archivo que se descarga para un formato agregado (sin caracteres de ruta). */
export function archivoDeNombre(nombre: string): string {
  const limpio = nombre
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${limpio || "FORMATO"}.docx`;
}

/**
 * Catálogo vigente = formatos del sistema (con la etapa que eligió el área)
 * + formatos agregados por el área. Puro: los ajustes vienen de la DB.
 * `incluirArchivados` sirve para resolver nombres de documentos ya generados.
 */
export function aplicarAjustes(
  base: readonly FormatoCatalogo[],
  ajustes: readonly AjusteCatalogo[],
  opciones: { incluirArchivados?: boolean } = {},
): FormatoCatalogo[] {
  const clave = (tipo: string, variante: number) => `${variante}:${tipo}`;
  const porClave = new Map(ajustes.map((a) => [clave(a.tipo, a.variante), a]));
  const lista: FormatoCatalogo[] = [];
  for (const f of base) {
    const a = porClave.get(clave(f.tipo, f.variante));
    if (!a || a.agregado) {
      lista.push(f);
      continue;
    }
    if (a.archivado && !opciones.incluirArchivados) continue;
    lista.push({
      ...f,
      etapa: esEtapaFormato(a.etapa) ? a.etapa : f.etapa,
      archivado: a.archivado,
    });
  }
  const enBase = new Set(base.map((f) => clave(f.tipo, f.variante)));
  for (const a of ajustes) {
    if (!a.agregado || enBase.has(clave(a.tipo, a.variante))) continue;
    if (a.archivado && !opciones.incluirArchivados) continue;
    if (!esEtapaFormato(a.etapa) || (a.variante !== 1 && a.variante !== 2)) continue;
    const nombre = a.nombre?.trim() || a.tipo;
    lista.push({
      tipo: a.tipo,
      variante: a.variante,
      etapa: a.etapa,
      etapaBase: null,
      agregado: true,
      archivado: a.archivado,
      nombre,
      archivoBase: archivoDeNombre(nombre),
    });
  }
  return lista;
}

function formatoDeTipo(
  catalogo: readonly FormatoCatalogo[],
  tipo: string,
  variante: Variante,
): FormatoCatalogo | null {
  const canon = tipoFormatoCanonico(tipo, variante);
  return catalogo.find((f) => f.variante === variante && f.tipo === canon) ?? null;
}

/**
 * Etapa en la que el expediente muestra un tipo documental según el catálogo
 * de su variante. `soloAjustes` = solo si el área lo movió o lo agregó (el
 * checklist conserva su etapa configurada); sin él, la etapa vigente del
 * formato (documentos ya generados, aunque el formato se haya movido después).
 */
export function etapaEnExpediente(
  catalogo: readonly FormatoCatalogo[],
  tipo: string,
  variante: Variante,
  opciones: { soloAjustes?: boolean } = {},
): EtapaFormato | null {
  const f = formatoDeTipo(catalogo, tipo, variante);
  if (!f) return null;
  if (opciones.soloAjustes && !f.agregado && f.etapa === f.etapaBase) return null;
  return f.etapa;
}

/** Nombre de un formato agregado por el área (incluso archivado), o `null`. */
export function nombreAgregado(
  catalogo: readonly FormatoCatalogo[],
  tipo: string,
  variante: Variante,
): string | null {
  const f = catalogo.find((x) => x.variante === variante && x.tipo === tipo && x.agregado);
  return f?.nombre ?? null;
}

/** Prefijo de los tipos de formatos agregados: nunca choca con un tipo del sistema. */
export const PREFIJO_AGREGADO = "AREA_";

/**
 * Tipo estable para un formato agregado, derivado del nombre
 * (`Constancia de egresado` → `AREA_CONSTANCIA_DE_EGRESADO`), con sufijo
 * `_2`, `_3`… si ya existe en la variante.
 */
export function tipoParaNombre(nombre: string, existentes: ReadonlySet<string>): string {
  const slug = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  const base = `${PREFIJO_AGREGADO}${slug || "FORMATO"}`;
  if (!existentes.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidato = `${base}_${n}`;
    if (!existentes.has(candidato)) return candidato;
  }
}

export function buscarFormato(tipo: string, variante: number): FormatoCatalogo | null {
  return CATALOGO_FORMATOS.find((f) => f.tipo === tipo && f.variante === variante) ?? null;
}
