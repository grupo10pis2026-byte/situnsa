import { describe, expect, it } from "vitest";
import { normalizarCalendario } from "../src/taller/calendario.js";
import { esTallerVigente } from "../src/taller/estados.js";
import {
  estadoPorFechaFin,
  estadoPorFechaInicio,
  siguienteCodigoProyecto,
  validarDnisProyecto,
} from "../src/taller/reglas.js";

describe("normalizarCalendario (P2)", () => {
  const s = (fecha: string, horaInicio = "15:00", horaFin = "20:00") => ({
    fecha,
    horaInicio,
    horaFin,
  });

  it("ordena por fecha y numera 1…n (agregar sesión al final o en medio)", () => {
    const r = normalizarCalendario([
      s("2026-10-17"),
      s("2026-10-10"),
      s("2026-10-11", "08:00", "13:00"),
    ]);
    expect(r.ok && r.value.map((x) => [x.nro, x.fecha])).toEqual([
      [1, "2026-10-10"],
      [2, "2026-10-11"],
      [3, "2026-10-17"],
    ]);
  });

  it("una sola sesión por fecha; horas válidas; al menos una sesión", () => {
    expect(normalizarCalendario([s("2026-10-10"), s("2026-10-10")]).ok).toBe(false);
    expect(normalizarCalendario([s("2026-10-10", "20:00", "15:00")]).ok).toBe(false);
    expect(normalizarCalendario([s("2026-02-30")]).ok).toBe(false);
    expect(normalizarCalendario([]).ok).toBe(false);
  });
});

describe("estado del taller por fecha (§6)", () => {
  it("abierto o completo pasa a EN_CURSO al llegar la fecha de inicio", () => {
    expect(estadoPorFechaInicio("ABIERTO_INSCRIPCIONES", "2026-10-10", "2026-10-10")).toBe(
      "EN_CURSO",
    );
    expect(estadoPorFechaInicio("COMPLETO", "2026-10-10", "2026-10-11")).toBe("EN_CURSO");
    expect(estadoPorFechaInicio("ABIERTO_INSCRIPCIONES", "2026-10-10", "2026-10-09")).toBe(
      "ABIERTO_INSCRIPCIONES",
    );
    expect(estadoPorFechaInicio("CANCELADO", "2026-10-10", "2026-10-11")).toBe("CANCELADO");
  });
  it("vigentes: abierto, completo y en curso", () => {
    expect(["ABIERTO_INSCRIPCIONES", "COMPLETO", "EN_CURSO"].every(esTallerVigente)).toBe(true);
    expect(esTallerVigente("FINALIZADO")).toBe(false);
    expect(esTallerVigente("ACTIVO")).toBe(false);
  });
});

describe("proyectos del taller (D1)", () => {
  it("código correlativo sin reutilizar huecos", () => {
    expect(siguienteCodigoProyecto([])).toBe("P-01");
    expect(siguienteCodigoProyecto(["P-01", "P-03"])).toBe("P-04");
  });
  it("DNI de 8 dígitos y segundo tesista distinto", () => {
    expect(validarDnisProyecto("11223344", "").ok).toBe(true);
    const r = validarDnisProyecto("11223344", "11223344");
    expect(!r.ok && r.error.errores[0]?.campo).toBe("dni2");
    expect(!validarDnisProyecto("123", null).ok).toBe(true);
  });

  it("finaliza el día siguiente a la fecha de fin, solo si está en curso", () => {
    expect(estadoPorFechaFin("EN_CURSO", "2027-01-03", "2027-01-03")).toBe("EN_CURSO");
    expect(estadoPorFechaFin("EN_CURSO", "2027-01-03", "2027-01-04")).toBe("FINALIZADO");
    expect(estadoPorFechaFin("CANCELADO", "2027-01-03", "2027-01-04")).toBe("CANCELADO");
    expect(estadoPorFechaFin("EN_CURSO", null, "2027-01-04")).toBe("EN_CURSO");
  });
});
