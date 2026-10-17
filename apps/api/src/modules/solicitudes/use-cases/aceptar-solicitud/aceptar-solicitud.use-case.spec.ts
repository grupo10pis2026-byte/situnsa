import type { AceptarSolicitudInput } from "@pis/contracts";
import { describe, expect, it } from "vitest";
import { AceptarSolicitudUseCase } from "./aceptar-solicitud.use-case.js";

const baseInput: AceptarSolicitudInput = {
  codigoSetConfirmado: "SET001",
  tituloConfirmado: "Sistema de gestión para titulación",
  programaConfirmado: "Programa Invalido ABC",
  crearCuentasUsuarios: true,
  participantesConfig: [],
};

const actorMock = { id: "00000000-0000-0000-0000-000000000001", dni: "00000000" };

describe("AceptarSolicitudUseCase (validaciones de dominio)", () => {
  const uc = new AceptarSolicitudUseCase();

  it("rechaza si el programa confirmado no es oficial", async () => {
    const r = await uc.execute("00000000-0000-0000-0000-000000000002", baseInput, actorMock);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("VALIDACION_FALLIDA");
      expect(r.error.message).toContain("13 oficiales");
    }
  });
});
