import { describe, expect, it } from "vitest";
import { esTipoFoto, nombreEnDisco, validarArchivoSolicitud } from "./archivos-solicitud.js";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]);

describe("reglas de archivo de la Mesa de Partes", () => {
  it("reconoce los requisitos de fotografía", () => {
    expect(esTipoFoto("FOTO_ESTUDIANTE")).toBe(true);
    expect(esTipoFoto("FOTO_PARTICIPANTE_2")).toBe(true);
    expect(esTipoFoto("ANEXO_17")).toBe(false);
  });

  it("la fotografía solo admite JPG y se etiqueta como image/jpeg", () => {
    expect(validarArchivoSolicitud("FOTO_ESTUDIANTE", "f.jpg", JPG)).toEqual({
      ok: true,
      mime: "image/jpeg",
    });
    expect(validarArchivoSolicitud("FOTO_ESTUDIANTE", "f.png", PNG).ok).toBe(false);
    expect(validarArchivoSolicitud("FOTO_ESTUDIANTE", "f.pdf", PDF).ok).toBe(false);
  });

  it("el resto de requisitos solo admite PDF, decida lo que decida la extensión", () => {
    expect(validarArchivoSolicitud("ANEXO_17", "a.pdf", PDF)).toEqual({
      ok: true,
      mime: "application/pdf",
    });
    expect(validarArchivoSolicitud("ANEXO_17", "a.pdf", JPG).ok).toBe(false);
  });

  it("el nombre en disco no colisiona entre requisitos ni entre versiones", () => {
    expect(nombreEnDisco("FOTO_ESTUDIANTE", "foto.jpg")).toBe("FOTO_ESTUDIANTE-foto.jpg");
    expect(nombreEnDisco("FOTO_PARTICIPANTE_2", "foto.jpg")).toBe("FOTO_PARTICIPANTE_2-foto.jpg");
    expect(nombreEnDisco("ANEXO_17", "../mi anexo.pdf", 2)).toBe("ANEXO_17-v2-mi_anexo.pdf");
  });
});
