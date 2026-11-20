import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  catalogoVigente: vi.fn(),
  formatoActual: vi.fn(async () => ({ tipo: "X" })),
}));
const tx = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  return {
    execute: vi.fn(async () => undefined),
    update: vi.fn(() => ({ set })),
    delete: vi.fn(() => ({ where })),
    set,
  };
});

vi.mock("../../formatos.repository.js", () => repo);
vi.mock("../../../../infra/db/unit-of-work.js", () => ({
  DrizzleUnitOfWork: class {
    run<T>(fn: (t: unknown) => Promise<T>): Promise<T> {
      return fn(tx);
    }
  },
}));

const { ReactivarFormatoUseCase } = await import("./reactivar-formato.use-case.js");

const sistema = {
  tipo: "ANEXO_27",
  variante: 2,
  etapa: "E2",
  etapaBase: "E2",
  agregado: false,
  archivado: true,
  nombre: "Anexo 27",
};

describe("ReactivarFormatoUseCase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("solo restaura formatos eliminados", async () => {
    repo.catalogoVigente.mockResolvedValue([{ ...sistema, archivado: false }]);
    const r = await new ReactivarFormatoUseCase().execute("ANEXO_27", 2);
    expect(r.ok ? null : r.error.code).toBe("NO_ENCONTRADO");
  });

  it("un formato del sistema en su etapa original queda sin ajuste", async () => {
    repo.catalogoVigente.mockResolvedValue([sistema]);
    const r = await new ReactivarFormatoUseCase().execute("ANEXO_27", 2);
    expect(r.ok).toBe(true);
    expect(tx.delete).toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("un formato agregado vuelve a su etapa", async () => {
    repo.catalogoVigente.mockResolvedValue([
      { ...sistema, tipo: "AREA_X", agregado: true, etapaBase: null, etapa: "E1" },
    ]);
    const r = await new ReactivarFormatoUseCase().execute("AREA_X", 2);
    expect(r.ok).toBe(true);
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ archivado: false }));
  });

  it("no restaura si otro formato vigente ya usa el nombre", async () => {
    repo.catalogoVigente.mockResolvedValue([
      { ...sistema, tipo: "AREA_X", agregado: true, nombre: "Constancia" },
      { ...sistema, tipo: "AREA_Y", agregado: true, archivado: false, nombre: "CONSTANCIA" },
    ]);
    const r = await new ReactivarFormatoUseCase().execute("AREA_X", 2);
    expect(r.ok ? null : r.error.code).toBe("DATOS_DUPLICADOS");
    expect(tx.update).not.toHaveBeenCalled();
  });
});
