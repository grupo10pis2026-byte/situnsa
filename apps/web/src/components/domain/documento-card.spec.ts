import {
  DOCUMENTOS_1_TESISTA_ETAPA_01,
  DOCUMENTOS_1_TESISTA_ETAPA_02,
  DOCUMENTOS_2_TESISTAS_ETAPA_01,
  DOCUMENTOS_2_TESISTAS_ETAPA_02,
  DOCUMENTOS_INDIVIDUALES_2_TESISTAS,
} from "@pis/contracts";
import { describe, expect, it } from "vitest";
import {
  NOMBRES_LISTADO_OFICIAL,
  obtenerCamposPendientesUnificados,
  requiereFirma,
} from "./documento-card.js";

describe("DocumentoCard: Nombres normativos oficiales y consistencia de tipos", () => {
  it("contiene títulos amigables y normativos para todos los tipos de Etapa 01 (1 y 2 tesistas)", () => {
    for (const tipo of DOCUMENTOS_1_TESISTA_ETAPA_01) {
      expect(NOMBRES_LISTADO_OFICIAL[tipo]).toBeDefined();
      expect(NOMBRES_LISTADO_OFICIAL[tipo].length).toBeGreaterThan(3);
    }
    for (const tipo of DOCUMENTOS_2_TESISTAS_ETAPA_01) {
      expect(NOMBRES_LISTADO_OFICIAL[tipo]).toBeDefined();
      expect(NOMBRES_LISTADO_OFICIAL[tipo].length).toBeGreaterThan(3);
    }
  });

  it("contiene títulos oficiales para todos los tipos de Etapa 02 (1 y 2 tesistas)", () => {
    for (const tipo of DOCUMENTOS_1_TESISTA_ETAPA_02) {
      expect(NOMBRES_LISTADO_OFICIAL[tipo]).toBeDefined();
      expect(NOMBRES_LISTADO_OFICIAL[tipo].length).toBeGreaterThan(3);
    }
    for (const tipo of DOCUMENTOS_2_TESISTAS_ETAPA_02) {
      expect(NOMBRES_LISTADO_OFICIAL[tipo]).toBeDefined();
      expect(NOMBRES_LISTADO_OFICIAL[tipo].length).toBeGreaterThan(3);
    }
  });

  it("distingue claramente entre Participante 01 y Participante 02 en los anexos individuales de 2 tesistas", () => {
    for (const subdoc of DOCUMENTOS_INDIVIDUALES_2_TESISTAS) {
      expect(NOMBRES_LISTADO_OFICIAL[subdoc]).toBeDefined();
      if (subdoc.endsWith("_P1")) {
        expect(NOMBRES_LISTADO_OFICIAL[subdoc]).toContain("Participante 01");
      } else if (subdoc.endsWith("_P2")) {
        expect(NOMBRES_LISTADO_OFICIAL[subdoc]).toContain("Participante 02");
      }
    }
  });
});

describe("DocumentoCard: Banner universal de campos pendientes", () => {
  it("unifica campos pendientes de plantilla y de faltantes sin duplicados", () => {
    const pendientesPlantilla = ["PRESIDENTE", "SECRETARIO"];
    const faltantesDoc = [
      "Campo pendiente en el formato: PRESIDENTE",
      "Campo pendiente: VOCAL",
      "Falta adjuntar el archivo",
    ];

    const resultado = obtenerCamposPendientesUnificados(pendientesPlantilla, faltantesDoc);
    expect(resultado).toContain("PRESIDENTE");
    expect(resultado).toContain("SECRETARIO");
    expect(resultado).toContain("VOCAL");
    expect(resultado).not.toContain("Falta adjuntar el archivo");
    expect(resultado).toHaveLength(3);
  });

  it("devuelve arreglo vacío cuando el documento está completo sin campos pendientes", () => {
    expect(obtenerCamposPendientesUnificados([], [])).toEqual([]);
    expect(obtenerCamposPendientesUnificados(undefined, [])).toEqual([]);
    expect(obtenerCamposPendientesUnificados([], ["Falta adjuntar el archivo"])).toEqual([]);
  });
});

describe("DocumentoCard: Detección de documentos que requieren firma", () => {
  it("identifica declaraciones juradas, actas y solicitudes como documentos con firma requerida", () => {
    const tiposConFirma = [
      "SOLICITUD_INSCRIPCION",
      "ANEXO_17",
      "ACEPTACION_ASESORIA",
      "DJ_CONFIDENCIALIDAD",
      "ANEXO_27",
      "ANEXO_01_DJ",
      "ANEXO_01_DJ_P1",
      "ANEXO_01_DJ_P2",
      "ANEXO_02_DJ",
      "ANEXO_02_DJ_P1",
      "ANEXO_02_DJ_P2",
      "ANEXO_32_VERACIDAD",
      "ACTA_CONFORMIDAD",
      "ACTA_DICTAMEN",
      "ACTA_SUSTENTACION",
    ];

    for (const tipo of tiposConFirma) {
      expect(requiereFirma(tipo), `${tipo} debe requerir firma`).toBe(true);
    }
  });

  it("identifica documentos puramente informativos o de entrega como sin firma previa", () => {
    const tiposSinFirma = ["PLAN_ESTRUCTURADO", "CARATULA_PLAN", "ETIQUETAS"];
    for (const tipo of tiposSinFirma) {
      expect(requiereFirma(tipo), `${tipo} no debe requerir firma`).toBe(false);
    }
  });
});
