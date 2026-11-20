import type { FormatoDTO, FormatoVersionDTO } from "@pis/contracts";
import { type DbExecutor, db, formatosCatalogo, plantillasFormato, usuarios } from "@pis/db";
import { VERSION_PLANTILLAS } from "@pis/domain";
import { and, desc, eq } from "drizzle-orm";
import { obtenerPlantillaDocx } from "../../infra/docx/render-docx.js";
import { LocalStorageService } from "../../infra/storage/local-storage.service.js";
import {
  aplicarAjustes,
  CATALOGO_FORMATOS,
  type FormatoCatalogo,
  tipoFormatoCanonico,
  type Variante,
} from "./catalogo-formatos.js";

/**
 * Catálogo vigente: formatos del sistema con la etapa elegida por el área +
 * formatos agregados (los archivados solo con `incluirArchivados`).
 */
export async function catalogoVigente(
  ex: DbExecutor = db,
  opciones: { incluirArchivados?: boolean } = {},
): Promise<FormatoCatalogo[]> {
  const ajustes = await ex
    .select({
      tipo: formatosCatalogo.tipo,
      variante: formatosCatalogo.variante,
      etapa: formatosCatalogo.etapa,
      nombre: formatosCatalogo.nombre,
      agregado: formatosCatalogo.agregado,
      archivado: formatosCatalogo.archivado,
    })
    .from(formatosCatalogo);
  return aplicarAjustes(CATALOGO_FORMATOS, ajustes, opciones);
}

/** Formato vigente (tipo × variante) o `null` si no existe o fue archivado. */
export async function buscarFormatoVigente(
  tipo: string,
  variante: number,
  ex: DbExecutor = db,
): Promise<FormatoCatalogo | null> {
  return (
    (await catalogoVigente(ex)).find((f) => f.tipo === tipo && f.variante === variante) ?? null
  );
}

export interface VersionRow {
  id: string;
  tipo: string;
  variante: number;
  version: number;
  nombreArchivo: string;
  ruta: string;
  tamanoBytes: number;
  etiquetas: string[];
  advertencias: string[];
  nota: string | null;
  activa: boolean;
  createdAt: Date;
  creadoPorNombre: string | null;
}

const columnas = {
  id: plantillasFormato.id,
  tipo: plantillasFormato.tipo,
  variante: plantillasFormato.variante,
  version: plantillasFormato.version,
  nombreArchivo: plantillasFormato.nombreArchivo,
  ruta: plantillasFormato.ruta,
  tamanoBytes: plantillasFormato.tamanoBytes,
  etiquetas: plantillasFormato.etiquetas,
  advertencias: plantillasFormato.advertencias,
  nota: plantillasFormato.nota,
  activa: plantillasFormato.activa,
  createdAt: plantillasFormato.createdAt,
  nombres: usuarios.nombres,
  apellidos: usuarios.apellidos,
};

function consulta(ex: DbExecutor) {
  return ex
    .select(columnas)
    .from(plantillasFormato)
    .leftJoin(usuarios, eq(usuarios.id, plantillasFormato.creadoPor));
}

type FilaCruda = Awaited<ReturnType<typeof consulta>>[number];

function aVersionRow(f: FilaCruda): VersionRow {
  const nombre = [f.nombres, f.apellidos].filter(Boolean).join(" ").trim();
  return {
    id: f.id,
    tipo: f.tipo,
    variante: f.variante,
    version: f.version,
    nombreArchivo: f.nombreArchivo,
    ruta: f.ruta,
    tamanoBytes: f.tamanoBytes,
    etiquetas: f.etiquetas,
    advertencias: f.advertencias,
    nota: f.nota,
    activa: f.activa,
    createdAt: f.createdAt,
    creadoPorNombre: nombre || null,
  };
}

export async function listarVersiones(
  ex: DbExecutor = db,
  filtro?: { tipo: string; variante: number },
): Promise<VersionRow[]> {
  const filas = filtro
    ? await consulta(ex)
        .where(
          and(
            eq(plantillasFormato.tipo, filtro.tipo),
            eq(plantillasFormato.variante, filtro.variante),
          ),
        )
        .orderBy(desc(plantillasFormato.version))
    : await consulta(ex).orderBy(desc(plantillasFormato.version));
  return filas.map(aVersionRow);
}

export async function versionPorId(id: string, ex: DbExecutor = db): Promise<VersionRow | null> {
  const filas = await consulta(ex).where(eq(plantillasFormato.id, id)).limit(1);
  return filas[0] ? aVersionRow(filas[0]) : null;
}

export function versionDTO(v: VersionRow): FormatoVersionDTO {
  return {
    id: v.id,
    version: v.version,
    nombreArchivo: v.nombreArchivo,
    tamanoBytes: v.tamanoBytes,
    etiquetas: v.etiquetas,
    advertencias: v.advertencias,
    nota: v.nota,
    activa: v.activa,
    creadoPor: v.creadoPorNombre,
    createdAt: v.createdAt.toISOString(),
  };
}

export function formatoDTO(f: FormatoCatalogo, versiones: readonly VersionRow[]): FormatoDTO {
  const propias = versiones.filter((v) => v.tipo === f.tipo && v.variante === f.variante);
  const activa = propias.find((v) => v.activa) ?? null;
  return {
    tipo: f.tipo,
    variante: f.variante,
    etapa: f.etapa,
    etapaOriginal: f.etapaBase,
    agregado: f.agregado,
    archivado: f.archivado,
    nombre: f.nombre,
    archivoBase: f.archivoBase,
    origen: activa ? "PERSONALIZADO" : "BASE",
    versionActiva: activa ? versionDTO(activa) : null,
    totalVersiones: propias.length,
  };
}

export async function listarFormatos(ex: DbExecutor = db): Promise<FormatoDTO[]> {
  const versiones = await listarVersiones(ex);
  // Incluye los eliminados (archivado = true) para poder restaurarlos.
  return (await catalogoVigente(ex, { incluirArchivados: true })).map((f) =>
    formatoDTO(f, versiones),
  );
}

export async function formatoActual(
  tipo: string,
  variante: number,
  ex: DbExecutor = db,
): Promise<FormatoDTO | null> {
  const f = await buscarFormatoVigente(tipo, variante, ex);
  if (!f) return null;
  return formatoDTO(f, await listarVersiones(ex, { tipo, variante }));
}

export interface PlantillaResuelta {
  readonly buffer: Buffer;
  /** `v1` (base del sistema) o `pN` (versión N subida por el área). */
  readonly versionPlantilla: string;
}

const storage = new LocalStorageService();

/**
 * Plantilla DOCX que se usa al generar: versión activa de "Gestión de
 * formatos" o, si no hay (o su archivo falta), la base del repositorio.
 * `etapaBase` es la etapa ORIGINAL del formato del sistema (ubica el archivo
 * base), no la etapa a la que el área lo haya movido.
 */
export async function resolverPlantillaDocx(
  tipo: string,
  etapaBase: string,
  numTesistas: number,
  ex: DbExecutor = db,
): Promise<PlantillaResuelta | null> {
  const variante: Variante = numTesistas > 1 ? 2 : 1;
  const canon = tipoFormatoCanonico(tipo, variante);
  const filas = await ex
    .select({ ruta: plantillasFormato.ruta, version: plantillasFormato.version })
    .from(plantillasFormato)
    .where(
      and(
        eq(plantillasFormato.tipo, canon),
        eq(plantillasFormato.variante, variante),
        eq(plantillasFormato.activa, true),
      ),
    )
    .limit(1);
  const activa = filas[0];
  if (activa) {
    const buffer = await storage.leer(activa.ruta);
    if (buffer) return { buffer, versionPlantilla: `p${activa.version}` };
    console.error(
      `[resolverPlantillaDocx] Falta el archivo de ${canon} v${activa.version} (${activa.ruta}); se usa la base`,
    );
  }
  const base = obtenerPlantillaDocx(tipo, etapaBase, numTesistas);
  return base ? { buffer: base, versionPlantilla: VERSION_PLANTILLAS } : null;
}
