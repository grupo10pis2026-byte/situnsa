import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import {
  analizarPlantillaDocx,
  etiquetasEnXml,
  unirEtiquetasFragmentadas,
} from "./analizar-plantilla.js";
import { obtenerPlantillaDocx, procesarDocxBuffer } from "./render-docx.js";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function docx(cuerpo: string): Buffer {
  const zip = new PizZip();
  zip.file("word/document.xml", `<w:document ${W}><w:body>${cuerpo}</w:body></w:document>`);
  return zip.generate({ type: "nodebuffer" });
}

/** Párrafo como lo deja Word tras una corrección ortográfica: la etiqueta en 3 runs. */
const FRAGMENTADO =
  '<w:p><w:r><w:t xml:space="preserve">DECRETO Nº </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>&lt;&lt;DECR</w:t></w:r><w:proofErr w:type="spellStart"/><w:r><w:t>ETO&gt;</w:t></w:r><w:r><w:t>&gt;-2027-USE-FIPS</w:t></w:r></w:p>';

describe("analizar plantilla DOCX", () => {
  it("une una etiqueta partida en varios runs conservando el primero", () => {
    const r = unirEtiquetasFragmentadas(FRAGMENTADO);
    expect(r.reparadas).toBe(1);
    expect(r.xml).toContain(
      '<w:b/></w:rPr><w:t xml:space="preserve">&lt;&lt;DECRETO&gt;&gt;</w:t>',
    );
    expect(r.xml).toContain("-2027-USE-FIPS</w:t>");
    expect(etiquetasEnXml(r.xml)).toEqual(["DECRETO"]);
  });

  it("no toca párrafos con etiquetas completas", () => {
    const xml = "<w:p><w:r><w:t>&lt;&lt;TESIS&gt;&gt;</w:t></w:r><w:r><w:t>x</w:t></w:r></w:p>";
    expect(unirEtiquetasFragmentadas(xml)).toEqual({ xml, reparadas: 0 });
  });

  it("deja la plantilla lista para el motor de render", () => {
    const a = analizarPlantillaDocx(docx(FRAGMENTADO));
    expect(a?.reparadas).toBe(1);
    expect(a?.etiquetas).toEqual(["DECRETO"]);
    const salida = procesarDocxBuffer(a?.buffer ?? Buffer.alloc(0), { DECRETO: "0012" });
    expect(salida.pendientes).toEqual([]);
    const texto = new PizZip(salida.buffer).file("word/document.xml")?.asText() ?? "";
    expect(texto).toContain("0012");
  });

  it("normaliza claves en minúsculas y con espacios", () => {
    expect(
      etiquetasEnXml("<w:t>&lt;&lt; fecha_circular &gt;&gt; &lt;&lt;FECHA DE  DECRETO>></w:t>"),
    ).toEqual(["FECHA_CIRCULAR", "FECHA DE DECRETO"]);
  });

  it("rechaza archivos que no son DOCX", () => {
    expect(analizarPlantillaDocx(new TextEncoder().encode("hola"))).toBeNull();
  });

  it("lee las etiquetas de una plantilla base real", () => {
    const base = obtenerPlantillaDocx("DECRETO_APROBACION", "E1", 1);
    const a = base ? analizarPlantillaDocx(base) : null;
    expect(a?.etiquetas).toContain("DECRETO");
    expect(a?.etiquetas).toContain("TESIS");
  });
});
