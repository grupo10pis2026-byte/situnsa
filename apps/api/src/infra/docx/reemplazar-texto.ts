/**
 * Buscar y reemplazar texto en una plantilla DOCX (edición en línea desde
 * "Gestión de formatos"). Word reparte el texto de un párrafo en varios runs
 * (`<w:r><w:t>`) según formato, ortografía o historial de edición, así que
 * la búsqueda se hace sobre el texto UNIDO de cada párrafo: cada coincidencia
 * se reemplaza en el run donde empieza (conserva su formato) y se borra de
 * los runs siguientes. El resto del paquete (estilos, tablas, imágenes) no se
 * toca.
 */
import PizZip from "pizzip";
import { ARCHIVOS_XML_DOCX } from "./render-docx.js";

/** Párrafo que abre (`<w:p>` / `<w:p …>`), párrafo que cierra o nodo de texto `<w:t>`. */
const PATRON_NODOS = /<w:p(?:\s[^>]*)?>|<\/w:p>|(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g;
const PATRON_ENTIDAD = /&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;
const ENTIDADES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Caracteres de contexto que acompañan a cada coincidencia en la vista previa. */
const CONTEXTO = 40;

export type ParteDocx = "CUERPO" | "ENCABEZADO" | "PIE";

export interface MuestraCoincidencia {
  readonly parte: ParteDocx;
  readonly antes: string;
  readonly texto: string;
  readonly despues: string;
}

export interface ReemplazoEnXml {
  readonly xml: string;
  readonly total: number;
  readonly muestras: Omit<MuestraCoincidencia, "parte">[];
}

export interface ReemplazoEnDocx {
  /** DOCX resultante (el original si no hubo coincidencias). */
  readonly buffer: Buffer;
  readonly total: number;
  readonly muestras: MuestraCoincidencia[];
}

function decodificarTexto(crudo: string): string {
  return crudo.replace(PATRON_ENTIDAD, (m, ent: string) => {
    if (ent.startsWith("#x")) return String.fromCodePoint(Number.parseInt(ent.slice(2), 16));
    if (ent.startsWith("#")) return String.fromCodePoint(Number.parseInt(ent.slice(1), 10));
    return ENTIDADES[ent] ?? m;
  });
}

function codificarTexto(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface NodoTexto {
  readonly ini: number;
  readonly fin: number;
  readonly abre: string;
  readonly cierra: string;
  readonly texto: string;
}

/**
 * Agrupa los `<w:t>` por párrafo. Usa una pila para que los párrafos
 * anidados (cuadros de texto dentro de un párrafo) formen su propio grupo y
 * una coincidencia nunca cruce de un párrafo a otro.
 */
function nodosPorParrafo(xml: string): NodoTexto[][] {
  const grupos = new Map<number, NodoTexto[]>();
  const pila: number[] = [];
  let siguiente = 0;
  for (const m of xml.matchAll(PATRON_NODOS)) {
    const token = m[0];
    const inicio = m.index ?? 0;
    if (m[1] !== undefined) {
      // Texto fuera de párrafo (no ocurre en un DOCX válido): grupo propio.
      const clave = pila.at(-1) ?? siguiente++;
      const grupo = grupos.get(clave) ?? [];
      grupo.push({
        ini: inicio,
        fin: inicio + token.length,
        abre: m[1],
        cierra: m[3] ?? "</w:t>",
        texto: decodificarTexto(m[2] ?? ""),
      });
      grupos.set(clave, grupo);
    } else if (token === "</w:p>") {
      pila.pop();
    } else if (!token.endsWith("/>")) {
      pila.push(siguiente++);
    }
  }
  return [...grupos.values()];
}

/** Reemplaza `buscar` (literal, distingue mayúsculas) en el XML de una parte del DOCX. */
export function reemplazarEnXml(xml: string, buscar: string, reemplazo: string): ReemplazoEnXml {
  if (!buscar) return { xml, total: 0, muestras: [] };
  const cambios: Array<{ ini: number; fin: number; nuevo: string }> = [];
  const muestras: Omit<MuestraCoincidencia, "parte">[] = [];
  let total = 0;

  for (const nodos of nodosPorParrafo(xml)) {
    const textos = nodos.map((n) => n.texto);
    const unido = textos.join("");
    const posiciones: number[] = [];
    for (let i = unido.indexOf(buscar); i !== -1; i = unido.indexOf(buscar, i + buscar.length)) {
      posiciones.push(i);
    }
    if (posiciones.length === 0) continue;
    total += posiciones.length;
    for (const i of posiciones) {
      muestras.push({
        antes: unido.slice(Math.max(0, i - CONTEXTO), i),
        texto: buscar,
        despues: unido.slice(i + buscar.length, i + buscar.length + CONTEXTO),
      });
    }

    // Dueño (índice de nodo) de cada carácter del texto unido.
    const duenos: number[] = [];
    textos.forEach((t, j) => {
      for (let k = 0; k < t.length; k++) duenos.push(j);
    });
    const nuevos = textos.map(() => "");
    let p = 0;
    for (let k = 0; k < unido.length; ) {
      const d = duenos[k] ?? 0;
      if (posiciones[p] === k) {
        nuevos[d] = `${nuevos[d] ?? ""}${reemplazo}`;
        k += buscar.length;
        p++;
      } else {
        nuevos[d] = `${nuevos[d] ?? ""}${unido[k] ?? ""}`;
        k++;
      }
    }

    nodos.forEach((n, j) => {
      const nuevo = nuevos[j] ?? "";
      if (nuevo === n.texto) return;
      const abre = n.abre.includes("xml:space")
        ? n.abre
        : n.abre.replace(/^<w:t/, '<w:t xml:space="preserve"');
      cambios.push({ ini: n.ini, fin: n.fin, nuevo: `${abre}${codificarTexto(nuevo)}${n.cierra}` });
    });
  }

  if (cambios.length === 0) return { xml, total, muestras };
  cambios.sort((a, b) => a.ini - b.ini);
  let salida = "";
  let cursor = 0;
  for (const c of cambios) {
    salida += xml.slice(cursor, c.ini) + c.nuevo;
    cursor = c.fin;
  }
  return { xml: salida + xml.slice(cursor), total, muestras };
}

function parteDe(ruta: string): ParteDocx {
  if (ruta.includes("header")) return "ENCABEZADO";
  if (ruta.includes("footer")) return "PIE";
  return "CUERPO";
}

/**
 * Aplica el reemplazo al cuerpo, encabezados y pies del DOCX (las mismas
 * partes que rellena el motor de render). `null` si los bytes no son un DOCX.
 */
export function reemplazarTextoDocx(
  bytes: Uint8Array,
  buscar: string,
  reemplazo: string,
): ReemplazoEnDocx | null {
  let zip: PizZip;
  try {
    zip = new PizZip(bytes);
  } catch {
    return null;
  }
  if (!zip.file("word/document.xml")) return null;
  let total = 0;
  const muestras: MuestraCoincidencia[] = [];
  for (const ruta of ARCHIVOS_XML_DOCX) {
    const archivo = zip.file(ruta);
    if (!archivo) continue;
    const r = reemplazarEnXml(archivo.asText(), buscar, reemplazo);
    if (r.total === 0) continue;
    total += r.total;
    const parte = parteDe(ruta);
    for (const m of r.muestras) muestras.push({ parte, ...m });
    zip.file(ruta, r.xml);
  }
  const buffer =
    total > 0 ? zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) : Buffer.from(bytes);
  return { buffer, total, muestras };
}
