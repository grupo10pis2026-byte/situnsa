import {
  DOCUMENTOS_2_TESISTAS_ETAPA_01,
  DOCUMENTOS_2_TESISTAS_ETAPA_02,
  DOCUMENTOS_INDIVIDUALES_2_TESISTAS,
  TOTAL_DOCUMENTOS_2_TESISTAS,
  verificarCompletitud2Tesistas,
} from "@pis/contracts";
import { resolverNombreArchivoDescarga } from "@pis/domain";
import { describe, expect, it } from "vitest";
import { obtenerPlantillaDocx, procesarDocxBuffer } from "./render-docx.js";

describe("Verificación de Formatos para 2 Tesistas (Agente 2)", () => {
  it("cumple el conteo canónico de contratos (6 en E1, 17 tipos en E2 y 4 individuales)", () => {
    expect(DOCUMENTOS_2_TESISTAS_ETAPA_01).toHaveLength(6);
    expect(DOCUMENTOS_2_TESISTAS_ETAPA_02).toHaveLength(17);
    expect(DOCUMENTOS_INDIVIDUALES_2_TESISTAS).toHaveLength(4);
    expect(TOTAL_DOCUMENTOS_2_TESISTAS.ETAPA_01).toBe(6);
    expect(TOTAL_DOCUMENTOS_2_TESISTAS.ETAPA_02_TIPOS).toBe(17);
    expect(TOTAL_DOCUMENTOS_2_TESISTAS.ETAPA_02_ARCHIVOS).toBe(19);
    expect(TOTAL_DOCUMENTOS_2_TESISTAS.TOTAL_ARCHIVOS).toBe(25);
  });

  it("resuelve físicamente todas las 6 plantillas de Etapa 01 para 2 tesistas", () => {
    for (const tipo of DOCUMENTOS_2_TESISTAS_ETAPA_01) {
      const buffer = obtenerPlantillaDocx(tipo, "E1", 2);
      expect(buffer, `Plantilla ${tipo} en Etapa 01 debe existir físicamente`).not.toBeNull();
      if (!buffer) throw new Error(`Plantilla ${tipo} en E1 no encontrada`);
      expect(buffer.length).toBeGreaterThan(500);

      const res = procesarDocxBuffer(buffer, {
        NOMBRES_1: "JUAN PEREZ",
        NOMBRES_2: "MARIA LOPEZ",
        NOMBRES: "JUAN PEREZ",
        NOMBRES02: "MARIA LOPEZ",
        DNI_1: "12345678",
        DNI_2: "87654321",
        DNI: "12345678",
        DNI02: "87654321",
        PROGRAMAS: "INGENIERIA DE SISTEMAS",
        TESIS: "SISTEMA DISTRIBUIDO DE TITULACION",
      });
      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(500);
    }
  });

  it("resuelve físicamente los 15 tipos globales y las plantillas saneadas de Etapa 02 para 2 tesistas", () => {
    const tiposGlobales = DOCUMENTOS_2_TESISTAS_ETAPA_02.filter(
      (t) => t !== "ANEXO_01_DJ" && t !== "ANEXO_02_DJ",
    );

    for (const tipo of tiposGlobales) {
      const buffer = obtenerPlantillaDocx(tipo, "E2", 2);
      expect(buffer, `Plantilla ${tipo} en Etapa 02 debe existir físicamente`).not.toBeNull();
      if (!buffer) throw new Error(`Plantilla ${tipo} en E2 no encontrada`);
      expect(buffer.length).toBeGreaterThan(500);

      const res = procesarDocxBuffer(buffer, {
        NOMBRES_1: "JUAN PEREZ",
        NOMBRES_2: "MARIA LOPEZ",
        NOMBRES: "JUAN PEREZ",
        NOMBRES02: "MARIA LOPEZ",
        DNI_1: "12345678",
        DNI_2: "87654321",
        DNI: "12345678",
        DNI02: "87654321",
        PROGRAMAS: "INGENIERIA DE SISTEMAS",
        TESIS: "SISTEMA DISTRIBUIDO DE TITULACION",
      });
      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(500);
    }
  });

  it("resuelve físicamente y genera los 4 documentos individuales por participante en Etapa 02", () => {
    for (const tipo of DOCUMENTOS_INDIVIDUALES_2_TESISTAS) {
      const buffer = obtenerPlantillaDocx(tipo, "E2", 2);
      expect(buffer, `Plantilla individual ${tipo} debe existir físicamente`).not.toBeNull();
      if (!buffer) throw new Error(`Plantilla ${tipo} no encontrada`);
      expect(buffer.length).toBeGreaterThan(500);

      const res = procesarDocxBuffer(buffer, {
        NOMBRES: "JUAN PEREZ",
        NOMBRES02: "MARIA LOPEZ",
        DNI: "12345678",
        DNI02: "87654321",
        CUI: "20201111",
        CUI02: "20202222",
        CORREO: "jperez@unsa.edu.pe",
        CORREO02: "mlopez@unsa.edu.pe",
        PROGRAMAS: "INGENIERIA DE SISTEMAS",
        TESIS: "SISTEMA DISTRIBUIDO DE TITULACION",
      });
      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.length).toBeGreaterThan(500);
    }
  });

  it("helper verificarCompletitud2Tesistas evalúa completitud lógica y de participantes", () => {
    // E1 completo
    const resE1 = verificarCompletitud2Tesistas("E1", [...DOCUMENTOS_2_TESISTAS_ETAPA_01]);
    expect(resE1.completo).toBe(true);
    expect(resE1.totalTiposEsperado).toBe(6);
    expect(resE1.faltantes).toHaveLength(0);

    // E1 incompleto
    const incompletoE1 = verificarCompletitud2Tesistas("E1", ["ANEXO_17", "CARATULA_PLAN"]);
    expect(incompletoE1.completo).toBe(false);
    expect(incompletoE1.faltantes).toHaveLength(4);

    // E2 completo con claves de tipos lógicos
    const resE2Logico = verificarCompletitud2Tesistas("E2", [...DOCUMENTOS_2_TESISTAS_ETAPA_02]);
    expect(resE2Logico.completo).toBe(true);
    expect(resE2Logico.totalTiposEsperado).toBe(17);
    expect(resE2Logico.faltantes).toHaveLength(0);

    // E2 completo con claves individuales desglosadas por participante
    const tiposGlobales = DOCUMENTOS_2_TESISTAS_ETAPA_02.filter(
      (t) => t !== "ANEXO_01_DJ" && t !== "ANEXO_02_DJ",
    );
    const conjuntoConParticipantes = [...tiposGlobales, ...DOCUMENTOS_INDIVIDUALES_2_TESISTAS];
    const resE2Part = verificarCompletitud2Tesistas("E2", conjuntoConParticipantes);
    expect(resE2Part.completo).toBe(true);
    expect(resE2Part.faltantes).toHaveLength(0);

    // E2 incompleto si falta el participante 2 en Anexo 01
    const conjuntoSinP2 = [...tiposGlobales, "ANEXO_01_DJ_P1", "ANEXO_02_DJ_P1", "ANEXO_02_DJ_P2"];
    const resE2SinP2 = verificarCompletitud2Tesistas("E2", conjuntoSinP2);
    expect(resE2SinP2.completo).toBe(false);
    expect(resE2SinP2.faltantes).toContain("ANEXO_01_DJ");
  });

  it("resuelve la nomenclatura oficial de descarga para documentos de 2 tesistas", () => {
    const cod = "SET042";
    expect(resolverNombreArchivoDescarga(cod, "ANEXO_01_DJ_P1", "docx")).toBe(
      "SET042 - Participante 01 - Anexo 01 - Declaración jurada.docx",
    );
    expect(resolverNombreArchivoDescarga(cod, "ANEXO_01_DJ_P2", "docx")).toBe(
      "SET042 - Participante 02 - Anexo 01 - Declaración jurada.docx",
    );
    expect(resolverNombreArchivoDescarga(cod, "ANEXO_02_DJ_P1", "docx")).toBe(
      "SET042 - Participante 01 - Anexo 02 - Declaración jurada no antecedentes.docx",
    );
    expect(resolverNombreArchivoDescarga(cod, "ANEXO_02_DJ_P2", "docx")).toBe(
      "SET042 - Participante 02 - Anexo 02 - Declaración jurada no antecedentes.docx",
    );
    expect(resolverNombreArchivoDescarga(cod, "ANEXO_32_VERACIDAD", "docx")).toBe(
      "SET042 - Anexo N° 32 — DJ veracidad de la información.docx",
    );
  });
});
