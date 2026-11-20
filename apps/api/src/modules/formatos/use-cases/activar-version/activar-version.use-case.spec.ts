import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  versionPorId: vi.fn(),
  formatoActual: vi.fn(),
  buscarFormatoVigente: vi.fn(async () => ({ tipo: "DECRETO_APROBACION", variante: 1 })),
}));
const tx = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  return { execute: vi.fn(async () => undefined), update: vi.fn(() => ({ set })), set, where };
});

vi.mock("../../formatos.repository.js", () => repo);
vi.mock("../../../../infra/db/unit-of-work.js", () => ({
  DrizzleUnitOfWork: class {
    run<T>(fn: (t: unknown) => Promise<T>): Promise<T> {
      return fn(tx);
    }
  },
}));

const { ActivarVersionFormatoUseCase } = await import("./activar-version.use-case.js");

describe("ActivarVersionFormatoUseCase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("responde NO_ENCONTRADO si la versión no existe", async () => {
    repo.versionPorId.mockResolvedValue(null);
    const r = await new ActivarVersionFormatoUseCase().execute("x");
    expect(r.ok ? null : r.error.code).toBe("NO_ENCONTRADO");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("desactiva las demás versiones y activa la elegida", async () => {
    repo.versionPorId.mockResolvedValue({ id: "v2", tipo: "DECRETO_APROBACION", variante: 1 });
    repo.formatoActual.mockResolvedValue({ tipo: "DECRETO_APROBACION", origen: "PERSONALIZADO" });
    const r = await new ActivarVersionFormatoUseCase().execute("v2");
    expect(r.ok).toBe(true);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.set).toHaveBeenNthCalledWith(1, { activa: false });
    expect(tx.set).toHaveBeenNthCalledWith(2, { activa: true });
  });
});
