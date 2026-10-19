import { describe, expect, it } from "vitest";
import { GeneradorCaratulaService, normalizarTitleCase } from "./generador-caratula.service.js";

describe("normalizarTitleCase", () => {
  it("respeta conectores gramaticales en español", () => {
    const input = "SISTEMA DE GESTION Y CONTROL PARA LA UNIVERSIDAD";
    const resultado = normalizarTitleCase(input);
    expect(resultado).toBe("Sistema de Gestion y Control para la Universidad");
  });

  it("capitaliza primera palabra aunque sea conector", () => {
    const input = "LA TESIS SOBRE INTELIGENCIA ARTIFICIAL";
    const resultado = normalizarTitleCase(input);
    expect(resultado).toBe("La Tesis sobre Inteligencia Artificial");
  });
});

describe("GeneradorCaratulaService", () => {
  const service = new GeneradorCaratulaService();

  it("genera un PDF válido estampando datos sin plantilla física", async () => {
    const bytes = await service.generarCaratula({
      tituloTesis: "SISTEMA DE TITULACIÓN Y SEGUNDA ESPECIALIDAD",
      nombresTesistas: ["ZAMBRANO PÉREZ, JUAN", "ÁLVAREZ GÓMEZ, MARÍA"],
      gradoAsesor: "Dr.",
      nombreAsesor: "Carlos Docente",
      anio: "2026",
    });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);

    // Comprobar magic bytes %PDF-
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });
});
