import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ buscarFormatoVigente: vi.fn() }));
const tx = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  return {
    execute: vi.fn(async () => undefined),
    update: vi.fn(() => ({ set })),
    insert: vi.fn(() => ({ values })),
    set,
    values,
    onConflictDoUpdate,
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

const { EliminarFormatoUseCase } = await import("./eliminar-formato.use-case.js");

describe("EliminarFormatoUseCase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("responde NO_ENCONTRADO si el formato no existe (o ya fue eliminado)", async () => {
    repo.buscarFormatoVigente.mockResolvedValue(null);
    const r = await new EliminarFormatoUseCase().execute("AREA_X", 1);
    expect(r.ok ? null : r.error.code).toBe("NO_ENCONTRADO");
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("elimina un formato del sistema registrando el ajuste archivado en su variante", async () => {
    repo.buscarFormatoVigente.mockResolvedValue({ tipo: "ANEXO_27", etapa: "E2", agregado: false });
    const r = await new EliminarFormatoUseCase().execute("ANEXO_27", 2, { id: "u1", dni: "1" });
    expect(r.ok).toBe(true);
    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "ANEXO_27", variante: 2, etapa: "E2", archivado: true }),
    );
    expect(tx.onConflictDoUpdate).toHaveBeenCalled();
  });

  it("archiva un formato agregado sin desactivar sus versiones", async () => {
    repo.buscarFormatoVigente.mockResolvedValue({ tipo: "AREA_X", agregado: true });
    const r = await new EliminarFormatoUseCase().execute("AREA_X", 1);
    expect(r.ok).toBe(true);
    expect(tx.set).toHaveBeenCalledTimes(1);
    expect(tx.set).toHaveBeenCalledWith(expect.objectContaining({ archivado: true }));
  });
});
