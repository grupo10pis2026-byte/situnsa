import {
  DOCUMENTOS_1_TESISTA_ETAPA_01,
  DOCUMENTOS_1_TESISTA_ETAPA_02,
  TOTAL_DOCUMENTOS_1_TESISTA,
  verificarCompletitud1Tesista,
} from "@pis/contracts";
import { describe, expect, it } from "vitest";
import { obtenerPlantillaDocx, procesarDocxBuffer } from "./render-docx.js";

describe("Verificación de Formatos para 1 Tesista (Agente 1)", () => {
  it("cumple el conteo exacto de documentos (6 en Etapa 01 y 17 en Etapa 02)", () => {
    expect(DOCUMENTOS_1_TESISTA_ETAPA_01).toHaveLength(6);
    expect(DOCUMENTOS_1_TESISTA_ETAPA_02).toHaveLength(17);
    expect(TOTAL_DOCUMENTOS_1_TESISTA.ETAPA_01).toBe(6);
    expect(TOTAL_DOCUMENTOS_1_TESISTA.ETAPA_02).toBe(17);
    expect(TOTAL_DOCUMENTOS_1_TESISTA.TOTAL).toBe(23);
  });

  it("resuelve físicamente todas las 6 plantillas de Etapa 01 para 1 tesista", () => {
    for (const tipo of DOCUMENTOS_1_TESISTA_ETAPA_01) {
      const buffer = obtenerPlantillaDocx(tipo, "E1", 1);
      expect(buffer, `Plantilla ${tipo} en Etapa 01 debe existir físicamente`).not.toBeNull();
      if (!buffer) throw new Error(`Plantilla ${tipo} en E1 no encontrada`);
      expect(buffer.length).toBeGreaterThan(500);

      const res = procesarDocxBuffer(buffer, {
        NOMBRES: "JUAN PEREZ",
        DNI: "12345678",
        PROGRAMAS: "INGENIERIA DE SISTEMAS",
      });
      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(500);
    }
  });

  it("resuelve físicamente todas las 17 plantillas de Etapa 02 para 1 tesista", () => {
    for (const tipo of DOCUMENTOS_1_TESISTA_ETAPA_02) {
      const buffer = obtenerPlantillaDocx(tipo, "E2", 1);
      expect(buffer, `Plantilla ${tipo} en Etapa 02 debe existir físicamente`).not.toBeNull();
      if (!buffer) throw new Error(`Plantilla ${tipo} en E2 no encontrada`);
      expect(buffer.length).toBeGreaterThan(500);

      const res = procesarDocxBuffer(buffer, {
        NOMBRES: "JUAN PEREZ",
        DNI: "12345678",
        PROGRAMAS: "INGENIERIA DE SISTEMAS",
        TESIS: "SISTEMA DE TITULACION INTELIGENTE",
      });
      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(500);
    }
  });

  it("helper verificarCompletitud1Tesista detecta completitud y faltantes", () => {
    const resE1 = verificarCompletitud1Tesista("E1", [...DOCUMENTOS_1_TESISTA_ETAPA_01]);
    expect(resE1.completo).toBe(true);
    expect(resE1.totalEsperado).toBe(6);
    expect(resE1.faltantes).toHaveLength(0);

    const incompletoE1 = verificarCompletitud1Tesista("E1", ["ANEXO_17", "CARATULA_PLAN"]);
    expect(incompletoE1.completo).toBe(false);
    expect(incompletoE1.faltantes).toHaveLength(4);

    const resE2 = verificarCompletitud1Tesista("E2", [...DOCUMENTOS_1_TESISTA_ETAPA_02]);
    expect(resE2.completo).toBe(true);
    expect(resE2.totalEsperado).toBe(17);
    expect(resE2.faltantes).toHaveLength(0);
  });
});
