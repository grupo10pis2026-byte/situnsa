import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redactarDatosResumen, revisarResumen, validarRevisionResumen } from "./revisar-resumen.js";

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.stubEnv("GEMINI_REVISION_ENABLED", "1"));
describe("validación de revisión editorial", () => {
  it("sin activación explícita no llama Gemini aunque exista clave", async () => {
    vi.stubEnv("GEMINI_REVISION_ENABLED", "0");
    vi.stubEnv("GEMINI_API_KEY", "clave-sintetica");
    const solicitar = vi.fn();
    await expect(revisarResumen("Resumen correcto", solicitar)).rejects.toThrow(
      "REVISION_NO_DISPONIBLE",
    );
    expect(solicitar).not.toHaveBeenCalled();
  });
  it("rechaza evidencia inventada", () => {
    expect(() =>
      validarRevisionResumen(
        {
          hallazgos: [
            { tipo: "TIPEO", mensaje: "Corregir", severidad: "INFO", evidencia: "inventado" },
          ],
        },
        "Texto real",
      ),
    ).toThrow();
  });
  it.each([
    {},
    { hallazgos: "texto" },
    { hallazgos: [{ tipo: "TIPEO", mensaje: "x", severidad: "BLOQUEANTE" }] },
    { hallazgos: [], secreto: "x" },
  ])("rechaza esquema inesperado", (entrada) => {
    expect(() => validarRevisionResumen(entrada, "texto")).toThrow();
  });
  it("deduplica evidencia literal válida", () => {
    const h = {
      tipo: "TIPEO",
      mensaje: "Corregir",
      severidad: "INFO",
      evidencia: "termnodinámica",
    };
    expect(
      validarRevisionResumen({ hallazgos: [h, h] }, "La termnodinámica es relevante."),
    ).toHaveLength(1);
  });
  it("redacta identificadores y correos", () => {
    expect(redactarDatosResumen("DNI 01234567 correo alumno@example.test")).toBe(
      "DNI [IDENTIFICADOR] correo [CORREO]",
    );
  });
  it("sin clave no llama proveedor", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const solicitar = vi.fn();
    await expect(revisarResumen("Resumen correcto", solicitar)).rejects.toThrow();
    expect(solicitar).not.toHaveBeenCalled();
  });
  it("payload únicamente resumen y esquema JSON", async () => {
    vi.stubEnv("GEMINI_API_KEY", "clave-sintetica");
    const solicitar = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"hallazgos":[]}' }] } }] }),
        ),
      );
    expect(await revisarResumen("SUNEDU e ISO 9001. DNI 01234567", solicitar)).toEqual([]);
    const config = solicitar.mock.calls[0]?.[1];
    const cuerpo = JSON.parse(String(config?.body));
    expect(cuerpo.contents[0].parts[0].text).toBe("SUNEDU e ISO 9001. DNI [IDENTIFICADOR]");
    expect(cuerpo.generationConfig.responseMimeType).toBe("application/json");
    expect(cuerpo.tools).toBeUndefined();
  });
  it.each([401, 429, 500])("errores %i no generan revisión aprobada", async (status) => {
    vi.stubEnv("GEMINI_API_KEY", "clave-sintetica");
    await expect(
      revisarResumen(
        "Texto",
        vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status })),
      ),
    ).rejects.toThrow();
  });
});
