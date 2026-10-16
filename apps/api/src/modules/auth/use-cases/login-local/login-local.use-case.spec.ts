import { describe, expect, it } from "vitest";
import { hashearClaveTest } from "../../hash.js";
import { ACCESO_MINUTOS } from "../../sesiones.js";
import type { CuentaAuth, RepositorioCuentas, RepositorioSesiones } from "../repositorios.js";
import { LoginLocalUseCase } from "./login-local.use-case.js";

function cuentasFake(
  cuenta: CuentaAuth,
): RepositorioCuentas & { guardados: Array<[string, number, Date | null]> } {
  const guardados: Array<[string, number, Date | null]> = [];
  return {
    guardados,
    buscarPorIdentificador: async (id) =>
      id === cuenta.dni || id === cuenta.email ? { ...cuenta } : null,
    buscarPorId: async (id) => (id === cuenta.id ? { ...cuenta } : null),
    buscarPorGoogle: async () => null,
    guardarIntento: async (uid, f, h) => {
      guardados.push([uid, f, h]);
    },
    vincularGoogle: async () => {},
  };
}

const sesionesFake = (): RepositorioSesiones => ({
  crear: async () => {},
  buscarVigentePorHash: async () => null,
  revocar: async () => {},
});

const base: CuentaAuth = {
  id: "u1",
  dni: "00000001",
  nombres: "Angela",
  apellidos: "Adm",
  email: "angela@unsa.edu.pe",
  rol: "ADMIN_FIPS",
  activo: true,
  passwordHash: hashearClaveTest("x"),
  googleSub: null,
  intentosFallidos: 0,
  bloqueadoHasta: null,
};

const ctx = { ip: null, agente: null };

describe("LoginLocalUseCase", () => {
  it("emite par de tokens con credenciales válidas y resetea intentos", async () => {
    const repo = cuentasFake(base);
    const uc = new LoginLocalUseCase(repo, sesionesFake(), () => new Date("2026-01-01T00:00Z"));
    const r = await uc.execute({ identificador: "00000001", password: "x", ...ctx });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.usuario.dni).toBe("00000001");
      expect(r.value.accessToken.length).toBeGreaterThan(20);
      expect(r.value.refreshToken.length).toBeGreaterThan(32);
      expect(r.value.expiraEn).toBe(ACCESO_MINUTOS * 60);
    }
    expect(repo.guardados).toEqual([["u1", 0, null]]);
  });

  it("no distingue inexistente de clave errónea", async () => {
    const uc = new LoginLocalUseCase(cuentasFake(base), sesionesFake());
    const r1 = await uc.execute({ identificador: "00000001", password: "mal", ...ctx });
    const r2 = await uc.execute({ identificador: "99999999", password: "x", ...ctx });
    expect(!r1.ok && r1.error.code).toBe("CREDENCIALES_INVALIDAS");
    expect(!r2.ok && r2.error.code).toBe("CREDENCIALES_INVALIDAS");
  });

  it("bloquea al 5º fallo y rechaza mientras dure", async () => {
    const repo = cuentasFake({ ...base, intentosFallidos: 4 });
    const uc = new LoginLocalUseCase(repo, sesionesFake(), () => new Date("2026-01-01T00:00Z"));
    const r = await uc.execute({ identificador: "00000001", password: "mal", ...ctx });
    expect(!r.ok && r.error.code).toBe("CUENTA_BLOQUEADA");
    expect(repo.guardados[0]?.[2]?.toISOString()).toBe("2026-01-01T00:15:00.000Z");

    const bloqueada = cuentasFake({ ...base, bloqueadoHasta: new Date("2026-01-01T00:15:00Z") });
    const uc2 = new LoginLocalUseCase(
      bloqueada,
      sesionesFake(),
      () => new Date("2026-01-01T00:05Z"),
    );
    const r2 = await uc2.execute({ identificador: "00000001", password: "x", ...ctx });
    expect(!r2.ok && r2.error.code).toBe("CUENTA_BLOQUEADA");
  });

  it("rechaza inactivos y cuentas sin clave", async () => {
    const uc1 = new LoginLocalUseCase(cuentasFake({ ...base, activo: false }), sesionesFake());
    expect(!(await uc1.execute({ identificador: "00000001", password: "x", ...ctx })).ok).toBe(
      true,
    );
    const uc2 = new LoginLocalUseCase(cuentasFake({ ...base, passwordHash: null }), sesionesFake());
    const r = await uc2.execute({ identificador: "00000001", password: "x", ...ctx });
    expect(!r.ok && r.error.code).toBe("SIN_CLAVE");
  });
});
