import { describe, expect, it } from "vitest";
import { numeracionBloqueada } from "./actualizar-datos.use-case.js";

const actual = { nroOficio: "0007", nroDecreto: "0012" };

describe("numeracionBloqueada", () => {
  it("permite editar a mano si el expediente no tiene vínculo", () => {
    expect(numeracionBloqueada({ nroDecreto: "99" }, actual, new Set())).toBeNull();
  });

  it("rechaza cambiar el número vinculado al registro", () => {
    const msg = numeracionBloqueada({ nroDecreto: "99" }, actual, new Set(["DECRETO"]));
    expect(msg).toContain("decreto");
    expect(numeracionBloqueada({ nroOficio: "" }, actual, new Set(["OFICIO"]))).toContain(
      "oficio circular",
    );
  });

  it("acepta reenviar el mismo valor (formularios que mandan todos los campos)", () => {
    expect(
      numeracionBloqueada(
        { nroDecreto: "0012", nroOficio: "0007" },
        actual,
        new Set(["DECRETO", "OFICIO"]),
      ),
    ).toBeNull();
  });

  it("solo bloquea el tipo vinculado", () => {
    expect(numeracionBloqueada({ nroOficio: "15" }, actual, new Set(["DECRETO"]))).toBeNull();
  });
});
