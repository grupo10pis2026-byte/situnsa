/**
 * Vista previa PDF de un formato (plantilla DOCX tal cual, con sus
 * etiquetas `<<CAMPO>>` visibles). Se convierte con Gotenberg **una sola
 * vez** y se cachea en el volumen: las versiones subidas son inmutables
 * (clave = id) y la base se identifica por su hash (cambia al desplegar).
 * La entrega va por `entregarArchivo` (X-Accel en prod), nunca desde memoria.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { convertirDocxAPdf } from "../../infra/docx/docx-to-pdf.js";
import { rutaPlantillaBase } from "../../infra/docx/render-docx.js";
import type { LocalStorageService } from "../../infra/storage/local-storage.service.js";
import type { FormatoCatalogo } from "./catalogo-formatos.js";
import type { VersionRow } from "./formatos.repository.js";

export type ResultadoVistaPrevia =
  | { ok: true; ruta: string }
  | { ok: false; motivo: "SIN_PLANTILLA" | "CONVERSION_FALLIDA"; detalle?: string };

export type Convertidor = (docx: Buffer, nombre: string) => Promise<Buffer>;

/** Clave de caché: versión subida → su id; base → variante, tipo y hash del archivo. */
export function claveVistaPrevia(
  formato: { tipo: string; variante: number },
  version: Pick<VersionRow, "id"> | null,
  shaBase: string | null,
): string {
  return version
    ? `v_${version.id}`
    : `base_${formato.variante}_${formato.tipo}_${(shaBase ?? "").slice(0, 16)}`;
}

async function asegurar(
  storage: LocalStorageService,
  clave: string,
  docx: () => Promise<Buffer | null>,
  nombre: string,
  convertir: Convertidor,
): Promise<ResultadoVistaPrevia> {
  const ruta = storage.rutaVistaPrevia(clave);
  if (await storage.existe(ruta)) return { ok: true, ruta };
  const bytes = await docx();
  if (!bytes) return { ok: false, motivo: "SIN_PLANTILLA" };
  try {
    const pdf = await convertir(bytes, nombre);
    return { ok: true, ruta: await storage.saveVistaPrevia(clave, pdf) };
  } catch (err) {
    return {
      ok: false,
      motivo: "CONVERSION_FALLIDA",
      detalle: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Vista previa de una versión subida del historial. */
export function vistaPreviaVersion(
  storage: LocalStorageService,
  version: VersionRow,
  convertir: Convertidor = convertirDocxAPdf,
): Promise<ResultadoVistaPrevia> {
  return asegurar(
    storage,
    claveVistaPrevia({ tipo: version.tipo, variante: version.variante }, version, null),
    () => storage.leer(version.ruta),
    `${version.tipo}_v${version.version}.docx`,
    convertir,
  );
}

/** Vista previa de la plantilla base del sistema. */
export function vistaPreviaBase(
  storage: LocalStorageService,
  formato: FormatoCatalogo,
  convertir: Convertidor = convertirDocxAPdf,
): Promise<ResultadoVistaPrevia> {
  const ruta = formato.etapaBase
    ? rutaPlantillaBase(formato.tipo, formato.etapaBase, formato.variante)
    : null;
  if (!ruta || !existsSync(ruta)) {
    return Promise.resolve({ ok: false, motivo: "SIN_PLANTILLA" });
  }
  const bytes = readFileSync(ruta);
  const sha = createHash("sha256").update(bytes).digest("hex");
  return asegurar(
    storage,
    claveVistaPrevia(formato, null, sha),
    async () => bytes,
    formato.archivoBase,
    convertir,
  );
}
