import { describe, expect, it } from "vitest";
import {
  ARCHIVOS_FISICOS_1_TESISTA_E1,
  ARCHIVOS_FISICOS_1_TESISTA_E2,
  ARCHIVOS_FISICOS_2_TESISTAS_E1,
  DOCUMENTOS_1_TESISTA_ETAPA_01,
  DOCUMENTOS_1_TESISTA_ETAPA_02,
  DOCUMENTOS_2_TESISTAS_ETAPA_01,
  DOCUMENTOS_2_TESISTAS_ETAPA_02,
  DOCUMENTOS_INDIVIDUALES_2_TESISTAS,
  METADATA_DOCUMENTOS_2_TESISTAS_E2,
  TOTAL_DOCUMENTOS_1_TESISTA,
  TOTAL_DOCUMENTOS_2_TESISTAS,
  verificarCompletitud1Tesista,
  verificarCompletitud2Tesistas,
} from "../src/catalogo-formatos.js";

describe("Catálogo de formatos: Paridad y Conteo Simétrico E1 y E2", () => {
  it("Etapa 01 tiene exactamente 6 formatos tanto para 1 tesista como para 2 tesistas", () => {
    expect(DOCUMENTOS_1_TESISTA_ETAPA_01).toHaveLength(6);
    expect(DOCUMENTOS_2_TESISTAS_ETAPA_01).toHaveLength(6);
    expect(TOTAL_DOCUMENTOS_1_TESISTA.ETAPA_01).toBe(6);
    expect(TOTAL_DOCUMENTOS_2_TESISTAS.ETAPA_01).toBe(6);

    // Los formatos lógicos de Etapa 01 son idénticos
    expect([...DOCUMENTOS_1_TESISTA_ETAPA_01].sort()).toEqual(
      [...DOCUMENTOS_2_TESISTAS_ETAPA_01].sort(),
    );
  });

  it("Etapa 02 tiene exactamente 17 tipos documentales lógicos para 1 y 2 tesistas", () => {
    expect(DOCUMENTOS_1_TESISTA_ETAPA_02).toHaveLength(17);
    expect(DOCUMENTOS_2_TESISTAS_ETAPA_02).toHaveLength(17);
    expect(TOTAL_DOCUMENTOS_1_TESISTA.ETAPA_02).toBe(17);
    expect(TOTAL_DOCUMENTOS_2_TESISTAS.ETAPA_02).toBe(17);
  });

  it("Etapa 02 para 2 tesistas cuenta con 19 archivos físicos debido al desglose de DJ de participantes P1 y P2", () => {
    expect(DOCUMENTOS_INDIVIDUALES_2_TESISTAS).toEqual([
      "ANEXO_01_DJ_P1",
      "ANEXO_01_DJ_P2",
      "ANEXO_02_DJ_P1",
      "ANEXO_02_DJ_P2",
    ]);
    expect(TOTAL_DOCUMENTOS_2_TESISTAS.ETAPA_02_ARCHIVOS_FISICOS).toBe(19);
  });

  it("Mapea todos los tipos a nombres de archivo físico válidos con extensión .docx", () => {
    for (const [tipo, archivo] of Object.entries(ARCHIVOS_FISICOS_1_TESISTA_E1)) {
      expect(tipo).toBeTruthy();
      expect(archivo).toMatch(/\.docx$/);
    }
    for (const [tipo, archivo] of Object.entries(ARCHIVOS_FISICOS_1_TESISTA_E2)) {
      expect(tipo).toBeTruthy();
      expect(archivo).toMatch(/\.docx$/);
    }
    for (const [tipo, archivo] of Object.entries(ARCHIVOS_FISICOS_2_TESISTAS_E1)) {
      expect(tipo).toBeTruthy();
      expect(archivo).toMatch(/\.docx$/);
    }
    for (const [tipo, meta] of Object.entries(METADATA_DOCUMENTOS_2_TESISTAS_E2)) {
      expect(tipo).toBeTruthy();
      expect(meta.archivosFisicos.length).toBeGreaterThan(0);
      for (const archivo of meta.archivosFisicos) {
        expect(archivo).toMatch(/\.docx$/);
      }
    }
  });

  it("verificarCompletitud1Tesista detecta correctamente formatos faltantes y completitud", () => {
    const incompleto = verificarCompletitud1Tesista("E1", ["ANEXO_17", "CARATULA_PLAN"]);
    expect(incompleto.completo).toBe(false);
    expect(incompleto.totalEsperado).toBe(6);
    expect(incompleto.faltantes).toHaveLength(4);

    const completo = verificarCompletitud1Tesista("E1", [...DOCUMENTOS_1_TESISTA_ETAPA_01]);
    expect(completo.completo).toBe(true);
    expect(completo.faltantes).toHaveLength(0);
  });

  it("verificarCompletitud2Tesistas detecta correctamente formatos faltantes y completitud", () => {
    const incompleto = verificarCompletitud2Tesistas("E2", ["ACTA_CONFORMIDAD"]);
    expect(incompleto.completo).toBe(false);
    expect(incompleto.totalEsperado).toBe(17);
    expect(incompleto.faltantes).toHaveLength(16);

    const completo = verificarCompletitud2Tesistas("E2", [...DOCUMENTOS_2_TESISTAS_ETAPA_02]);
    expect(completo.completo).toBe(true);
    expect(completo.faltantes).toHaveLength(0);
  });
});
