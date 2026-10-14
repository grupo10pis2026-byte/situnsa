/**
 * Ejecutar con node scripts/verificar-memoria-pdf.mjs [--sandbox], tras compilar la API.
 * Mide fixtures de 20/50 MiB del extractor usado por POST /api/documentos/:id/analisis; no envía documentos reales.
 */
/** Benchmark reproducible, sintético y sin datos personales. Ejecutar tras pnpm build. */
import { mkdtemp, open, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extraerPrimerasPaginas } from "../apps/api/dist/infra/pdf/extraer-primeras-paginas.js";
import { docker, runSandbox } from "./pdf-sandbox-runtime.mjs";

const requireApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { PDFDocument, StandardFonts } = requireApi("pdf-lib");
const root = await mkdtemp(join(tmpdir(), "pis-memoria-"));
const sandbox = process.argv.includes("--sandbox");
const image = sandbox
  ? (await docker(["image", "inspect", "grupo10-pdf-sandbox:local", "--format", "{{.Id}}"])).trim()
  : undefined;
try {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 4; i++)
    pdf
      .addPage()
      .drawText(i === 4 ? "SOLO_PAGINA_4" : `Pagina ${i} de prueba`, { font, x: 50, y: 700 });
  const original = Buffer.from(await pdf.save({ useObjectStreams: false }));
  const texto = original.toString("latin1");
  const xref = Number(texto.match(/startxref\s+(\d+)/u)?.[1]);
  if (!xref) throw new Error("No se localizó xref del fixture");
  for (const mib of [20, 50]) {
    const ruta = join(root, `fixture-${mib}.pdf`);
    const total = mib * 1024 * 1024;
    // Comentario grande antes de xref: no referencia objetos ni obliga a leer sus bytes.
    const deltaDigitos = String(xref + total).length - String(xref).length;
    const padding = total - original.length - deltaDigitos;
    const archivo = await open(ruta, "wx");
    try {
      await archivo.write(original.subarray(0, xref));
      await archivo.write(Buffer.from("%"));
      const bloque = Buffer.alloc(64 * 1024, "A");
      for (let restantes = padding - 2; restantes > 0; restantes -= bloque.length)
        await archivo.write(bloque.subarray(0, Math.min(restantes, bloque.length)));
      await archivo.write(Buffer.from("\n"));
      await archivo.write(
        Buffer.from(
          texto.slice(xref).replace(/startxref\s+\d+/u, `startxref\n${xref + padding}`),
          "latin1",
        ),
      );
    } finally {
      await archivo.close();
    }
    const inicio = performance.now();
    const resultado = image
      ? JSON.parse(await runSandbox(image, ruta))
      : await extraerPrimerasPaginas(ruta, root);
    if (
      resultado.paginas.length !== 3 ||
      resultado.paginas.some((p) => p.texto.includes("SOLO_PAGINA_4"))
    )
      throw new Error("Selección de páginas incorrecta");
    console.log(
      JSON.stringify({
        tamanoMiB: mib,
        duracionMs: Math.round(performance.now() - inicio),
        rssFinalMiB: Math.round(resultado.rss / 1024 / 1024),
        ...(resultado.peakCgroupBytes
          ? { picoCgroupMiB: Math.round(resultado.peakCgroupBytes / 1024 / 1024) }
          : {}),
        paginas: resultado.paginas.map((p) => p.numero),
      }),
    );
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
