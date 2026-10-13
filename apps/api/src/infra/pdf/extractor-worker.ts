/** Subproceso sin secretos: el padre entrega únicamente un descriptor PDF en fd 3. */
import { fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { PDFParse } from "pdf-parse";
import { PDFDataRangeTransport } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_TEXTO = 100_000;
const descriptor = process.env.PDF_SANDBOX_INPUT === "1" ? openSync("/input/document.pdf", "r") : 3;

class TransporteArchivo extends PDFDataRangeTransport {
  override requestDataRange(begin: number, end: number): void {
    if (begin < 0 || end > this.length || end <= begin || end - begin > MAX_BYTES) {
      throw new Error("Rango inválido");
    }
    const bytes = new Uint8Array(end - begin);
    let leidos = 0;
    while (leidos < bytes.length) {
      const n = readSync(descriptor, bytes, leidos, bytes.length - leidos, begin + leidos);
      if (!n) throw new Error("Archivo truncado");
      leidos += n;
    }
    // PDF.js registra la solicitud antes de recibir el callback de transporte.
    queueMicrotask(() => this.onDataRange(begin, bytes));
  }
}

async function extraer() {
  const size = fstatSync(descriptor).size;
  if (size < 8 || size > MAX_BYTES) throw new Error("Tamaño inválido");
  const initial = new Uint8Array(Math.min(size, 64 * 1024));
  readSync(descriptor, initial, 0, initial.length, 0);
  if (new TextDecoder().decode(initial.subarray(0, 5)) !== "%PDF-")
    throw new Error("Firma inválida");
  const transport = new TransporteArchivo(size, initial);
  const parser = new PDFParse({
    range: transport,
    length: size,
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const result = await parser.getText({ first: 3 });
    if (result.text.length > MAX_TEXTO) throw new Error("Texto excedido");
    process.stdout.write(
      JSON.stringify({
        paginas: result.pages.map((p) => ({ numero: p.num, texto: p.text })),
        totalPaginas: result.total,
        rss: process.memoryUsage().rss,
        ...(process.env.PDF_SANDBOX_INPUT === "1"
          ? { peakCgroupBytes: Number(readFileSync("/sys/fs/cgroup/memory.peak", "utf8").trim()) }
          : {}),
      }),
    );
  } finally {
    await parser.destroy();
  }
}

extraer().catch(() => {
  // No divulgar contenido ni detalles internos del parser.
  process.stdout.write(JSON.stringify({ error: "PDF_NO_EVALUABLE" }));
  process.exitCode = 1;
});
