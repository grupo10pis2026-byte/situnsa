/**
 * Análisis y saneamiento de una plantilla DOCX subida desde "Gestión de
 * formatos". Word suele partir `<<CAMPO>>` en varios runs (`<w:r>`) al
 * editar, corregir ortografía o cambiar formato: el motor de render busca la
 * etiqueta dentro de un solo `<w:t>` y la dejaría como pendiente. Aquí se
 * unen esas etiquetas en el primer run (conserva su formato) y se listan
 * las etiquetas presentes para validarlas antes de activar la versión.
 */
import PizZip from "pizzip";
import { ARCHIVOS_XML_DOCX, claveEtiqueta } from "./render-docx.js";

const PATRON_T = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
const PATRON_PARRAFO = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
/** Etiqueta sobre el texto ya escapado de los `<w:t>` (`&lt;&lt;CAMPO&gt;&gt;` o `>>`). */
const PATRON_TAG_ESCAPADO = /&lt;&lt;[^<>&]*?(?:&gt;&gt;|>>)/g;
const PATRON_TAG = /(?:<<|&lt;&lt;)([^<>&]+)(?:>>|&gt;&gt;)/g;

/**
 * Une en un solo `<w:t>` las etiquetas repartidas en varios dentro de un
 * párrafo. Devuelve el XML y cuántas etiquetas se repararon.
 */
export function unirEtiquetasFragmentadas(xml: string): { xml: string; reparadas: number } {
  let reparadas = 0;
  const salida = xml.replace(PATRON_PARRAFO, (parrafo) => {
    const nodos = [...parrafo.matchAll(PATRON_T)];
    if (nodos.length < 2) return parrafo;
    const textos = nodos.map((n) => n[2] ?? "");
    const unido = textos.join("");
    // Dueño (índice de nodo) de cada carácter del texto unido.
    const duenos: number[] = [];
    textos.forEach((t, i) => {
      for (let k = 0; k < t.length; k++) duenos.push(i);
    });
    let cambio = false;
    for (const m of unido.matchAll(PATRON_TAG_ESCAPADO)) {
      const ini = m.index ?? 0;
      const fin = ini + m[0].length;
      const primero = duenos[ini];
      if (primero === undefined || duenos[fin - 1] === primero) continue;
      for (let k = ini; k < fin; k++) duenos[k] = primero;
      reparadas++;
      cambio = true;
    }
    if (!cambio) return parrafo;
    const nuevos = textos.map(() => "");
    for (let k = 0; k < unido.length; k++) {
      const d = duenos[k] ?? 0;
      nuevos[d] = `${nuevos[d] ?? ""}${unido[k] ?? ""}`;
    }
    let i = 0;
    return parrafo.replace(PATRON_T, (_m, abre: string, _t: string, cierra: string) => {
      const texto = nuevos[i] ?? "";
      const original = textos[i] ?? "";
      i++;
      if (texto === original) return `${abre}${texto}${cierra}`;
      const abreConEspacios = abre.includes("xml:space")
        ? abre
        : abre.replace(/^<w:t/, '<w:t xml:space="preserve"');
      return `${abreConEspacios}${texto}${cierra}`;
    });
  });
  return { xml: salida, reparadas };
}

export function etiquetasEnXml(xml: string): string[] {
  const claves = new Set<string>();
  for (const m of xml.matchAll(PATRON_TAG)) claves.add(claveEtiqueta(m[1] ?? ""));
  return [...claves];
}

export interface AnalisisPlantilla {
  /** DOCX saneado (etiquetas unidas) listo para guardar. */
  readonly buffer: Buffer;
  readonly etiquetas: string[];
  readonly reparadas: number;
}

/** `null` si los bytes no son un DOCX (zip con `word/document.xml`). */
export function analizarPlantillaDocx(bytes: Uint8Array): AnalisisPlantilla | null {
  let zip: PizZip;
  try {
    zip = new PizZip(bytes);
  } catch {
    return null;
  }
  if (!zip.file("word/document.xml")) return null;
  const etiquetas = new Set<string>();
  let reparadas = 0;
  for (const ruta of ARCHIVOS_XML_DOCX) {
    const archivo = zip.file(ruta);
    if (!archivo) continue;
    const r = unirEtiquetasFragmentadas(archivo.asText());
    reparadas += r.reparadas;
    if (r.reparadas > 0) zip.file(ruta, r.xml);
    for (const e of etiquetasEnXml(r.xml)) etiquetas.add(e);
  }
  const buffer =
    reparadas > 0
      ? zip.generate({ type: "nodebuffer", compression: "DEFLATE" })
      : Buffer.from(bytes);
  return { buffer, etiquetas: [...etiquetas].sort(), reparadas };
}

/** Etiquetas de un DOCX sin modificarlo (plantilla base del repositorio). */
export function etiquetasDeDocx(bytes: Uint8Array): string[] {
  return analizarPlantillaDocx(bytes)?.etiquetas ?? [];
}
