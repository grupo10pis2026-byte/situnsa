import { describe, expect, it } from "vitest";
import type { CuentaAuth, RepositorioCuentas, RepositorioSesiones } from "../repositorios.js";
import { type IdentidadGoogle, LoginGoogleUseCase } from "./login-google.use-case.js";

const base: CuentaAuth = {
  id: "u1",
  dni: "76543210",
  nombres: "Ana",
  apellidos: "Quispe",
  email: "aquispe@unsa.edu.pe",
  rol: "TESISTA",
  activo: true,
  passwordHash: null,
  googleSub: null,
  intentosFallidos: 0,
  bloqueadoHasta: null,
};

function cuentasFake(cuenta: CuentaAuth | null): RepositorioCuentas & { vinculados: string[] } {
  const vinculados: string[] = [];
  return {
    vinculados,
    buscarPorIdentificador: async () => null,
    buscarPorId: async () => null,
    buscarPorGoogle: async (email, sub) =>
      cuenta && (cuenta.googleSub === sub || cuenta.email === email) ? { ...cuenta } : null,
    guardarIntento: async () => {},
    vincularGoogle: async (_, sub) => {
      vinculados.push(sub);
    },
  };
}

const sesionesFake = (): RepositorioSesiones => ({
  crear: async () => {},
  buscarVigentePorHash: async () => null,
  revocar: async () => {},
});

const identidad = (p: Partial<IdentidadGoogle> = {}): IdentidadGoogle => ({
  sub: "g-123",
  email: "aquispe@unsa.edu.pe",
  verificado: true,
  dominio: "unsa.edu.pe",
  ...p,
});

function uc(cuenta: CuentaAuth | null, id: IdentidadGoogle) {
  const repo = cuentasFake(cuenta);
  return {
    repo,
    caso: new LoginGoogleUseCase(
      repo,
      sesionesFake(),
      async () => id,
      () => new Date("2026-11-26T12:00:00Z"),
      "unsa.edu.pe",
    ),
  };
}

const ctx = { ip: null, agente: null };

describe("LoginGoogleUseCase", () => {
  it("cuenta institucional activa (aun sin clave): emite sesión y vincula el sub", async () => {
    const { caso, repo } = uc(base, identidad());
    const r = await caso.execute("token-de-prueba", ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.usuario.dni).toBe("76543210");
    expect(repo.vinculados).toEqual(["g-123"]);
  });

  it("rechaza cuentas fuera del Workspace UNSA (sin hd o con otro dominio)", async () => {
    for (const p of [
      { email: "ana@gmail.com", dominio: null },
      { email: "ana@otra.edu.pe", dominio: "otra.edu.pe" },
      // hd firmado de otro dominio aunque el correo diga unsa.edu.pe
      { dominio: "unsa.edu.pe.evil.com" },
    ]) {
      const r = await uc(base, identidad(p)).caso.execute("token-de-prueba", ctx);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("DOMINIO_NO_PERMITIDO");
    }
  });

  it("rechaza usuarios inactivos o inexistentes (sin autocreación)", async () => {
    const inactivo = await uc({ ...base, activo: false }, identidad()).caso.execute("t", ctx);
    expect(inactivo.ok).toBe(false);
    if (!inactivo.ok) expect(inactivo.error.code).toBe("SIN_CUENTA");
    const inexistente = await uc(null, identidad()).caso.execute("t", ctx);
    expect(inexistente.ok).toBe(false);
  });

  it("rechaza si el usuario ya está vinculado a otra identidad de Google", async () => {
    const r = await uc({ ...base, googleSub: "g-otro" }, identidad()).caso.execute("t", ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SIN_CUENTA");
  });

  it("rechaza correos no verificados por Google", async () => {
    const r = await uc(base, identidad({ verificado: false })).caso.execute("t", ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("GOOGLE_INVALIDO");
  });
});
