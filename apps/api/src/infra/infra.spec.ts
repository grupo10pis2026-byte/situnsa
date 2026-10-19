import { CHECKLIST_COMPLETO, plantillaDe, renderizarPlantilla } from "@pis/domain";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokenVigente } from "../modules/auth/use-cases/acceso/tokens-acceso.js";
import { esResultadoFallido } from "./db/unit-of-work.js";
import { urlPortal } from "./mail/correo.service.js";
import { escaparHtml, renderizarCorreo } from "./mail/plantilla-correo.js";
import { anchoTexto, renderizarPdf } from "./pdf/render-documento.js";
import { nombreSeguro } from "./storage/local-storage.service.js";
import { obtenerPlantillaDocx, procesarDocxBuffer } from "./docx/render-docx.js";
import PizZip from "pizzip";

describe("UnitOfWork: detección de Result fallido (rollback)", () => {
  it("revierte solo los Result con ok=false", () => {
    expect(esResultadoFallido({ ok: false, error: new Error("x") })).toBe(true);
    expect(esResultadoFallido({ ok: true, value: 1 })).toBe(false);
    expect(esResultadoFallido(null)).toBe(false);
    expect(esResultadoFallido(42)).toBe(false);
  });
});

describe("plantilla de correo (HU-0062)", () => {
  it("escapa el contenido dinámico", () => {
    expect(escaparHtml(`<script>"x"</script>`)).toBe("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
    const c = renderizarCorreo({ titulo: "Hola <b>", texto: "a & b" });
    expect(c.html).toContain("Hola &lt;b&gt;");
    expect(c.html).toContain("a &amp; b");
  });

  it("solo incluye enlaces http(s) y muestra estado legible", () => {
    const malo = renderizarCorreo({ titulo: "t", texto: "x", enlace: "javascript:alert(1)" });
    expect(malo.html).not.toContain("javascript:");
    const bueno = renderizarCorreo({
      titulo: "t",
      texto: "x",
      codigo: "SET010",
      estado: "EN_PLAN",
      enlace: "https://titulacion.unsa.edu.pe/mi-tramite",
    });
    expect(bueno.texto).toContain("Expediente: SET010");
    expect(bueno.texto).toContain("Estado: En evaluación del plan");
    expect(bueno.html).toContain('href="https://titulacion.unsa.edu.pe/mi-tramite"');
  });
});

describe("enlaces del portal en los correos", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("APP_URL manda y se normaliza la barra final", () => {
    vi.stubEnv("APP_URL", "https://titulacion.unsa.edu.pe/");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://situnsa-web.onrender.com");
    expect(urlPortal("/mi-tramite")).toBe("https://titulacion.unsa.edu.pe/mi-tramite");
    expect(urlPortal("activar?token=t")).toBe("https://titulacion.unsa.edu.pe/activar?token=t");
  });

  it("sin APP_URL (o vacía) usa la URL pública de Render y luego la de dev", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://situnsa-web.onrender.com");
    expect(urlPortal("/login")).toBe("https://situnsa-web.onrender.com/login");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
    expect(urlPortal()).toBe("http://localhost:5173/");
  });
});

describe("tokens de acceso", () => {
  const ahora = new Date("2026-10-05T12:00:00Z");
  it("vigente solo si no se usó y no venció", () => {
    expect(tokenVigente({ usadoAt: null, expiraAt: new Date("2026-10-06T12:00:00Z") }, ahora)).toBe(
      true,
    );
    expect(
      tokenVigente({ usadoAt: ahora, expiraAt: new Date("2026-10-06T12:00:00Z") }, ahora),
    ).toBe(false);
    expect(tokenVigente({ usadoAt: null, expiraAt: new Date("2026-10-05T11:00:00Z") }, ahora)).toBe(
      false,
    );
    expect(tokenVigente(null, ahora)).toBe(false);
  });
});

describe("almacenamiento: nombres seguros", () => {
  it("elimina rutas y caracteres peligrosos", () => {
    expect(nombreSeguro("../../etc/passwd")).toBe("passwd");
    expect(nombreSeguro("..\\..\\win.ini")).toBe("win.ini");
    expect(nombreSeguro("plan de tesis (v2).pdf")).toBe("plan_de_tesis__v2_.pdf");
    expect(() => nombreSeguro("../")).toThrow();
  });
});

describe("renderer PDF de formatos", () => {
  it("mide el ancho sin kerning, igual que lo dibuja drawText («FACULTAD DE»)", async () => {
    const pdf = await PDFDocument.create();
    const f = await pdf.embedFont(StandardFonts.HelveticaBold);
    // widthOfTextAtSize descuenta pares como "LT"/"TA"; drawText no los aplica.
    expect(anchoTexto(f, "FACULTAD", 9)).toBeGreaterThan(f.widthOfTextAtSize("FACULTAD", 9));
    expect(anchoTexto(f, "D", 9)).toBeCloseTo(f.widthOfTextAtSize("D", 9));
  });

  it("genera un PDF válido con campos pendientes resaltados", async () => {
    const plantilla = plantillaDe("DECRETO_APROBACION");
    expect(plantilla).not.toBeNull();
    if (!plantilla) return;
    const doc = renderizarPlantilla(plantilla, { NOMBRES: "María Pérez", TESIS: "título ≥ 20 %" });
    const bytes = await renderizarPdf(doc, {
      codigo: "SET010",
      versionPlantilla: "v1",
      generadoEn: new Date("2026-10-05T12:00:00Z"),
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
    expect(doc.pendientes).toContain("DECRETO");
  });

  it("todas las plantillas renderizan sin errores de codificación", async () => {
    const tipos = new Set(CHECKLIST_COMPLETO.map((d) => d.tipo));
    expect(tipos.size).toBeGreaterThan(0);
    for (const tipo of [
      "SOLICITUD_INSCRIPCION",
      "CARATULA_PLAN",
      "ACTA_SUSTENTACION",
      "CARATULA_FINAL",
    ]) {
      const p = plantillaDe(tipo);
      if (!p) throw new Error(`Falta plantilla ${tipo}`);
      const bytes = await renderizarPdf(renderizarPlantilla(p, {}), {
        codigo: "SET001",
        versionPlantilla: "v1",
        generadoEn: new Date(),
      });
      expect(bytes.length).toBeGreaterThan(500);
    }
  });
});

describe("motor OpenXML DOCX (render-docx)", () => {
  it("omite el párrafo de Coasesor en carátula cuando no hay coasesor registrado", () => {
    const plantilla = obtenerPlantillaDocx("CARATULA_PLAN", "E1", 1);
    expect(plantilla).not.toBeNull();
    if (!plantilla) return;
    const res = procesarDocxBuffer(plantilla, {
      TESIS: "Mi Tesis de Prueba",
      ASESOR: "Dr. Juan Pérez",
    });
    const zip = new PizZip(res.buffer);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toContain("Coasesor:");
  });

  it("conserva el párrafo de Coasesor en carátula cuando sí está registrado y en línea separada", () => {
    const plantilla = obtenerPlantillaDocx("CARATULA_PLAN", "E1", 1);
    expect(plantilla).not.toBeNull();
    if (!plantilla) return;
    const res = procesarDocxBuffer(plantilla, {
      TESIS: "Mi Tesis de Prueba",
      ASESOR: "Dr. Juan Pérez",
      COASESOR: "Dr. Carlos Coasesor",
    });
    const zip = new PizZip(res.buffer);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(xml).toContain("Coasesor:");
    expect(xml).toContain("Dr. Carlos Coasesor");
    // Verificar que Coasesor: y el nombre están en párrafos separados (de la misma forma que Asesor)
    const separado = /Coasesor:\s*<\/w:t>.*?<\/w:p>\s*<w:p\b[^>]*>.*?Dr\. Carlos Coasesor/s.test(xml);
    expect(separado).toBe(true);
  });

  it("inserta salto de línea en carátula para 2 tesistas", () => {
    const plantilla = obtenerPlantillaDocx("CARATULA_PLAN", "E1", 2);
    expect(plantilla).not.toBeNull();
    if (!plantilla) return;
    const res = procesarDocxBuffer(plantilla, {
      NOM_MIN: "María Pérez\nCarlos Gómez",
    });
    const zip = new PizZip(res.buffer);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(xml).toContain("María Pérez</w:t><w:br/><w:t xml:space=\"preserve\">Carlos Gómez");
  });
});

