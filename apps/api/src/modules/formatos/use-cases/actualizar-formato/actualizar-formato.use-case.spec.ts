import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  buscarFormatoVigente: vi.fn(),
  catalogoVigente: vi.fn(async () => []),
  formatoActual: vi.fn(async () => ({ tipo: "X" })),
}));
const tx = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  return {
    execute: vi.fn(async () => undefined),
    update: vi.fn(() => ({ set })),
    delete: vi.fn(() => ({ where })),
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

const { ActualizarFormatoUseCase } = await import("./actualizar-formato.use-case.js");

const actor = { id: "u1", dni: "00000000" };
const delSistema = { tipo: "ANEXO_27", variante: 2, etapa: "E2", etapaBase: "E2", agregado: false };
const agregado = {
  tipo: "AREA_X",
  variante: 1,
  etapa: "E1",
  etapaBase: null,
  agregado: true,
  nombre: "X",
};

describe("ActualizarFormatoUseCase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige etapa o nombre y valida la etapa", async () => {
    const uc = new ActualizarFormatoUseCase();
    const vacio = await uc.execute({ tipo: "ANEXO_27", variante: 2, actor });
    expect(vacio.ok ? null : vacio.error.code).toBe("VALIDACION_FALLIDA");
    const mala = await uc.execute({ tipo: "ANEXO_27", variante: 2, etapa: "E5", actor });
    expect(mala.ok ? null : mala.error.code).toBe("VALIDACION_FALLIDA");
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it("responde NO_ENCONTRADO si el formato no existe", async () => {
    repo.buscarFormatoVigente.mockResolvedValue(null);
    const r = await new ActualizarFormatoUseCase().execute({
      tipo: "NADA",
      variante: 1,
      etapa: "E1",
      actor,
    });
    expect(r.ok ? null : r.error.code).toBe("NO_ENCONTRADO");
  });

  it("mueve un formato del sistema a otra etapa (upsert del ajuste)", async () => {
    repo.buscarFormatoVigente.mockResolvedValue(delSistema);
    const r = await new ActualizarFormatoUseCase().execute({
      tipo: "ANEXO_27",
      variante: 2,
      etapa: "E1",
      actor,
    });
    expect(r.ok).toBe(true);
    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "ANEXO_27", variante: 2, etapa: "E1", agregado: false }),
    );
    expect(tx.onConflictDoUpdate).toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("devolverlo a su etapa original borra el ajuste", async () => {
    repo.buscarFormatoVigente.mockResolvedValue({ ...delSistema, etapa: "E1" });
    const r = await new ActualizarFormatoUseCase().execute({
      tipo: "ANEXO_27",
      variante: 2,
      etapa: "E2",
      actor,
    });
    expect(r.ok).toBe(true);
    expect(tx.delete).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("no renombra formatos del sistema", async () => {
    repo.buscarFormatoVigente.mockResolvedValue(delSistema);
    const r = await new ActualizarFormatoUseCase().execute({
      tipo: "ANEXO_27",
      variante: 2,
      nombre: "Otro nombre",
      actor,
    });
    expect(r.ok ? null : r.error.code).toBe("VALIDACION_FALLIDA");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("mueve y renombra un formato agregado, sin repetir nombres", async () => {
    repo.buscarFormatoVigente.mockResolvedValue(agregado);
    repo.catalogoVigente.mockResolvedValueOnce([
      { tipo: "AREA_Y", variante: 1, nombre: "Nuevo nombre" },
    ] as never);
    const dup = await new ActualizarFormatoUseCase().execute({
      tipo: "AREA_X",
      variante: 1,
      nombre: "nuevo NOMBRE",
      actor,
    });
    expect(dup.ok ? null : dup.error.code).toBe("DATOS_DUPLICADOS");

    const r = await new ActualizarFormatoUseCase().execute({
      tipo: "AREA_X",
      variante: 1,
      etapa: "E2",
      nombre: "Nuevo nombre",
      actor,
    });
    expect(r.ok).toBe(true);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ etapa: "E2", nombre: "Nuevo nombre" }),
    );
  });
});
