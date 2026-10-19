/**
 * Pruebas de extraer-primeras-paginas.ts, infraestructura de POST /api/documentos/:id/analisis.
 * PDFs sintéticos verifican selección 1–3, integridad y rechazo de entradas inválidas.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirPdfSeguro, extraerPrimerasPaginas } from "./extraer-primeras-paginas.js";

let raiz = "";
beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), "pis-pdf-"));
});
afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

describe("extracción real de PDF por rangos", () => {
  it("extrae páginas 1–6 y excluye el marcador de página 7", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 7; i++) {
      const page = pdf.addPage();
      page.drawText(i === 7 ? "SOLO_PAGINA_7" : `Contenido de pagina ${i}`, {
        x: 50,
        y: 700,
        font,
      });
    }
    const ruta = join(raiz, "plan.pdf");
    await writeFile(ruta, await pdf.save());
    const resultado = await extraerPrimerasPaginas(ruta, raiz);
    expect(resultado.totalPaginas).toBe(7);
    expect(resultado.paginas.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(resultado.paginas.map((p) => p.texto).join(" ")).not.toContain("SOLO_PAGINA_7");
  }, 25_000);
  it("rechaza ruta fuera de la raíz sin parsear", async () => {
    await expect(abrirPdfSeguro(join(raiz, "..", "fuera.pdf"), raiz)).rejects.toThrow();
  });
  it("rechaza firma falsa aunque tenga extensión PDF", async () => {
    const ruta = join(raiz, "falso.pdf");
    await writeFile(ruta, "contenido que no es PDF");
    await expect(extraerPrimerasPaginas(ruta, raiz)).rejects.toThrow("PDF_NO_EVALUABLE");
  }, 25_000);
  it("detecta hash diferente al registrado", async () => {
    const ruta = join(raiz, "alterado.pdf");
    await writeFile(ruta, "%PDF-1.4\ncontenido alterado");
    await expect(extraerPrimerasPaginas(ruta, raiz, "a".repeat(64))).rejects.toThrow(
      "PDF_NO_EVALUABLE",
    );
  });
});
