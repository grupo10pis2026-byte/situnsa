import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  expediente: [] as unknown[],
  borrados: [] as unknown[],
  sincronizado: [] as unknown[],
}));

vi.mock("../../../../infra/db/unit-of-work.js", () => {
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => estado.expediente }) }),
    }),
    delete: () => ({ where: () => ({ returning: async () => estado.borrados }) }),
  };
  return {
    DrizzleUnitOfWork: class {
      run<T>(fn: (t: unknown) => Promise<T>): Promise<T> {
        return fn(tx);
      }
    },
  };
});
vi.mock("../../numeracion.repository.js", () => ({
  sincronizarExpediente: async (...args: unknown[]) => {
    estado.sincronizado.push(args);
    return { antes: "0007", despues: null, cambio: true };
  },
}));
vi.mock("../../../expedientes/expedientes.auditoria.js", () => ({
  appendAuditoria: async () => undefined,
}));

const { DesvincularNumeroUseCase } = await import("./desvincular-numero.use-case.js");

const input = { expedienteId: "e1", tipo: "OFICIO" as const, actor: { id: "", dni: "0" } };

describe("DesvincularNumeroUseCase", () => {
  beforeEach(() => {
    estado.expediente = [{ estado: "EN_REVISION" }];
    estado.borrados = [];
    estado.sincronizado = [];
  });

  it("responde NO_ENCONTRADO si el expediente no tiene vínculo", async () => {
    const r = await new DesvincularNumeroUseCase().execute(input);
    expect(r.ok ? null : r.error.code).toBe("NO_ENCONTRADO");
    expect(estado.sincronizado).toHaveLength(0);
  });

  it("no toca expedientes anulados", async () => {
    estado.expediente = [{ estado: "ANULADO" }];
    const r = await new DesvincularNumeroUseCase().execute(input);
    expect(r.ok ? null : r.error.code).toBe("TRANSICION_INVALIDA");
  });

  it("libera el número y limpia el campo del expediente", async () => {
    estado.borrados = [{ clave: "7" }];
    const r = await new DesvincularNumeroUseCase().execute(input);
    expect(r.ok && r.value.liberado).toBe("0007");
    expect(estado.sincronizado[0]).toEqual([expect.anything(), "e1", "OFICIO", null]);
  });
});
