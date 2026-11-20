import { describe, expect, it, vi } from "vitest";
import { buscarFormato } from "../../catalogo-formatos.js";

// Catálogo vigente sin DB: el catálogo del sistema sin ajustes del área.
vi.mock("../../formatos.repository.js", async (original) => ({
  ...(await original<typeof import("../../formatos.repository.js")>()),
  buscarFormatoVigente: vi.fn(async (tipo: string, variante: number) =>
    buscarFormato(tipo, variante),
  ),
}));

const {
  advertenciasPlantilla,
  etiquetasConocidas,
  SubirFormatoUseCase,
  TAMANO_MAXIMO_FORMATO,
  validarDocxFormato,
} = await import("./subir-formato.use-case.js");

const actor = { id: "", dni: "00000000" };

describe("SubirFormatoUseCase", () => {
  it("conoce las etiquetas que rellena el sistema", () => {
    const c = etiquetasConocidas();
    for (const e of ["DECRETO", "OFICIO", "TESIS", "NOMBRES", "FECHA DE DECRETO", "COASESOR"]) {
      expect(c.has(e)).toBe(true);
    }
    expect(c.has("CAMPO_INVENTADO")).toBe(false);
  });

  it("advierte etiquetas desconocidas, omitidas y reparadas", () => {
    const avisos = advertenciasPlantilla(
      ["DECRETO", "ANIO_DECRETO"],
      new Set(["DECRETO", "TESIS"]),
      ["DECRETO", "TESIS"],
      2,
    );
    expect(avisos).toHaveLength(3);
    expect(avisos[0]).toContain("<<ANIO_DECRETO>>");
    expect(avisos[1]).toContain("<<TESIS>>");
    expect(avisos[2]).toContain("2 etiqueta(s)");
  });

  it("advierte cuando la plantilla no tiene etiquetas", () => {
    expect(advertenciasPlantilla([], new Set(), [], 0)[0]).toContain("no tiene etiquetas");
  });

  it("rechaza formatos fuera del catálogo", async () => {
    const r = await new SubirFormatoUseCase().execute({
      tipo: "NO_EXISTE",
      variante: 1,
      nombreArchivo: "x.docx",
      bytes: new Uint8Array([1]),
      actor,
    });
    expect(r.ok ? null : r.error.code).toBe("NO_ENCONTRADO");
  });

  it("rechaza archivos que no son .docx válidos", async () => {
    const uc = new SubirFormatoUseCase();
    const base = { tipo: "DECRETO_APROBACION", variante: 1, actor };
    const pdf = await uc.execute({ ...base, nombreArchivo: "x.pdf", bytes: new Uint8Array([1]) });
    expect(pdf.ok ? null : pdf.error.code).toBe("DOCUMENTO_INVALIDO");
    const roto = await uc.execute({
      ...base,
      nombreArchivo: "x.docx",
      bytes: new TextEncoder().encode("no es zip"),
    });
    expect(roto.ok ? null : roto.error.code).toBe("DOCUMENTO_INVALIDO");
    const grande = await uc.execute({
      ...base,
      nombreArchivo: "x.docx",
      bytes: new Uint8Array(TAMANO_MAXIMO_FORMATO + 1),
    });
    expect(grande.ok ? null : grande.error.code).toBe("DOCUMENTO_INVALIDO");
  });

  it("valida el DOCX antes de tocar la base de datos", () => {
    const r = validarDocxFormato("x.docx", new TextEncoder().encode("no es zip"));
    expect(r.ok ? null : r.error.code).toBe("DOCUMENTO_INVALIDO");
  });
});
