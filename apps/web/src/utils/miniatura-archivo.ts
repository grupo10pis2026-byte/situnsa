/**
 * Miniaturas locales de archivos seleccionados (aún no enviados).
 * - Imágenes: object URL directo.
 * - PDF: se renderiza la primera página con pdf.js (carga diferida: el
 *   bundle de pdf.js solo se descarga cuando hay un PDF que mostrar).
 * Nada sale del navegador; el llamador debe liberar la URL con
 * `URL.revokeObjectURL` cuando ya no la use.
 */

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromesa: Promise<PdfJs> | null = null;

async function cargarPdfJs(): Promise<PdfJs> {
  pdfjsPromesa ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromesa;
}

export function esPdf(archivo: File): boolean {
  return archivo.type === "application/pdf" || archivo.name.toLowerCase().endsWith(".pdf");
}

export function esImagen(archivo: File): boolean {
  return archivo.type.startsWith("image/") || /\.(jpe?g|png)$/i.test(archivo.name);
}

/** Renderiza la página 1 del PDF a un PNG de `anchoPx` de ancho (en píxeles CSS). */
async function miniaturaPdf(archivo: File, anchoPx: number): Promise<string> {
  const pdfjs = await cargarPdfJs();
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const documento = await pdfjs.getDocument({ data: datos, isEvalSupported: false }).promise;
  try {
    const pagina = await documento.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const densidad = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = pagina.getViewport({ scale: (anchoPx / base.width) * densidad });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await pagina.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No se pudo generar la miniatura");
    return URL.createObjectURL(blob);
  } finally {
    await documento.destroy();
  }
}

/**
 * Devuelve una URL (object URL) con la vista previa del archivo, o `null`
 * si el formato no admite miniatura o el PDF está dañado/protegido.
 */
export async function generarMiniatura(archivo: File, anchoPx = 320): Promise<string | null> {
  try {
    if (esImagen(archivo)) return URL.createObjectURL(archivo);
    if (esPdf(archivo)) return await miniaturaPdf(archivo, anchoPx);
    return null;
  } catch {
    return null;
  }
}
