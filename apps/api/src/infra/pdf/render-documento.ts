import type { DocumentoRenderizado, Segmento } from "@pis/domain";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

/**
 * Renderer PDF de los formatos generados ("Insertar datos"). Diseño A4
 * institucional; las etiquetas pendientes se resaltan en amarillo como en
 * el legacy (`resaltarEtiquetasPendientesDocumento_`). Documentos de pocas
 * páginas: se generan en memoria y se guardan en el volumen documental.
 */

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 72;
const ANCHO_UTIL = A4.ancho - MARGEN * 2;
const NEGRO = rgb(0.09, 0.13, 0.2);
const GRIS = rgb(0.41, 0.45, 0.53);
const GUINDA = rgb(0.48, 0, 0.1);
const AMARILLO = rgb(1, 0.93, 0.35);

export interface MetaPdf {
  codigo: string;
  versionPlantilla: string;
  generadoEn: Date;
}

interface Pieza {
  texto: string;
  pendiente: boolean;
}

/** Palabra indivisible: piezas pegadas sin espacio (p. ej. «<<TESIS>>»). */
type Palabra = Pieza[];

class Lienzo {
  page: PDFPage;
  y: number;
  constructor(
    private readonly pdf: PDFDocument,
    private readonly pie: () => void,
  ) {
    this.page = pdf.addPage([A4.ancho, A4.alto]);
    this.y = A4.alto - MARGEN;
  }
  asegurar(alto: number): void {
    if (this.y - alto >= MARGEN + 24) return;
    this.pie();
    this.page = this.pdf.addPage([A4.ancho, A4.alto]);
    this.y = A4.alto - MARGEN;
  }
}

/** Reemplaza caracteres que la fuente estándar (WinAnsi) no puede codificar. */
function codificable(font: PDFFont): (texto: string) => string {
  const soportados = new Set(font.getCharacterSet());
  return (texto) =>
    [...texto]
      .map((ch) => {
        const cp = ch.codePointAt(0) ?? 63;
        if (soportados.has(cp)) return ch;
        if (ch === "≥") return ">=";
        if (ch === "≤") return "<=";
        if (/\s/.test(ch)) return " ";
        return "?";
      })
      .join("");
}

/**
 * Ancho tal como se dibuja: `widthOfTextAtSize` aplica kerning (pares como
 * "LT", "TA") pero `drawText` no, así que medir la cadena completa
 * subestima el ancho y la palabra invade el espacio siguiente. Se mide
 * carácter por carácter (sin pares de kerning).
 */
export function anchoTexto(font: PDFFont, texto: string, tam: number): number {
  let total = 0;
  for (const ch of texto) total += font.widthOfTextAtSize(ch, tam);
  return total;
}

export function aPalabras(segmentos: readonly Segmento[]): Palabra[] {
  const palabras: Palabra[] = [];
  let actual: Palabra = [];
  const cerrar = (): void => {
    if (actual.length > 0) palabras.push(actual);
    actual = [];
  };
  for (const s of segmentos) {
    if (s.pendiente) {
      actual.push({ texto: s.texto, pendiente: true });
      continue;
    }
    const partes = s.texto.split(/(\s+)/);
    for (const parte of partes) {
      if (parte === "") continue;
      if (/^\s+$/.test(parte)) {
        cerrar();
        continue;
      }
      actual.push({ texto: parte, pendiente: false });
    }
  }
  cerrar();
  return palabras;
}

function anchoPalabra(p: Palabra, font: PDFFont, tam: number): number {
  return p.reduce((n, pieza) => n + anchoTexto(font, pieza.texto, tam), 0);
}

function lineas(palabras: Palabra[], font: PDFFont, tam: number, ancho: number): Palabra[][] {
  const espacio = font.widthOfTextAtSize(" ", tam);
  const out: Palabra[][] = [];
  let linea: Palabra[] = [];
  let usado = 0;
  for (const p of palabras) {
    const w = anchoPalabra(p, font, tam);
    const extra = linea.length > 0 ? espacio + w : w;
    if (linea.length > 0 && usado + extra > ancho) {
      out.push(linea);
      linea = [p];
      usado = w;
    } else {
      linea.push(p);
      usado += extra;
    }
  }
  if (linea.length > 0) out.push(linea);
  return out;
}

function dibujarLinea(
  page: PDFPage,
  linea: Palabra[],
  x0: number,
  y: number,
  font: PDFFont,
  tam: number,
  color = NEGRO,
): void {
  const espacio = font.widthOfTextAtSize(" ", tam);
  let x = x0;
  linea.forEach((palabra, i) => {
    if (i > 0) x += espacio;
    for (const pieza of palabra) {
      const w = anchoTexto(font, pieza.texto, tam);
      if (pieza.pendiente) {
        page.drawRectangle({ x: x - 1, y: y - 3, width: w + 2, height: tam + 4, color: AMARILLO });
      }
      page.drawText(pieza.texto, { x, y, size: tam, font, color });
      x += w;
    }
  });
}

function anchoLinea(linea: Palabra[], font: PDFFont, tam: number): number {
  const espacio = font.widthOfTextAtSize(" ", tam);
  return linea.reduce((n, p, i) => n + anchoPalabra(p, font, tam) + (i > 0 ? espacio : 0), 0);
}

function bloque(
  lienzo: Lienzo,
  segmentos: readonly Segmento[],
  opts: {
    font: PDFFont;
    tam: number;
    centrado?: boolean;
    interlineado?: number;
    color?: ReturnType<typeof rgb>;
  },
): void {
  const alto = opts.tam * (opts.interlineado ?? 1.5);
  for (const linea of lineas(aPalabras(segmentos), opts.font, opts.tam, ANCHO_UTIL)) {
    lienzo.asegurar(alto);
    const x = opts.centrado
      ? MARGEN + (ANCHO_UTIL - anchoLinea(linea, opts.font, opts.tam)) / 2
      : MARGEN;
    dibujarLinea(lienzo.page, linea, x, lienzo.y, opts.font, opts.tam, opts.color);
    lienzo.y -= alto;
  }
}

/** Sanea el texto de los segmentos para la codificación de la fuente. */
function sanear(segmentos: readonly Segmento[], cod: (t: string) => string): Segmento[] {
  return segmentos.map((s) => ({ texto: cod(s.texto), pendiente: s.pendiente }));
}

export async function renderizarPdf(doc: DocumentoRenderizado, meta: MetaPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.nombre} — ${meta.codigo}`);
  pdf.setAuthor("SITUNSA · Unidad de Segunda Especialidad FIPS UNSA");
  pdf.setCreator("SITUNSA");
  pdf.setCreationDate(meta.generadoEn);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cod = codificable(serif);

  const fecha = meta.generadoEn.toLocaleDateString("es-PE", { timeZone: "America/Lima" });
  const pie = (): void => {
    const texto = cod(
      `Formato generado por SITUNSA · Expediente ${meta.codigo} · Plantilla ${meta.versionPlantilla} · ${fecha}`,
    );
    lienzo.page.drawLine({
      start: { x: MARGEN, y: MARGEN - 8 },
      end: { x: A4.ancho - MARGEN, y: MARGEN - 8 },
      thickness: 0.5,
      color: GRIS,
    });
    lienzo.page.drawText(texto, { x: MARGEN, y: MARGEN - 22, size: 8, font: sans, color: GRIS });
  };
  const lienzo = new Lienzo(pdf, pie);

  if (doc.estilo === "caratula") {
    lienzo.y = A4.alto - MARGEN - 20;
    const [uni, fac, unidad, ...resto] = doc.parrafos;
    for (const seg of [uni, fac, unidad]) {
      if (seg) bloque(lienzo, sanear(seg, cod), { font: sansBold, tam: 13, centrado: true });
    }
    lienzo.y -= 70;
    bloque(lienzo, sanear(doc.titulo, cod), {
      font: serifBold,
      tam: 17,
      centrado: true,
      interlineado: 1.4,
      color: GUINDA,
    });
    lienzo.y -= 50;
    for (const seg of resto) {
      bloque(lienzo, sanear(seg, cod), { font: serif, tam: 13, centrado: true });
      lienzo.y -= 14;
    }
  } else {
    for (const linea of [
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA",
      "FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS",
      "UNIDAD DE SEGUNDA ESPECIALIDAD",
    ]) {
      bloque(lienzo, [{ texto: cod(linea), pendiente: false }], {
        font: sansBold,
        tam: 9,
        centrado: true,
        interlineado: 1.3,
        color: GRIS,
      });
    }
    lienzo.y -= 6;
    lienzo.page.drawLine({
      start: { x: MARGEN, y: lienzo.y + 6 },
      end: { x: A4.ancho - MARGEN, y: lienzo.y + 6 },
      thickness: 1,
      color: GUINDA,
    });
    lienzo.y -= 24;
    bloque(lienzo, sanear(doc.titulo, cod), { font: serifBold, tam: 14, centrado: true });
    lienzo.y -= 16;
    for (const p of doc.parrafos) {
      bloque(lienzo, sanear(p, cod), { font: serif, tam: 12 });
      lienzo.y -= 10;
    }
    if (doc.firmas.length > 0) {
      lienzo.asegurar(110);
      lienzo.y -= 60;
      const columnas = Math.min(doc.firmas.length, 3);
      const anchoCol = ANCHO_UTIL / columnas;
      doc.firmas.forEach((firma, i) => {
        const col = i % columnas;
        if (i > 0 && col === 0) {
          lienzo.y -= 90;
          lienzo.asegurar(90);
        }
        const x0 = MARGEN + col * anchoCol;
        const anchoLineaFirma = Math.min(anchoCol - 20, 200);
        const offsetLinea = (anchoCol - anchoLineaFirma) / 2;
        lienzo.page.drawLine({
          start: { x: x0 + offsetLinea, y: lienzo.y + 14 },
          end: { x: x0 + offsetLinea + anchoLineaFirma, y: lienzo.y + 14 },
          thickness: 0.7,
          color: NEGRO,
        });
        // Cada "\n" de la firma es una línea (nombre / cargo / DNI).
        const lineasFirma = dividirPorSaltos(firma).map((l) => sanear(l, cod));
        lineasFirma.forEach((segs, j) => {
          const palabras = aPalabras(segs);
          const tam = j === 0 ? 10 : 9;
          const font = j === 0 ? serifBold : serif;
          for (const l of lineas(palabras, font, tam, anchoCol)) {
            const w = anchoLinea(l, font, tam);
            dibujarLinea(lienzo.page, l, x0 + (anchoCol - w) / 2, lienzo.y - j * 13, font, tam);
          }
        });
      });
      lienzo.y -= 40;
    }
  }
  pie();
  return pdf.save();
}

/** Parte los segmentos en líneas según los "\n" del texto. */
function dividirPorSaltos(segmentos: readonly Segmento[]): Segmento[][] {
  const out: Segmento[][] = [[]];
  for (const s of segmentos) {
    const partes = s.pendiente ? [s.texto] : s.texto.split("\n");
    partes.forEach((parte, i) => {
      if (i > 0) out.push([]);
      if (parte) out[out.length - 1]?.push({ texto: parte, pendiente: s.pendiente });
    });
  }
  return out.filter((l) => l.length > 0);
}
