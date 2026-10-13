import { describe, expect, it, vi } from "vitest";
import { AnalizarDocumentoUseCase } from "./analizar-documento.use-case.js";

const documento = {
  id: "33333333-3333-4333-8333-333333333333",
  ruta: "/privado/plan.pdf",
  version: 2,
  sha256: "a".repeat(64),
};
const datos = {
  titulo: "Título del estudio",
  tesistas: [{ nombre: "Ana Torres", dni: "01234567" }],
  asesor: { nombre: "José Pérez" },
};
const extraido = {
  paginas: [
    {
      numero: 1,
      texto: "Título: Título del estudio\nTesista: Ana Torres DNI 01234567\nAsesor: José Pérez",
    },
    { numero: 2, texto: "Resumen\nEstudio del sistema.\nPalabras clave: sistema" },
  ],
  totalPaginas: 2,
  rss: 100,
};
describe("análisis documental", () => {
  it("asocia documento, versión y hash; no solicita IA por defecto", async () => {
    const revisar = vi.fn();
    const r = await new AnalizarDocumentoUseCase(
      vi.fn().mockResolvedValue(extraido),
      revisar,
    ).execute(documento, datos, "/privado", false);
    expect(r.documentoId).toBe(documento.id);
    expect(r.version).toBe(2);
    expect(r.sha256).toBe(documento.sha256);
    expect(r.estado).toBe("COMPLETADO");
    expect(revisar).not.toHaveBeenCalled();
  });
  it("fallo parser es no evaluable", async () => {
    const revisar = vi.fn();
    const r = await new AnalizarDocumentoUseCase(
      vi.fn().mockRejectedValue(new Error("fallo interno")),
      revisar,
    ).execute(documento, datos, "/privado", true);
    expect(r.estado).toBe("NO_EVALUABLE");
    expect(revisar).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain("fallo interno");
  });
  it("fallo editorial conserva controles", async () => {
    const r = await new AnalizarDocumentoUseCase(
      vi.fn().mockResolvedValue(extraido),
      vi.fn().mockRejectedValue(new Error("sin clave")),
    ).execute(documento, datos, "/privado", true);
    expect(r.estado).toBe("PARCIAL");
    expect(r.editorial).toBe("NO_DISPONIBLE");
    expect(r.controles.find((c) => c.tipo === "TITULO")?.estado).toBe("CONFORME");
  });
  it("resumen parcial no se envía a IA", async () => {
    const revisar = vi.fn();
    const r = await new AnalizarDocumentoUseCase(
      vi.fn().mockResolvedValue({
        ...extraido,
        totalPaginas: 5,
        paginas: [extraido.paginas[0], { numero: 3, texto: "Resumen\nContenido sin final" }],
      }),
      revisar,
    ).execute(documento, datos, "/privado", true);
    expect(r.estado).toBe("PARCIAL");
    expect(revisar).not.toHaveBeenCalled();
  });
});
