import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { obtenerPlantillaDocx, procesarDocxBuffer } from "./render-docx.js";

describe("Motor DOCX OpenXML (render-docx)", () => {
  it("carga plantillas maestras para 1 y 2 tesistas", () => {
    const t1 = obtenerPlantillaDocx("DECRETO_APROBACION", "E1", 1);
    expect(t1).not.toBeNull();
    expect(t1?.length).toBeGreaterThan(1000);

    const t2 = obtenerPlantillaDocx("DECRETO_APROBACION", "E1", 2);
    expect(t2).not.toBeNull();
    expect(t2?.length).toBeGreaterThan(1000);
  });

  it("reemplaza etiquetas canónicas y resalta pendientes en amarillo", () => {
    const plantilla = obtenerPlantillaDocx("DECRETO_APROBACION", "E1", 1);
    expect(plantilla).not.toBeNull();

    const datos: Record<string, string> = {
      DECRETO: "100-2026",
      "FECHA DE DECRETO": "16 de octubre de 2026",
      NOMBRES: "CARLOS RAMIREZ",
      PROGRAMAS: "INGENIERIA INDUSTRIAL",
      // TESIS se omite a propósito para verificar el pendiente
      PRESIDENTE: "DR. JORGE VALDEZ",
      SECRETARIO: "MG. ROSA DIAZ",
      ASESOR: "DR. ALBERTO FLORES",
    };

    if (!plantilla) throw new Error("Plantilla no encontrada");
    const resultado = procesarDocxBuffer(plantilla, datos);
    expect(resultado.buffer).toBeInstanceOf(Buffer);
    expect(resultado.buffer.length).toBeGreaterThan(1000);

    // Debe contener TESIS en la lista de pendientes
    expect(resultado.pendientes).toContain("TESIS");

    // Convertir buffer generado a texto para inspeccionar el XML interno
    const zip = new PizZip(resultado.buffer);
    const xml = zip.file("word/document.xml")?.asText() ?? "";

    // Debe contener los datos insertados
    expect(xml).toContain("CARLOS RAMIREZ");
    expect(xml).toContain("100-2026");

    // Debe contener el highlight amarillo para TESIS
    expect(xml).toContain('<w:highlight w:val="yellow"/>');
    expect(xml).toContain("&lt;&lt;TESIS&gt;&gt;");
  });
});
