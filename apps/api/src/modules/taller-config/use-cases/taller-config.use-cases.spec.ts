import { describe, expect, it } from "vitest";
import {
  AgregarEspecialidadUseCase,
  AgregarFeriadoUseCase,
  EditarEspecialidadUseCase,
  EditarFeriadoUseCase,
  EditarParametroUseCase,
  EditarSemanaPlanUseCase,
} from "./taller-config.use-cases.js";

/**
 * Validaciones de P16 que se resuelven antes de abrir la transacción (sin
 * BD). Los caminos con BD (duplicados, no encontrado, guardado) los cubre
 * `e2e/tests/taller-configuracion.api.spec.ts` contra Postgres real.
 */

const actor = { id: "", dni: "00000001" };
const ID = "00000000-0000-4000-8000-000000000001";

async function codigo(p: Promise<{ ok: boolean; error?: { code: string } }>): Promise<string> {
  const r = await p;
  return r.ok ? "OK" : (r.error?.code ?? "?");
}

describe("AgregarFeriadoUseCase", () => {
  it("rechaza una fecha inexistente sin tocar la BD", async () => {
    const r = new AgregarFeriadoUseCase().execute(
      { fecha: "2026-02-30", nombre: "Feriado" },
      actor,
    );
    expect(await codigo(r)).toBe("VALIDACION_FALLIDA");
  });
  it("rechaza un nombre vacío", async () => {
    const r = new AgregarFeriadoUseCase().execute({ fecha: "2026-11-01", nombre: "   " }, actor);
    expect(await codigo(r)).toBe("VALIDACION_FALLIDA");
  });
});

describe("EditarFeriadoUseCase", () => {
  it("sin cambios no se guarda", async () => {
    expect(await codigo(new EditarFeriadoUseCase().execute(ID, {}, actor))).toBe(
      "VALIDACION_FALLIDA",
    );
  });
});

describe("EditarSemanaPlanUseCase", () => {
  it("una semana hito exige entregable", async () => {
    const r = new EditarSemanaPlanUseCase().execute(
      2,
      { contenido: "Taller del Plan", entregable: "" },
      actor,
    );
    expect(await codigo(r)).toBe("VALIDACION_FALLIDA");
  });
  it("rechaza contenido vacío", async () => {
    const r = new EditarSemanaPlanUseCase().execute(3, { contenido: " ", entregable: null }, actor);
    expect(await codigo(r)).toBe("VALIDACION_FALLIDA");
  });
});

describe("Especialidades", () => {
  it("rechaza un nombre vacío al agregar", async () => {
    const r = new AgregarEspecialidadUseCase().execute({ nombre: " " }, actor);
    expect(await codigo(r)).toBe("VALIDACION_FALLIDA");
  });
  it("sin cambios no se guarda al editar", async () => {
    expect(await codigo(new EditarEspecialidadUseCase().execute(ID, {}, actor))).toBe(
      "VALIDACION_FALLIDA",
    );
  });
});

describe("EditarParametroUseCase", () => {
  it("rechaza un valor fuera de rango", async () => {
    const r = new EditarParametroUseCase().execute("cupoProyectos", 0, actor);
    expect(await codigo(r)).toBe("VALIDACION_FALLIDA");
  });
  it("rechaza un tipo distinto (número en un Sí/No)", async () => {
    const r = new EditarParametroUseCase().execute("retiroLiberaCupo", 1, actor);
    expect(await codigo(r)).toBe("VALIDACION_FALLIDA");
  });
  it("una clave desconocida es NO_ENCONTRADO (404)", async () => {
    const r = new EditarParametroUseCase().execute("noExiste", 1, actor);
    expect(await codigo(r)).toBe("NO_ENCONTRADO");
  });
});
