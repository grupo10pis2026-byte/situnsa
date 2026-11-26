import { describe, expect, it } from "vitest";
import { SubsanarSolicitudUseCase } from "./subsanar-solicitud.use-case.js";

const SOLICITUD = "00000000-0000-0000-0000-000000000002";
const DOC = "00000000-0000-0000-0000-000000000003";
const actor = { id: "00000000-0000-0000-0000-000000000001", dni: "76543210" };
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

describe("SubsanarSolicitudUseCase (validaciones previas a la transacción)", () => {
  const uc = new SubsanarSolicitudUseCase();

  it("exige al menos un documento corregido", async () => {
    const r = await uc.execute(SOLICITUD, actor, []);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("VALIDACION_FALLIDA");
      expect(r.error.message).toContain("al menos un documento");
    }
  });

  it("rechaza dos archivos para el mismo documento", async () => {
    const r = await uc.execute(SOLICITUD, actor, [
      { documentoId: DOC, filename: "a.pdf", bytes: pdf },
      { documentoId: DOC, filename: "b.pdf", bytes: pdf },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("solo puede reemplazarse una vez");
  });
});
