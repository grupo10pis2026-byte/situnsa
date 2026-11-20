import { describe, expect, it } from "vitest";
import {
  candidatosPara,
  claveNumero,
  coincidenciaExacta,
  type ExpedienteComparable,
  formatearNumeroRegistro,
  leerRegistros,
  normalizarTexto,
} from "../src/numeracion/registro-numeracion.js";

const OFICIOS = [
  ["REGISTRO DE OFICIOS 2026"],
  [
    "N°",
    "ASUNTO",
    "ENVIADO A",
    "ENCARGADO",
    "FECHA DEL DOC.",
    "FECHA DE ENVÍO",
    "EXPEDIENTE",
    "ANEXOS",
    "CONFORMIDAD",
    "ESTADO",
    "OBSERVACIONES",
  ],
  ["1", "Designación de terna Juan Pérez Gómez", "Terna", "Angela", "2026-03-02", "", "SET064"],
  ["2", "Oficio a OTI", "OTI", "Angela", "2026-03-05", "", ""],
  ["3"], // consecutivo pre-llenado sin datos
  ["02", "Duplicado", "", "", "", "", "SET099"],
];

const DECRETOS = [
  [
    "Nro.CC",
    "NOMBRE ALUMNO",
    "NOMBRE PLAN DE TESIS",
    "ESPECIALIDAD",
    "MODALIDAD",
    "JURADOS",
    "FECHA EMISIÓN",
    "FECHA EXPIRACIÓN",
    "FECHA AMPLIACIÓN",
  ],
  ["12", "PÉREZ GÓMEZ JUAN", "Gestión de riesgos en obras", "Seguridad", "Tesis", "", "2026-04-01"],
  ["13", "Ana Ruiz", "Otro plan", "Seguridad", "Tesis", "", ""],
];

const EXP: ExpedienteComparable = {
  codigo: "SET064",
  titulo: "Gestión de Riesgos en Obras",
  programa: "Seguridad",
  participantes: ["Juan Pérez Gómez"],
};

describe("registro de oficios y decretos", () => {
  it("normaliza tildes, mayúsculas y signos", () => {
    expect(normalizarTexto("  Fecha  de Envío. ")).toBe("FECHA DE ENVIO");
    expect(normalizarTexto("Nro.CC")).toBe("NRO CC");
  });

  it("lee oficios saltando título, filas vacías y duplicados", () => {
    const r = leerRegistros("OFICIO", OFICIOS);
    expect(r).not.toBeNull();
    expect(r?.registros.map((x) => x.numero)).toEqual(["1", "2"]);
    expect(r?.duplicados).toEqual(["02"]);
    expect(r?.columnasFaltantes).toEqual([]);
    expect(r?.registros[0]?.datos.expediente).toBe("SET064");
    expect(r?.registros[0]?.fila).toBe(3);
  });

  it("devuelve null si no encuentra la columna del número", () => {
    expect(
      leerRegistros("DECRETO", [
        ["A", "B"],
        ["1", "2"],
      ]),
    ).toBeNull();
  });

  it("formatea y compara números de forma estable", () => {
    expect(formatearNumeroRegistro("12")).toBe("0012");
    expect(formatearNumeroRegistro("0007")).toBe("0007");
    expect(formatearNumeroRegistro("015-2026")).toBe("015-2026");
    expect(claveNumero("0007")).toBe(claveNumero("7"));
  });

  it("vincula el oficio solo por código SET exacto", () => {
    const r = leerRegistros("OFICIO", OFICIOS);
    const [uno, dos] = r?.registros ?? [];
    expect(uno && coincidenciaExacta(uno, EXP)).toBe(true);
    expect(dos && coincidenciaExacta(dos, EXP)).toBe(false);
  });

  it("vincula el decreto por alumno (sin importar el orden) y título", () => {
    const r = leerRegistros("DECRETO", DECRETOS);
    const [doce, trece] = r?.registros ?? [];
    expect(doce && coincidenciaExacta(doce, EXP)).toBe(true);
    expect(trece && coincidenciaExacta(trece, EXP)).toBe(false);
    expect(doce && coincidenciaExacta(doce, { ...EXP, titulo: "Otro" })).toBe(false);
  });

  it("acepta el nombre conjunto de dos participantes", () => {
    const r = leerRegistros("DECRETO", [
      DECRETOS[0] ?? [],
      ["20", "Juan Pérez Gómez Ana Ruiz", "Plan compartido"],
    ]);
    const reg = r?.registros[0];
    expect(
      reg &&
        coincidenciaExacta(reg, {
          codigo: "SET070",
          titulo: "Plan compartido",
          participantes: ["Juan Pérez Gómez", "Ana Ruiz"],
        }),
    ).toBe(true);
  });

  it("ordena candidatos por puntaje y descarta los débiles", () => {
    const r = leerRegistros("DECRETO", DECRETOS);
    const c = candidatosPara(EXP, r?.registros ?? []);
    expect(c.map((x) => x.registro.numero)).toEqual(["12"]);
    expect(c[0]?.puntaje).toBe(120);
  });
});
