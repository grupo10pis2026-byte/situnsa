import {
  CHECKLIST_E1,
  CHECKLIST_E2,
  esDocumentoInstitucional,
  esDocumentoTesista,
} from "@pis/domain/dist/expediente/checklist-catalogo.js";
import { describe, expect, it } from "vitest";

describe("Consistencia y simetría de secciones documentales en UI (Ticket 03)", () => {
  it("clasifica correctamente los requisitos entregados por el tesista en Etapa 01", () => {
    const tiposTesistaE1 = CHECKLIST_E1.filter((c) => esDocumentoTesista(c.tipo)).map(
      (c) => c.tipo,
    );
    expect(tiposTesistaE1).toEqual([
      "SOLICITUD_INSCRIPCION",
      "ACEPTACION_ASESORIA",
      "PLAN_ESTRUCTURADO",
      "DJ_CONFIDENCIALIDAD",
      "ANEXO_18",
      "ANEXO_33",
    ]);
  });

  it("reconoce como institucionales los formatos emitidos por la facultad en Etapa 01", () => {
    const formatosInstitucionalesE1 = [
      "CARATULA_PLAN",
      "DECRETO_APROBACION",
      "OFICIO_CIRCULAR_TERNA",
      "OBSERVACIONES_PLAN",
      "ETIQUETAS",
    ];

    for (const tipo of formatosInstitucionalesE1) {
      expect(esDocumentoInstitucional(tipo), `${tipo} debe ser institucional`).toBe(true);
      expect(esDocumentoTesista(tipo), `${tipo} no debe ser de tesista`).toBe(false);
    }
  });

  it("particiona de forma simétrica y no excluyente los documentos de Etapa 02 para 1 tesista", () => {
    const docsTesistaE2 = CHECKLIST_E2.filter((c) => esDocumentoTesista(c.tipo)).map((c) => c.tipo);
    const docsInstitucionalesE2 = CHECKLIST_E2.filter((c) => esDocumentoInstitucional(c.tipo)).map(
      (c) => c.tipo,
    );

    // Suma exacta sin duplicidades
    expect(docsTesistaE2.length + docsInstitucionalesE2.length).toBe(CHECKLIST_E2.length);

    // Requisitos que el tesista entrega
    expect(docsTesistaE2).toContain("ANEXO_27");
    expect(docsTesistaE2).toContain("ANEXO_01_DJ");
    expect(docsTesistaE2).toContain("ANEXO_02_DJ");
    expect(docsTesistaE2).toContain("ANEXO_32_VERACIDAD");

    // Formatos oficiales que emite la facultad / jurado
    expect(docsInstitucionalesE2).toContain("ACTA_CONFORMIDAD");
    expect(docsInstitucionalesE2).toContain("ACTA_DICTAMEN");
    expect(docsInstitucionalesE2).toContain("ACTA_SUSTENTACION");
    expect(docsInstitucionalesE2).toContain("AUTORIZACION_IMPRESION");
    expect(docsInstitucionalesE2).toContain("AUTORIZACION_PUBLICACION");
  });

  it("reconoce desdoble de participantes en 2 tesistas como documentos entregados por tesista", () => {
    expect(esDocumentoTesista("ANEXO_01_DJ_P1")).toBe(true);
    expect(esDocumentoTesista("ANEXO_01_DJ_P2")).toBe(true);
    expect(esDocumentoTesista("ANEXO_02_DJ_P1")).toBe(true);
    expect(esDocumentoTesista("ANEXO_02_DJ_P2")).toBe(true);
  });

  it("calcula el avance total reconociendo documentos cargados y formatos institucionales sin pendientes", () => {
    const esCompletado = (doc: {
      documentoId: string | null;
      formato?: { pendientes: string[] } | null;
    }) => {
      if (doc.documentoId !== null) return true;
      if (doc.formato && doc.formato.pendientes.length === 0) return true;
      return false;
    };

    const docsTesista = [
      { tipo: "ANEXO_27", documentoId: "doc-1", formato: null },
      { tipo: "ANEXO_01_DJ", documentoId: null, formato: null },
    ];

    const docsInstitucionales = [
      { tipo: "ACTA_CONFORMIDAD", documentoId: null, formato: { pendientes: [] } },
      { tipo: "DECRETO", documentoId: null, formato: { pendientes: ["NUMERO_DECRETO"] } },
      { tipo: "OFICIO", documentoId: "doc-3", formato: null },
    ];

    const tesistaCompletados = docsTesista.filter(esCompletado).length;
    const institucionalesCompletados = docsInstitucionales.filter(esCompletado).length;
    const totalCompletados = tesistaCompletados + institucionalesCompletados;
    const totalDocumentos = docsTesista.length + docsInstitucionales.length;
    const pct = Math.round((totalCompletados / totalDocumentos) * 100);

    expect(tesistaCompletados).toBe(1);
    expect(institucionalesCompletados).toBe(2);
    expect(totalCompletados).toBe(3);
    expect(totalDocumentos).toBe(5);
    expect(pct).toBe(60);
  });
});
