import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { PageSizes, PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface DatosCaratula {
  tituloTesis: string;
  nombresTesistas: string[];
  gradoAsesor: string; // ej. "Dr.", "Mg."
  nombreAsesor: string;
  anio?: string;
}

/**
 * Convierte texto a Title Case respetando conectores gramaticales en español.
 */
export function normalizarTitleCase(texto: string): string {
  const conectores = new Set([
    "de",
    "del",
    "la",
    "las",
    "el",
    "los",
    "en",
    "y",
    "a",
    "para",
    "con",
    "por",
    "sobre",
  ]);
  return texto
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((palabra, index) => {
      if (index > 0 && conectores.has(palabra)) return palabra;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}

export class GeneradorCaratulaService {
  /**
   * Carga la plantilla oficial en PDF y estampa los datos normalizados.
   * Si no se suministra ruta o no existe el archivo, genera un lienzo base normalizado.
   */
  async generarCaratula(datos: DatosCaratula, rutaPlantillaPdf?: string): Promise<Uint8Array> {
    let pdfDoc: PDFDocument;

    if (rutaPlantillaPdf && existsSync(rutaPlantillaPdf)) {
      const bytesPlantilla = await readFile(rutaPlantillaPdf);
      pdfDoc = await PDFDocument.load(bytesPlantilla);
    } else {
      pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage(PageSizes.A4);
      const fontHeader = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const { height } = page.getSize();
      page.drawText("UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA", {
        x: 60,
        y: height - 80,
        size: 14,
        font: fontHeader,
        color: rgb(0, 0, 0),
      });
      page.drawText("FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS", {
        x: 75,
        y: height - 105,
        size: 12,
        font: fontHeader,
        color: rgb(0, 0, 0),
      });
    }

    const paginas = pdfDoc.getPages();
    const primeraPagina = paginas[0];
    if (!primeraPagina) {
      throw new Error("El documento PDF no contiene páginas");
    }

    const fuenteBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fuenteRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { width, height } = primeraPagina.getSize();

    // 1. Título de la Tesis en Title Case
    const tituloNormalizado = normalizarTitleCase(datos.tituloTesis);
    primeraPagina.drawText(tituloNormalizado, {
      x: 72,
      y: height - 320,
      size: 13,
      font: fuenteBold,
      color: rgb(0, 0, 0),
      maxWidth: width - 144,
      lineHeight: 18,
    });

    // 2. Autores ordenados estrictamente por orden alfabético
    const autoresOrdenados = [...datos.nombresTesistas].sort((a, b) => a.localeCompare(b));
    let yAutor = height - 470;

    for (const autor of autoresOrdenados) {
      primeraPagina.drawText(autor.toUpperCase(), {
        x: 72,
        y: yAutor,
        size: 11,
        font: fuenteRegular,
        color: rgb(0, 0, 0),
      });
      yAutor -= 16;
    }

    // 3. Asesor con Grado Académico estandarizado
    const textoAsesor = `Asesor: ${datos.gradoAsesor} ${datos.nombreAsesor}`;
    primeraPagina.drawText(textoAsesor, {
      x: 72,
      y: height - 570,
      size: 11,
      font: fuenteRegular,
      color: rgb(0, 0, 0),
    });

    // 4. Año de Presentación
    const anio = datos.anio ?? new Date().getFullYear().toString();
    primeraPagina.drawText(`Arequipa - Perú\n${anio}`, {
      x: width / 2 - 45,
      y: 90,
      size: 10,
      font: fuenteRegular,
      color: rgb(0, 0, 0),
      lineHeight: 14,
    });

    return await pdfDoc.save();
  }
}
