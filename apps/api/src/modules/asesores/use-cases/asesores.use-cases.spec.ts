import { describe, expect, it } from "vitest";
import type { AlmacenamientoPort } from "../../../infra/storage/almacenamiento.port.js";
import {
  AgregarEspecialidadAsesorUseCase,
  CrearAsesorUseCase,
  EditarAsesorUseCase,
  SubirArchivoAsesorUseCase,
} from "./asesores.use-cases.js";

/**
 * Validaciones de P15/P10 que se resuelven antes de abrir la transacción
 * (sin BD). Los caminos con BD los cubre `e2e/tests/asesores.api.spec.ts`.
 */

const actor = { id: "", dni: "00000001" };
const ID = "00000000-0000-4000-8000-000000000001";

/** Almacenamiento que falla si se usa: estos casos nunca deben guardar nada. */
const sinGuardar: AlmacenamientoPort = {
  save: () => Promise.reject(new Error("no debería guardar")),
};

const base = {
  dni: "40000001",
  nombres: "Rosa",
  apellidos: "Quispe",
  email: "rosa.quispe@unsa.edu.pe",
};

describe("CrearAsesorUseCase", () => {
  it("rechaza correo no institucional y DNI inválido, con el campo de cada error", async () => {
    const r = await new CrearAsesorUseCase().execute(
      { ...base, dni: "123", email: "rosa@gmail.com" },
      actor,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("VALIDACION_FALLIDA");
      expect(
        (r.error as { errores?: Array<{ campo: string }> }).errores?.map((e) => e.campo),
      ).toEqual(["dni", "email"]);
    }
  });
  it("rechaza una especialidad vacía", async () => {
    const r = await new CrearAsesorUseCase().execute({ ...base, especialidades: [" "] }, actor);
    expect(!r.ok && r.error.code).toBe("VALIDACION_FALLIDA");
  });
});

describe("EditarAsesorUseCase", () => {
  it("sin cambios no se guarda", async () => {
    const r = await new EditarAsesorUseCase().execute(ID, {}, actor);
    expect(!r.ok && r.error.code).toBe("VALIDACION_FALLIDA");
  });
});

describe("AgregarEspecialidadAsesorUseCase", () => {
  it("rechaza un nombre vacío", async () => {
    const r = await new AgregarEspecialidadAsesorUseCase().execute(ID, "  ", actor);
    expect(!r.ok && r.error.code).toBe("VALIDACION_FALLIDA");
  });
});

describe("SubirArchivoAsesorUseCase", () => {
  const uc = new SubirArchivoAsesorUseCase(sinGuardar);
  const pdf = new TextEncoder().encode("%PDF-1.4 contenido");

  it("solo acepta PDF", async () => {
    const r = await uc.execute(ID, { filename: "cv.png", mime: "image/png", bytes: pdf }, actor);
    expect(!r.ok && r.error.code).toBe("DOCUMENTO_INVALIDO");
  });
  it("rechaza un archivo que dice ser PDF pero no lo es", async () => {
    const r = await uc.execute(
      ID,
      { filename: "cv.pdf", mime: "application/pdf", bytes: new TextEncoder().encode("hola") },
      actor,
    );
    expect(!r.ok && r.error.message).toBe("El archivo no es un PDF válido");
  });
  it("rechaza más de 10 MB", async () => {
    const grande = new Uint8Array(10 * 1024 * 1024 + 1);
    const r = await uc.execute(
      ID,
      { filename: "cv.pdf", mime: "application/pdf", bytes: grande },
      actor,
    );
    expect(!r.ok && r.error.code).toBe("DOCUMENTO_INVALIDO");
  });
});
