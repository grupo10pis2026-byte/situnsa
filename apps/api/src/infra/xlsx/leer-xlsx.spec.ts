import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { escribirXlsx } from "./escribir-xlsx.js";
import { indiceColumna, leerXlsx, serialAFechaIso } from "./leer-xlsx.js";

/** Libro como lo guarda Excel: sharedStrings, estilos de fecha y de ceros, hoja con huecos. */
function libroExcel(): Uint8Array {
  const zip = new PizZip();
  zip.file(
    "xl/workbook.xml",
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="OFICIOS" sheetId="1" r:id="rId1"/><sheet name="DECRETOS" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<sst><si><t>N°</t></si><si><t>ASUNTO</t></si><si><r><t>Designación </t></r><r><t>de terna &amp; otros</t></r></si><si><t>FECHA DEL DOC.</t></si></sst>`,
  );
  zip.file(
    "xl/styles.xml",
    `<styleSheet><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="0000"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>3</v></c></row><row r="3"><c r="A3" s="2"><v>7</v></c><c r="B3" t="s"><v>2</v></c><c r="D3" s="1"><v>46083</v></c></row></sheetData></worksheet>`,
  );
  zip.file(
    "xl/worksheets/sheet2.xml",
    `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nro.CC</t></is></c><c r="B1" t="str"><v>FECHA</v></c></row><row r="2"><c r="A2"><v>12</v></c><c r="B2" s="3"><v>46113</v></c></row></sheetData></worksheet>`,
  );
  return zip.generate({ type: "uint8array" });
}

describe("leerXlsx", () => {
  it("convierte referencias de columna", () => {
    expect(indiceColumna("A1")).toBe(0);
    expect(indiceColumna("Z9")).toBe(25);
    expect(indiceColumna("AB12")).toBe(27);
  });

  it("convierte seriales de fecha de Excel", () => {
    expect(serialAFechaIso(46083)).toBe("2026-03-02");
    expect(serialAFechaIso(1, true)).toBe("1904-01-02");
  });

  it("lee hojas, textos compartidos, fechas, ceros y huecos", () => {
    const hojas = leerXlsx(libroExcel());
    expect(hojas?.map((h) => h.nombre)).toEqual(["OFICIOS", "DECRETOS"]);
    const oficios = hojas?.[0]?.filas ?? [];
    expect(oficios[0]).toEqual(["N°", "ASUNTO", "", "FECHA DEL DOC."]);
    expect(oficios[1]).toEqual([]);
    expect(oficios[2]).toEqual(["0007", "Designación de terna & otros", "", "2026-03-02"]);
    expect(hojas?.[1]?.filas).toEqual([
      ["Nro.CC", "FECHA"],
      ["12", "2026-04-01"],
    ]);
  });

  it("lee el XLSX que produce el propio sistema", () => {
    const bytes = escribirXlsx({
      nombre: "DECRETOS",
      encabezados: ["Nro.CC", "NOMBRE ALUMNO"],
      filas: [[15, "Ana Ruiz"]],
    });
    const hoja = leerXlsx(bytes)?.[0];
    expect(hoja?.nombre).toBe("DECRETOS");
    expect(hoja?.filas.find((f) => f[0] === "15")).toEqual(["15", "Ana Ruiz"]);
  });

  it("rechaza archivos que no son XLSX", () => {
    expect(leerXlsx(new TextEncoder().encode("no es un zip"))).toBeNull();
    const zip = new PizZip();
    zip.file("word/document.xml", "<w:document/>");
    expect(leerXlsx(zip.generate({ type: "uint8array" }))).toBeNull();
  });
});
