import { describe, expect, it } from "vitest";
import {
  estadoConformidadDocumentoEnum,
  estadoSolicitudEnum,
  solicitudDocumentos,
  solicitudes,
  solicitudHistorial,
  solicitudParticipantes,
  tokensSubsanacion,
  viaIngresoEnum,
} from "../src/index.js";

describe("Esquemas de Base de Datos - Módulo de Solicitudes", () => {
  it("exporta correctamente los enums de solicitudes", () => {
    expect(estadoSolicitudEnum.enumValues).toEqual([
      "NUEVA",
      "EN_REVISION",
      "OBSERVADA",
      "ACEPTADA",
      "RECHAZADA",
    ]);
    expect(viaIngresoEnum.enumValues).toEqual(["REGULAR", "TALLER"]);
    expect(estadoConformidadDocumentoEnum.enumValues).toEqual([
      "PENDIENTE",
      "CONFORME",
      "OBSERVADO",
    ]);
  });

  it("exporta las tablas de persistencia del módulo de obtención de datos", () => {
    expect(solicitudes).toBeDefined();
    expect(solicitudParticipantes).toBeDefined();
    expect(solicitudDocumentos).toBeDefined();
    expect(solicitudHistorial).toBeDefined();
    expect(tokensSubsanacion).toBeDefined();
  });
});
