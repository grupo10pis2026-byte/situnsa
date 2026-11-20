import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  catalogoVigente: vi.fn(),
  formatoActual: vi.fn(),
  versionDTO: vi.fn((v: { id: string }) => ({ id: v.id })),
}));
const subir = vi.hoisted(() => ({
  validarDocxFormato: vi.fn(),
  registrarVersionFormato: vi.fn(),
}));
const tx = vi.hoisted(() => {
  const values = vi.fn(async () => undefined);
  return { execute: vi.fn(async () => undefined), insert: vi.fn(() => ({ values })), values };
});

vi.mock("../../formatos.repository.js", () => repo);
vi.mock("../subir-formato/subir-formato.use-case.js", async (original) => ({
  ...(await original<typeof import("../subir-formato/subir-formato.use-case.js")>()),
  ...subir,
}));
vi.mock("../../../../infra/db/unit-of-work.js", () => ({
  DrizzleUnitOfWork: class {
    run<T>(fn: (t: unknown) => Promise<T>): Promise<T> {
      return fn(tx);
    }
  },
}));

const { AgregarFormatoUseCase, nombreNormalizado } = await import("./agregar-formato.use-case.js");

const storage = { delete: vi.fn(async () => undefined) };
const actor = { id: "u1", dni: "00000000" };
const entrada = {
  variante: 2,
  etapa: "E1",
  nombre: "Constancia de egresado",
  nombreArchivo: "constancia.docx",
  bytes: new Uint8Array([1]),
  actor,
};
const analisis = { buffer: Buffer.from("x"), etiquetas: ["NOMBRES"], reparadas: 0 };
const { ok } = await import("@pis/domain");

function uc() {
  return new AgregarFormatoUseCase(storage as never);
}

describe("AgregarFormatoUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subir.validarDocxFormato.mockReturnValue(ok(analisis));
    subir.registrarVersionFormato.mockResolvedValue(ok({ id: "v1" }));
    repo.catalogoVigente.mockResolvedValue([]);
    repo.formatoActual.mockResolvedValue({ tipo: "AREA_CONSTANCIA_DE_EGRESADO" });
  });

  it("valida variante, etapa y nombre sin tocar la base de datos", async () => {
    for (const malo of [{ variante: 3 }, { etapa: "E3" }, { nombre: "  x " }]) {
      const r = await uc().execute({ ...entrada, ...malo });
      expect(r.ok ? null : r.error.code).toBe("VALIDACION_FALLIDA");
    }
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rechaza un nombre que ya existe en la variante (sin tildes ni mayúsculas)", async () => {
    repo.catalogoVigente.mockResolvedValue([
      { tipo: "AREA_X", variante: 2, nombre: "CONSTANCIA DE EGRESADÓ" },
    ]);
    const r = await uc().execute(entrada);
    expect(r.ok ? null : r.error.code).toBe("DATOS_DUPLICADOS");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("registra el formato en la etapa elegida con su versión 1 activa", async () => {
    repo.catalogoVigente.mockResolvedValue([
      { tipo: "AREA_CONSTANCIA_DE_EGRESADO", variante: 1, nombre: "Otra variante" },
    ]);
    const r = await uc().execute(entrada);
    expect(r.ok).toBe(true);
    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "AREA_CONSTANCIA_DE_EGRESADO",
        variante: 2,
        etapa: "E1",
        nombre: "Constancia de egresado",
        agregado: true,
      }),
    );
    expect(subir.registrarVersionFormato).toHaveBeenCalledWith(
      tx,
      storage,
      expect.objectContaining({ tipo: "AREA_CONSTANCIA_DE_EGRESADO", variante: 2 }),
      expect.any(Function),
    );
  });

  it("borra el archivo guardado si la transacción falla", async () => {
    subir.registrarVersionFormato.mockImplementation(
      async (_tx: unknown, _s: unknown, _i: unknown, alGuardar: (r: string) => void) => {
        alGuardar("/vol/_plantillas/x.docx");
        throw new Error("fallo");
      },
    );
    await expect(uc().execute(entrada)).rejects.toThrow("fallo");
    expect(storage.delete).toHaveBeenCalledWith("/vol/_plantillas/x.docx");
  });

  it("normaliza nombres para comparar", () => {
    expect(nombreNormalizado("  Acta   DE Revisión ")).toBe("acta de revision");
  });
});
