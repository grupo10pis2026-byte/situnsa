import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { analizarPlantillaDocx } from "./analizar-plantilla.js";
import { reemplazarEnXml, reemplazarTextoDocx } from "./reemplazar-texto.js";
import { obtenerPlantillaDocx } from "./render-docx.js";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function docx(cuerpo: string, encabezado?: string): Buffer {
  const zip = new PizZip();
  zip.file("word/document.xml", `<w:document ${W}><w:body>${cuerpo}</w:body></w:document>`);
  if (encabezado) zip.file("word/header1.xml", `<w:hdr ${W}>${encabezado}</w:hdr>`);
  return zip.generate({ type: "nodebuffer" });
}

function texto(bytes: Buffer, ruta = "word/document.xml"): string {
  return new PizZip(bytes).file(ruta)?.asText() ?? "";
}

/** "DECRETO Nº <<DECRETO>>-2026-USE-FIPS" con el año partido en dos runs (negrita en el primero). */
const DECRETO =
  '<w:p><w:r><w:t xml:space="preserve">DECRETO Nº &lt;&lt;DECRETO&gt;&gt;-20</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>26-USE-FIPS</w:t></w:r></w:p>';

describe("reemplazar texto en DOCX", () => {
  it("reemplaza texto partido en varios runs y lo deja en el primero", () => {
    const r = reemplazarEnXml(DECRETO, "2026", "<<ANIO>>");
    expect(r.total).toBe(1);
    expect(r.xml).toContain(
      '<w:t xml:space="preserve">DECRETO Nº &lt;&lt;DECRETO&gt;&gt;-&lt;&lt;ANIO&gt;&gt;</w:t>',
    );
    expect(r.xml).toContain('<w:i/></w:rPr><w:t xml:space="preserve">-USE-FIPS</w:t>');
    expect(r.muestras[0]).toEqual({
      antes: "DECRETO Nº <<DECRETO>>-",
      texto: "2026",
      despues: "-USE-FIPS",
    });
  });

  it("reemplaza todas las coincidencias sin cruzar de párrafo", () => {
    const xml =
      "<w:p><w:r><w:t>año 2026 y 2026</w:t></w:r></w:p><w:p><w:r><w:t>20</w:t></w:r></w:p><w:p><w:r><w:t>26</w:t></w:r></w:p>";
    const r = reemplazarEnXml(xml, "2026", "2027");
    expect(r.total).toBe(2);
    expect(r.xml).toContain("año 2027 y 2027");
    expect(r.xml).toContain("<w:t>20</w:t>");
  });

  it("trata los cuadros de texto anidados como párrafos propios", () => {
    const xml =
      "<w:p><w:r><w:t>AB</w:t></w:r><w:r><w:txbxContent><w:p><w:r><w:t>CD</w:t></w:r></w:p></w:txbxContent></w:r><w:r><w:t>EF</w:t></w:r></w:p>";
    expect(reemplazarEnXml(xml, "BC", "x").total).toBe(0);
    expect(reemplazarEnXml(xml, "CD", "x").xml).toContain('<w:t xml:space="preserve">x</w:t>');
    expect(reemplazarEnXml(xml, "ABEF", "x").total).toBe(1);
  });

  it("ignora párrafos vacíos autocerrados y no toca nodos sin cambios", () => {
    const xml =
      "<w:p/><w:p><w:r><w:t>&quot;hola&quot;</w:t></w:r><w:r><w:t>mundo</w:t></w:r></w:p>";
    const r = reemplazarEnXml(xml, "mundo", "& <todos>");
    expect(r.total).toBe(1);
    expect(r.xml).toContain("<w:t>&quot;hola&quot;</w:t>");
    expect(r.xml).toContain('<w:t xml:space="preserve">&amp; &lt;todos&gt;</w:t>');
  });

  it("procesa encabezados e informa la parte de cada coincidencia", () => {
    const bytes = docx(
      "<w:p><w:r><w:t>Arequipa, 2026</w:t></w:r></w:p>",
      "<w:p><w:r><w:t>Año 2026</w:t></w:r></w:p>",
    );
    const r = reemplazarTextoDocx(bytes, "2026", "2027");
    expect(r?.total).toBe(2);
    expect(r?.muestras.map((m) => m.parte).sort()).toEqual(["CUERPO", "ENCABEZADO"]);
    expect(texto(r?.buffer ?? Buffer.alloc(0), "word/header1.xml")).toContain("Año 2027");
  });

  it("devuelve null si no es un DOCX y el original si no hay coincidencias", () => {
    expect(reemplazarTextoDocx(new TextEncoder().encode("no es zip"), "a", "b")).toBeNull();
    const bytes = docx("<w:p><w:r><w:t>hola</w:t></w:r></w:p>");
    const r = reemplazarTextoDocx(bytes, "chau", "x");
    expect(r?.total).toBe(0);
    expect(r?.buffer.equals(bytes)).toBe(true);
  });

  it("parametriza el año fijo del decreto real como etiqueta", () => {
    const base = obtenerPlantillaDocx("DECRETO_APROBACION", "E1", 1);
    expect(base).not.toBeNull();
    const r = reemplazarTextoDocx(base ?? Buffer.alloc(0), "-2026-USE-FIPS", "-<<ANIO>>-USE-FIPS");
    expect(r?.total).toBeGreaterThan(0);
    expect(analizarPlantillaDocx(r?.buffer ?? Buffer.alloc(0))?.etiquetas).toContain("ANIO");
  });
});
