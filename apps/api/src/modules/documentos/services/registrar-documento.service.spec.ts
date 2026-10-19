import { describe, expect, it } from "vitest";
import { RegistrarDocumentoService } from "./registrar-documento.service.js";

describe("RegistrarDocumentoService", () => {
  const service = new RegistrarDocumentoService();

  it("rechaza archivos menores a 5 bytes", async () => {
    const res = await service.procesar({
      expedienteId: "00000000-0000-0000-0000-000000000000",
      tipo: "PLAN_TESIS",
      filenameOriginal: "test.pdf",
      bytes: new Uint8Array([1, 2, 3]),
      origen: "WEB",
      actor: { id: "1", dni: "00000001" },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("demasiado pequeño");
    }
  });

  it("rechaza archivos con cabecera no-PDF", async () => {
    const res = await service.procesar({
      expedienteId: "00000000-0000-0000-0000-000000000000",
      tipo: "PLAN_TESIS",
      filenameOriginal: "test.pdf",
      bytes: new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), // GIF89a
      origen: "WEB",
      actor: { id: "1", dni: "00000001" },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("no es un PDF válido");
    }
  });
});
