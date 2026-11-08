import { describe, expect, it } from "vitest";
import {
  marcasHitoSemana,
  normalizarTexto,
  validarFeriado,
  validarNombreEspecialidad,
  validarSemanaPlan,
} from "../src/taller/configuracion.js";
import {
  CLAVES_PARAMETROS_TALLER,
  DEFINICION_PARAMETROS_TALLER,
  esClaveParametroTaller,
  PARAMETROS_TALLER_DEFECTO,
  resolverParametrosTaller,
  validarParametroTaller,
} from "../src/taller/parametros.js";

describe("parámetros del taller (P16)", () => {
  it("cada parámetro tiene metadatos y su valor por defecto es válido", () => {
    expect(CLAVES_PARAMETROS_TALLER).toHaveLength(15);
    for (const clave of CLAVES_PARAMETROS_TALLER) {
      expect(DEFINICION_PARAMETROS_TALLER[clave].etiqueta.length).toBeGreaterThan(5);
      expect(validarParametroTaller(clave, PARAMETROS_TALLER_DEFECTO[clave]).ok).toBe(true);
    }
  });

  it("valida tipo, entero y rango", () => {
    expect(validarParametroTaller("cupoProyectos", 12).ok).toBe(true);
    expect(validarParametroTaller("cupoProyectos", 0).ok).toBe(false);
    expect(validarParametroTaller("cupoProyectos", 12.5).ok).toBe(false);
    expect(validarParametroTaller("cupoProyectos", "12").ok).toBe(false);
    expect(validarParametroTaller("umbralAsistenciaBaja", 101).ok).toBe(false);
    expect(validarParametroTaller("retiroLiberaCupo", true).ok).toBe(true);
    expect(validarParametroTaller("retiroLiberaCupo", 1).ok).toBe(false);
  });

  it("clave desconocida = NO_ENCONTRADO (no hereda de Object.prototype)", () => {
    const r = validarParametroTaller("toString", 1);
    expect(!r.ok && r.error.code).toBe("NO_ENCONTRADO");
    expect(esClaveParametroTaller("constructor")).toBe(false);
  });

  it("el resolvedor ignora valores fuera de rango guardados en BD", () => {
    const p = resolverParametrosTaller([
      { clave: "cupoProyectos", valor: 500 },
      { clave: "diasAvisoPension", valor: 7 },
    ]);
    expect(p.cupoProyectos).toBe(15);
    expect(p.diasAvisoPension).toBe(7);
  });
});

describe("feriados (P16)", () => {
  it("valida fecha y nombre, y normaliza espacios", () => {
    const r = validarFeriado({ fecha: "2026-11-01", nombre: "  Día de   Todos los Santos " });
    expect(r.ok && r.value.nombre).toBe("Día de Todos los Santos");
    expect(validarFeriado({ fecha: "2026-02-30", nombre: "X feriado" }).ok).toBe(false);
    expect(validarFeriado({ fecha: "2026-11-01", nombre: "  " }).ok).toBe(false);
  });
});

describe("plan institucional (P16)", () => {
  it("las marcas de hito vienen de las reglas del taller", () => {
    expect(marcasHitoSemana(2)).toEqual({ esHito: true, fijo: true, tipo: "PLAN" });
    expect(marcasHitoSemana(11)).toEqual({ esHito: true, fijo: false, tipo: "BORRADOR_INTEGRADO" });
    expect(marcasHitoSemana(12).fijo).toBe(true);
    expect(marcasHitoSemana(3)).toEqual({ esHito: false, fijo: false, tipo: null });
  });

  it("una semana hito exige entregable; las demás no", () => {
    expect(validarSemanaPlan({ semana: 4, contenido: "Marco teórico", entregable: " " }).ok).toBe(
      false,
    );
    const r = validarSemanaPlan({ semana: 3, contenido: "Marco teórico", entregable: "  " });
    expect(r.ok && r.value.entregable).toBeNull();
    expect(validarSemanaPlan({ semana: 13, contenido: "Extra", entregable: null }).ok).toBe(false);
    expect(validarSemanaPlan({ semana: 1, contenido: "x", entregable: null }).ok).toBe(false);
  });
});

describe("especialidades (P16)", () => {
  it("normaliza y valida el nombre", () => {
    const r = validarNombreEspecialidad("  Seguridad   y salud ");
    expect(r.ok && r.value).toBe("Seguridad y salud");
    expect(validarNombreEspecialidad(" ").ok).toBe(false);
    expect(normalizarTexto("a\t\nb")).toBe("a b");
  });
});
