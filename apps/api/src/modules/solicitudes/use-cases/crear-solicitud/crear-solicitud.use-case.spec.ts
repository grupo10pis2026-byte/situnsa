import type { CrearSolicitudPayload } from "@pis/contracts";
import { describe, expect, it } from "vitest";
import { CrearSolicitudUseCase } from "./crear-solicitud.use-case.js";

const basePayload: CrearSolicitudPayload = {
  via: "REGULAR",
  modalidad: "TESIS",
  programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
  titulo: "Diseño e Implementación de un Sistema de Gestión Documentaria",
  cantidadTesistas: 1,
  declaracionJurada: true,
  participante1: {
    nombres: "Juan Carlos",
    apellidos: "Pérez Gómez",
    dni: "76543210",
    email: "jperez@unsa.edu.pe",
    nacionalidad: "Peruana",
  },
};

const archivoInvalido = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

describe("CrearSolicitudUseCase (validaciones de dominio)", () => {
  const uc = new CrearSolicitudUseCase();

  it("rechaza si el programa no pertenece a los oficiales", async () => {
    const payloadInvalido = { ...basePayload, programa: "Programa Inexistente XYZ" };
    const r = await uc.execute(payloadInvalido, [], {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("VALIDACION_FALLIDA");
      expect(r.error.message).toContain("13 programas oficiales");
    }
  });

  it("rechaza archivos que no sean PDF válidos (Magic Bytes)", async () => {
    const archivos = [
      {
        tipo: "FUT",
        participanteOrden: 1,
        filename: "malicioso.exe",
        bytes: archivoInvalido,
        mimeType: "application/pdf",
      },
    ];
    const r = await uc.execute(basePayload, archivos, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("VALIDACION_FALLIDA");
      expect(r.error.message).toContain("no es un PDF válido");
    }
  });

  it("rechaza fotos que no sean PDF, JPG o PNG válidos", async () => {
    const archivos = [
      {
        tipo: "FOTO_ESTUDIANTE",
        participanteOrden: 1,
        filename: "foto_falsa.txt",
        bytes: archivoInvalido,
        mimeType: "image/jpeg",
      },
    ];
    const r = await uc.execute(basePayload, archivos, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("VALIDACION_FALLIDA");
      expect(r.error.message).toContain("debe ser formato PDF, JPG o PNG");
    }
  });
});
