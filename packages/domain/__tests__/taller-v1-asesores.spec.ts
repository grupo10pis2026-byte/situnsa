import { describe, expect, it } from "vitest";
import {
  disponibilidadAsesor,
  puedeRecibirTaller,
  validarDatosAsesor,
} from "../src/taller/asesores.js";

const base = {
  dni: "12345678",
  nombres: "  Rosa  María ",
  apellidos: "Quispe   Mamani",
  email: " Rosa.Quispe@UNSA.edu.pe ",
  telefono: "959 123 456",
  grado: "Dr.",
};

describe("validarDatosAsesor (P15)", () => {
  it("normaliza espacios, correo en minúsculas y vacíos a null", () => {
    const r = validarDatosAsesor({ ...base, telefono: " ", grado: "" });
    expect(r.ok && r.value).toEqual({
      dni: "12345678",
      nombres: "Rosa María",
      apellidos: "Quispe Mamani",
      email: "rosa.quispe@unsa.edu.pe",
      telefono: null,
      grado: null,
    });
  });

  it("exige correo institucional y DNI de 8 dígitos, con el campo de cada error", () => {
    const r = validarDatosAsesor({ ...base, dni: "1234", email: "rosa@gmail.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.errores.map((e) => e.campo)).toEqual(["dni", "email"]);
  });

  it("rechaza teléfono con letras", () => {
    const r = validarDatosAsesor({ ...base, telefono: "abc123" });
    expect(!r.ok && r.error.errores[0]?.campo).toBe("telefono");
  });
});

describe("disponibilidad (§6 y P2)", () => {
  it("con taller vigente no recibe otro; inactivo tampoco", () => {
    expect(disponibilidadAsesor(null)).toBe("DISPONIBLE");
    expect(disponibilidadAsesor({ nombre: "TALLER 06" })).toBe("CON_TALLER_ACTIVO");
    expect(puedeRecibirTaller({ activo: true, tallerVigente: null }).ok).toBe(true);
    expect(puedeRecibirTaller({ activo: true, tallerVigente: { nombre: "T" } }).ok).toBe(false);
    expect(puedeRecibirTaller({ activo: false, tallerVigente: null }).ok).toBe(false);
  });
});
