/**
 * Lector XLSX mínimo (Office Open XML) sin dependencias nuevas: descomprime
 * con PizZip (ya usado por el motor DOCX) y devuelve cada hoja como matriz
 * de textos. Las fechas se entregan en ISO `yyyy-mm-dd` y los enteros con
 * formato de ceros (`0000`) conservan el relleno, como los "valores
 * mostrados" que leía el piloto Google Script (`getDisplayValues`).
 */
import PizZip from "pizzip";

export interface HojaLeida {
  readonly nombre: string;
  readonly filas: string[][];
}

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodificarXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
    if (ent[0] === "#") {
      const cp =
        ent[1] === "x" || ent[1] === "X" ? Number.parseInt(ent.slice(2), 16) : Number(ent.slice(1));
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTIDADES[ent.toLowerCase()] ?? m;
  });
}

function atributo(etiqueta: string, nombre: string): string | null {
  const m = new RegExp(`\\s${nombre}="([^"]*)"`).exec(etiqueta);
  return m?.[1] !== undefined ? decodificarXml(m[1]) : null;
}

/** Texto de un `<si>`/`<is>`: concatena los `<t>` (ignora la fonética `<rPh>`). */
function textoRico(xml: string): string {
  const sinFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of sinFonetica.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    out += decodificarXml(m[1] ?? "");
  }
  return out;
}

/** Índice 0-based de la columna a partir de la referencia `AB12`. */
export function indiceColumna(ref: string): number {
  const letras = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? "";
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const FORMATOS_FECHA_NATIVOS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

type ClaseFormato = "fecha" | { ceros: number } | null;

function claseDeFormato(codigo: string): ClaseFormato {
  // Quita literales entre comillas, escapes y secciones [color]/[$-locale].
  const limpio = codigo
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "")
    .split(";")[0]
    ?.trim();
  if (!limpio) return null;
  if (/^0+$/.test(limpio)) return { ceros: limpio.length };
  if (/[dmyhs]/i.test(limpio) && !/^[#0.,%E+-]+$/i.test(limpio)) return "fecha";
  return null;
}

function leerEstilos(zip: PizZip): ClaseFormato[] {
  const xml = zip.file("xl/styles.xml")?.asText();
  if (!xml) return [];
  const propios = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(atributo(m[0], "numFmtId"));
    const codigo = atributo(m[0], "formatCode");
    if (Number.isFinite(id) && codigo !== null) propios.set(id, codigo);
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const clases: ClaseFormato[] = [];
  for (const m of xfs.matchAll(/<xf\b[^>]*\/?>/g)) {
    const id = Number(atributo(m[0], "numFmtId") ?? "0");
    const codigo = propios.get(id);
    if (codigo !== undefined) clases.push(claseDeFormato(codigo));
    else clases.push(FORMATOS_FECHA_NATIVOS.has(id) ? "fecha" : null);
  }
  return clases;
}

/** Serial de Excel → `yyyy-mm-dd` (sistema 1900, o 1904 si el libro lo declara). */
export function serialAFechaIso(serial: number, sistema1904 = false): string {
  const base = Date.UTC(1899, 11, 30) + (sistema1904 ? 1462 : 0) * 86_400_000;
  const d = new Date(base + Math.floor(serial) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function formatearNumero(crudo: string, clase: ClaseFormato, sistema1904: boolean): string {
  const n = Number(crudo);
  if (!Number.isFinite(n)) return crudo;
  if (clase === "fecha") return serialAFechaIso(n, sistema1904);
  if (clase && typeof clase === "object" && Number.isInteger(n)) {
    return String(n).padStart(clase.ceros, "0");
  }
  // Enteros sin decimales espurios (12 en vez de 12.000000001 no se toca).
  return Number.isInteger(n) ? String(n) : crudo;
}

function rutaHoja(destino: string): string {
  const t = destino.replace(/^\/+/, "");
  return t.startsWith("xl/") ? t : `xl/${t}`;
}

/**
 * Lee todas las hojas del libro. Devuelve `null` si el archivo no es un
 * XLSX válido (zip sin `xl/workbook.xml`).
 */
export function leerXlsx(bytes: Uint8Array): HojaLeida[] | null {
  let zip: PizZip;
  try {
    zip = new PizZip(bytes);
  } catch {
    return null;
  }
  const libro = zip.file("xl/workbook.xml")?.asText();
  if (!libro) return null;
  const sistema1904 = /<workbookPr\b[^>]*date1904="(?:1|true)"/.test(libro);

  const rels = new Map<string, string>();
  const relsXml = zip.file("xl/_rels/workbook.xml.rels")?.asText() ?? "";
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = atributo(m[0], "Id");
    const destino = atributo(m[0], "Target");
    if (id && destino) rels.set(id, rutaHoja(destino));
  }

  const compartidas: string[] = [];
  const ssXml = zip.file("xl/sharedStrings.xml")?.asText() ?? "";
  for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) compartidas.push(textoRico(m[1] ?? ""));

  const estilos = leerEstilos(zip);
  const hojas: HojaLeida[] = [];
  for (const m of libro.matchAll(/<sheet\b[^>]*>/g)) {
    const nombre = atributo(m[0], "name") ?? "";
    const rid = atributo(m[0], "r:id");
    const ruta = rid ? rels.get(rid) : undefined;
    const xml = ruta ? zip.file(ruta)?.asText() : undefined;
    if (!xml) continue;
    hojas.push({ nombre, filas: leerFilas(xml, compartidas, estilos, sistema1904) });
  }
  return hojas;
}

function leerFilas(
  xml: string,
  compartidas: readonly string[],
  estilos: readonly ClaseFormato[],
  sistema1904: boolean,
): string[][] {
  const filas: string[][] = [];
  const datos = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? "";
  let siguienteFila = 1;
  for (const mf of datos.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const attrs = mf[1] ?? mf[3] ?? "";
    const r = Number(atributo(` ${attrs}`, "r") ?? siguienteFila);
    const numFila = Number.isFinite(r) && r > 0 ? r : siguienteFila;
    siguienteFila = numFila + 1;
    const celdas: string[] = [];
    let siguienteCol = 0;
    for (const mc of (mf[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = ` ${mc[1] ?? ""}`;
      const ref = atributo(a, "r");
      const col = ref ? indiceColumna(ref) : siguienteCol;
      siguienteCol = col + 1;
      const cuerpo = mc[2] ?? "";
      const tipo = atributo(a, "t");
      const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let texto = "";
      if (tipo === "s") texto = compartidas[Number(v)] ?? "";
      else if (tipo === "inlineStr") texto = textoRico(cuerpo);
      else if (tipo === "str" || tipo === "e") texto = decodificarXml(v ?? "");
      else if (tipo === "b") texto = v === "1" ? "VERDADERO" : "FALSO";
      else if (tipo === "d") texto = (v ?? "").slice(0, 10);
      else if (v !== undefined) {
        const s = Number(atributo(a, "s") ?? "0");
        texto = formatearNumero(v, estilos[s] ?? null, sistema1904);
      }
      celdas[col] = texto.trim();
    }
    for (let i = 0; i < celdas.length; i++) celdas[i] ??= "";
    filas[numFila - 1] = celdas;
  }
  for (let i = 0; i < filas.length; i++) filas[i] ??= [];
  return filas;
}
