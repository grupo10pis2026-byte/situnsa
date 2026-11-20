import { describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  buscarFormatoVigente: vi.fn(),
  formatoActual: vi.fn(),
}));
const tx = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  return { update: vi.fn(() => ({ set })), set, where };
});

vi.mock("../../formatos.repository.js", () => repo);
vi.mock("../../../../infra/db/unit-of-work.js", () => ({
  DrizzleUnitOfWork: class {
    run<T>(fn: (t: unknown) => Promise<T>): Promise<T> {
      return fn(tx);
    }
  },
}));

const { RestaurarFormatoBaseUseCase } = await import("./restaurar-base.use-case.js");

describe("RestaurarFormatoBaseUseCase", () => {
  it("rechaza formatos fuera del catálogo sin modificar versiones", async () => {
    repo.buscarFormatoVigente.mockResolvedValue(null);
    const r = await new RestaurarFormatoBaseUseCase().execute("NO_EXISTE", 1);
    expect(r.ok ? null : r.error.code).toBe("NO_ENCONTRADO");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rechaza variantes distintas de 1 y 2", async () => {
    const r = await new RestaurarFormatoBaseUseCase().execute("DECRETO_APROBACION", 3);
    expect(r.ok ? null : r.error.code).toBe("NO_ENCONTRADO");
  });

  it("un formato agregado por el área no tiene base a la que volver", async () => {
    repo.buscarFormatoVigente.mockResolvedValue({ tipo: "AREA_X", variante: 1, agregado: true });
    const r = await new RestaurarFormatoBaseUseCase().execute("AREA_X", 1);
    expect(r.ok ? null : r.error.code).toBe("VALIDACION_FALLIDA");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("desactiva las versiones de un formato del sistema", async () => {
    repo.buscarFormatoVigente.mockResolvedValue({ tipo: "DECRETO_APROBACION", agregado: false });
    repo.formatoActual.mockResolvedValue({ tipo: "DECRETO_APROBACION", origen: "BASE" });
    const r = await new RestaurarFormatoBaseUseCase().execute("DECRETO_APROBACION", 1);
    expect(r.ok).toBe(true);
    expect(tx.set).toHaveBeenCalledWith({ activa: false });
  });
});
