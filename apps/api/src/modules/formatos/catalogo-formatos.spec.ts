import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rutaPlantillaBase } from "../../infra/docx/render-docx.js";
import {
  type AjusteCatalogo,
  aplicarAjustes,
  archivoDeNombre,
  buscarFormato,
  CATALOGO_FORMATOS,
  etapaEnExpediente,
  nombreAgregado,
  tipoFormatoCanonico,
  tipoParaNombre,
} from "./catalogo-formatos.js";

describe("catálogo de formatos gestionables", () => {
  it("cubre 23 formatos de 1 tesista y 25 archivos de 2 tesistas", () => {
    expect(CATALOGO_FORMATOS.filter((f) => f.variante === 1)).toHaveLength(23);
    expect(CATALOGO_FORMATOS.filter((f) => f.variante === 2)).toHaveLength(25);
  });

  it("cada formato tiene su plantilla base en disco y un nombre legible", () => {
    for (const f of CATALOGO_FORMATOS) {
      expect(f.etapaBase).toBe(f.etapa);
      expect(f.agregado).toBe(false);
      const ruta = rutaPlantillaBase(f.tipo, f.etapaBase ?? f.etapa, f.variante);
      expect(ruta && existsSync(ruta), `${f.variante}/${f.tipo}`).toBe(true);
      expect(f.nombre.length).toBeGreaterThan(3);
    }
  });

  it("resuelve alias y anexos por participante al formato que se edita", () => {
    expect(tipoFormatoCanonico("SOLICITUD_INSCRIPCION", 1)).toBe("ANEXO_17");
    expect(tipoFormatoCanonico("ANEXO_01_DJ_P2", 1)).toBe("ANEXO_01_DJ");
    expect(tipoFormatoCanonico("ANEXO_01_DJ", 2)).toBe("ANEXO_01_DJ_P1");
    expect(tipoFormatoCanonico("ANEXO_02_DJ_P2", 2)).toBe("ANEXO_02_DJ_P2");
    expect(buscarFormato("ANEXO_02_DJ_P2", 2)).not.toBeNull();
    expect(buscarFormato("ANEXO_02_DJ_P2", 1)).toBeNull();
  });

  it("todo tipo canónico de una plantilla del motor está en el catálogo", () => {
    for (const f of CATALOGO_FORMATOS) {
      expect(buscarFormato(tipoFormatoCanonico(f.tipo, f.variante), f.variante)).not.toBeNull();
    }
  });
});

const ajuste = (a: Partial<AjusteCatalogo> & Pick<AjusteCatalogo, "tipo">): AjusteCatalogo => ({
  variante: 1,
  etapa: "E1",
  nombre: null,
  agregado: false,
  archivado: false,
  ...a,
});

describe("catálogo vigente (ajustes del área por etapa)", () => {
  it("mueve un formato del sistema solo en su variante y conserva la etapa base", () => {
    const vigente = aplicarAjustes(CATALOGO_FORMATOS, [
      ajuste({ tipo: "ANEXO_27", variante: 2, etapa: "E1" }),
    ]);
    const en2 = vigente.find((f) => f.tipo === "ANEXO_27" && f.variante === 2);
    const en1 = vigente.find((f) => f.tipo === "ANEXO_27" && f.variante === 1);
    expect(en2?.etapa).toBe("E1");
    expect(en2?.etapaBase).toBe("E2");
    expect(en1?.etapa).toBe("E2");
    expect(vigente).toHaveLength(CATALOGO_FORMATOS.length);
  });

  it("agrega formatos nuevos a su etapa y oculta los archivados", () => {
    const ajustes = [
      ajuste({ tipo: "AREA_CONSTANCIA", nombre: "Constancia", agregado: true, etapa: "E2" }),
      ajuste({ tipo: "AREA_VIEJO", nombre: "Viejo", agregado: true, archivado: true }),
    ];
    const vigente = aplicarAjustes(CATALOGO_FORMATOS, ajustes);
    const nuevo = vigente.find((f) => f.tipo === "AREA_CONSTANCIA");
    expect(nuevo).toMatchObject({
      variante: 1,
      etapa: "E2",
      etapaBase: null,
      agregado: true,
      nombre: "Constancia",
      archivoBase: "Constancia.docx",
    });
    expect(vigente.some((f) => f.tipo === "AREA_VIEJO")).toBe(false);
    const conArchivados = aplicarAjustes(CATALOGO_FORMATOS, ajustes, { incluirArchivados: true });
    expect(nombreAgregado(conArchivados, "AREA_VIEJO", 1)).toBe("Viejo");
  });

  it("oculta un formato del sistema eliminado (solo en su variante) y lo lista como archivado", () => {
    const ajustes = [ajuste({ tipo: "ACTA_DICTAMEN", variante: 2, etapa: "E2", archivado: true })];
    const vigente = aplicarAjustes(CATALOGO_FORMATOS, ajustes);
    expect(vigente.some((f) => f.tipo === "ACTA_DICTAMEN" && f.variante === 2)).toBe(false);
    expect(vigente.some((f) => f.tipo === "ACTA_DICTAMEN" && f.variante === 1)).toBe(true);
    const todos = aplicarAjustes(CATALOGO_FORMATOS, ajustes, { incluirArchivados: true });
    expect(todos.find((f) => f.tipo === "ACTA_DICTAMEN" && f.variante === 2)?.archivado).toBe(true);
  });

  it("ignora ajustes con etapa o variante inválidas", () => {
    const vigente = aplicarAjustes(CATALOGO_FORMATOS, [
      ajuste({ tipo: "ANEXO_27", etapa: "E9" }),
      ajuste({ tipo: "AREA_X", agregado: true, variante: 3 }),
    ]);
    expect(vigente.find((f) => f.tipo === "ANEXO_27" && f.variante === 1)?.etapa).toBe("E2");
    expect(vigente.some((f) => f.tipo === "AREA_X")).toBe(false);
  });

  it("deriva un tipo estable y único del nombre", () => {
    expect(tipoParaNombre("Constancia de egresado", new Set())).toBe("AREA_CONSTANCIA_DE_EGRESADO");
    expect(tipoParaNombre("Acta n° 5 — revisión", new Set())).toBe("AREA_ACTA_N_5_REVISION");
    expect(tipoParaNombre("Constancia", new Set(["AREA_CONSTANCIA"]))).toBe("AREA_CONSTANCIA_2");
    expect(tipoParaNombre("***", new Set())).toBe("AREA_FORMATO");
    expect(tipoParaNombre("x".repeat(200), new Set())).toMatch(/^[A-Z][A-Z0-9_]{1,63}$/);
  });

  it("limpia caracteres de ruta del nombre de archivo", () => {
    expect(archivoDeNombre('Oficio "A/B"')).toBe("Oficio A B.docx");
  });

  it("ubica cada documento del expediente en la etapa vigente del formato", () => {
    const vigente = aplicarAjustes(CATALOGO_FORMATOS, [
      ajuste({ tipo: "ANEXO_17", etapa: "E2" }),
      ajuste({ tipo: "ANEXO_01_DJ_P2", variante: 2, etapa: "E1" }),
    ]);
    // Alias del motor: SOLICITUD_INSCRIPCION se edita como ANEXO_17.
    expect(etapaEnExpediente(vigente, "SOLICITUD_INSCRIPCION", 1)).toBe("E2");
    expect(etapaEnExpediente(vigente, "ANEXO_01_DJ_P2", 2)).toBe("E1");
    expect(etapaEnExpediente(vigente, "ANEXO_01_DJ_P1", 2, { soloAjustes: true })).toBeNull();
    expect(etapaEnExpediente(vigente, "ACTA_DICTAMEN", 1)).toBe("E2");
    expect(etapaEnExpediente(vigente, "ACTA_DICTAMEN", 1, { soloAjustes: true })).toBeNull();
    expect(etapaEnExpediente(vigente, "PLAN_ESTRUCTURADO", 1)).toBeNull();
  });
});
