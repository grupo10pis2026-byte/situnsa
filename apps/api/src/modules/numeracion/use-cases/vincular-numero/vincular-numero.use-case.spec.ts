import { beforeEach, describe, expect, it, vi } from "vitest";

/** Respuestas de cada `select` en orden (tx falso: encadenable y "thenable"). */
const estado = vi.hoisted(() => ({ respuestas: [] as unknown[][], inserts: [] as unknown[] }));

vi.mock("../../../../infra/db/unit-of-work.js", () => {
  const consulta = () => {
    const filas = estado.respuestas.shift() ?? [];
    // `where()` se puede esperar directamente o seguir con `.limit()`.
    const fin = () => Object.assign(Promise.resolve(filas), { limit: async () => filas });
    const q = { from: () => q, innerJoin: () => q, leftJoin: () => q, where: fin };
    return q;
  };
  const tx = {
    execute: async () => undefined,
    select: consulta,
    insert: () => ({
      values: async (v: unknown) => {
        estado.inserts.push(v);
      },
    }),
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
  sincronizarExpediente: async () => ({ antes: null, despues: "0012", cambio: true }),
}));
vi.mock("../../../expedientes/expedientes.auditoria.js", () => ({
  appendAuditoria: async () => undefined,
}));

const { VincularNumeroUseCase } = await import("./vincular-numero.use-case.js");

const actor = { id: "", dni: "00000000" };
const base = { expedienteId: "e1", tipo: "DECRETO" as const, actor };
const EXP = [{ estado: "EN_REVISION", codigo: "SET001" }];
const REG = [{ numero: "12", vigente: true, datos: {} }];

describe("VincularNumeroUseCase", () => {
  beforeEach(() => {
    estado.respuestas = [];
    estado.inserts = [];
  });

  it("exige el número", async () => {
    const r = await new VincularNumeroUseCase().execute({ ...base, numero: "  " });
    expect(r.ok ? null : r.error.code).toBe("VALIDACION_FALLIDA");
  });

  it("rechaza números que no están en el registro o ya no están vigentes", async () => {
    estado.respuestas = [EXP, []];
    const falta = await new VincularNumeroUseCase().execute({ ...base, numero: "12" });
    expect(falta.ok ? null : falta.error.code).toBe("NO_ENCONTRADO");
    estado.respuestas = [EXP, [{ ...REG[0], vigente: false }]];
    const retirado = await new VincularNumeroUseCase().execute({ ...base, numero: "12" });
    expect(retirado.ok ? null : retirado.error.code).toBe("VALIDACION_FALLIDA");
  });

  it("no permite un número que ya pertenece a otro expediente", async () => {
    estado.respuestas = [EXP, REG, [{ clave: "12", expedienteId: "e9", codigo: "SET009" }]];
    const r = await new VincularNumeroUseCase().execute({ ...base, numero: "0012" });
    expect(r.ok ? null : r.error.message).toContain("SET009");
    expect(estado.inserts).toHaveLength(0);
  });

  it("no permite un segundo decreto en el mismo expediente", async () => {
    estado.respuestas = [EXP, REG, [{ clave: "15", expedienteId: "e1", codigo: "SET001" }]];
    const r = await new VincularNumeroUseCase().execute({ ...base, numero: "12" });
    expect(r.ok ? null : r.error.code).toBe("DATOS_DUPLICADOS");
  });

  it("vincula un número libre y lo devuelve formateado", async () => {
    estado.respuestas = [EXP, REG, []];
    const r = await new VincularNumeroUseCase().execute({ ...base, numero: "12" });
    expect(r.ok && r.value.numero).toBe("0012");
    expect(estado.inserts).toEqual([
      expect.objectContaining({
        tipo: "DECRETO",
        clave: "12",
        expedienteId: "e1",
        origen: "MANUAL",
      }),
    ]);
  });

  it("es idempotente si el número ya es del expediente", async () => {
    estado.respuestas = [EXP, REG, [{ clave: "12", expedienteId: "e1", codigo: "SET001" }]];
    const r = await new VincularNumeroUseCase().execute({ ...base, numero: "12" });
    expect(r.ok).toBe(true);
    expect(estado.inserts).toHaveLength(0);
  });
});
