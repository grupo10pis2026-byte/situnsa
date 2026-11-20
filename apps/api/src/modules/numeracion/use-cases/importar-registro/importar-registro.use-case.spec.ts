import type { RegistroNumeracion } from "@pis/domain";
import { describe, expect, it } from "vitest";
import { escribirXlsx } from "../../../../infra/xlsx/escribir-xlsx.js";
import {
  ImportarRegistroUseCase,
  leerLibroRegistro,
  mismosDatos,
  planVinculacionAutomatica,
  TAMANO_MAXIMO_EXCEL,
} from "./importar-registro.use-case.js";

const actor = { id: "", dni: "00000000" };

const decreto = (numero: string, alumno: string, tesis: string): RegistroNumeracion => ({
  tipo: "DECRETO",
  numero,
  datos: { nombreAlumno: alumno, tesis },
  fila: 2,
});

const oficio = (numero: string, expediente: string): RegistroNumeracion => ({
  tipo: "OFICIO",
  numero,
  datos: { expediente },
  fila: 2,
});

const exp = (id: string, codigo: string, titulo: string, participantes: string[]) => ({
  id,
  codigo,
  titulo,
  participantes,
});

describe("leerLibroRegistro", () => {
  it("lee las hojas OFICIOS y DECRETOS sin importar mayúsculas", () => {
    const r = leerLibroRegistro([
      {
        nombre: "Oficios",
        filas: [
          ["N°", "ASUNTO", "EXPEDIENTE"],
          ["1", "Terna", "SET001"],
        ],
      },
      {
        nombre: "DECRETOS",
        filas: [
          ["Nro.CC", "NOMBRE ALUMNO"],
          ["5", "Ana Ruiz"],
        ],
      },
      { nombre: "Resumen", filas: [] },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.OFICIO?.registros).toHaveLength(1);
    expect(r.value.DECRETO?.registros[0]?.numero).toBe("5");
  });

  it("acepta un libro con solo una de las hojas", () => {
    const r = leerLibroRegistro([
      {
        nombre: "DECRETOS",
        filas: [
          ["Nro.CC", "JURADOS"],
          ["1", "x"],
        ],
      },
    ]);
    expect(r.ok && r.value.OFICIO).toBeNull();
  });

  it("falla sin hojas reconocibles o sin la columna del número", () => {
    const sinHojas = leerLibroRegistro([{ nombre: "Hoja1", filas: [] }]);
    expect(sinHojas.ok ? null : sinHojas.error.message).toContain("OFICIOS");
    const sinNumero = leerLibroRegistro([{ nombre: "OFICIOS", filas: [["ASUNTO"], ["x"]] }]);
    expect(sinNumero.ok ? null : sinNumero.error.message).toContain("N°");
  });
});

describe("planVinculacionAutomatica", () => {
  const expedientes = [
    exp("e1", "SET001", "Plan uno", ["Juan Pérez"]),
    exp("e2", "SET002", "Plan dos", ["Ana Ruiz"]),
    exp("e3", "SET003", "Plan repetido", ["Luis Soto"]),
    exp("e4", "SET004", "Plan repetido", ["Luis Soto"]),
  ];

  it("vincula oficios por código SET y decretos por alumno + título", () => {
    const pares = planVinculacionAutomatica(
      [oficio("1", "SET001"), decreto("12", "RUIZ ANA", "Plan dos")],
      expedientes,
    );
    expect(pares.map((p) => [p.registro.numero, p.expedienteId])).toEqual([
      ["1", "e1"],
      ["12", "e2"],
    ]);
  });

  it("no vincula coincidencias ambiguas en ningún sentido", () => {
    // Dos expedientes con el mismo alumno y título.
    expect(
      planVinculacionAutomatica([decreto("20", "Luis Soto", "Plan repetido")], expedientes),
    ).toEqual([]);
    // Dos oficios apuntando al mismo expediente.
    expect(
      planVinculacionAutomatica([oficio("1", "SET001"), oficio("2", "SET001")], expedientes),
    ).toEqual([]);
  });
});

describe("ImportarRegistroUseCase (validaciones previas)", () => {
  const uc = new ImportarRegistroUseCase();

  it("exige un .xlsx válido y de tamaño razonable", async () => {
    const xls = await uc.execute({ nombreArchivo: "r.xls", bytes: new Uint8Array([1]), actor });
    expect(xls.ok ? null : xls.error.code).toBe("DOCUMENTO_INVALIDO");
    const roto = await uc.execute({
      nombreArchivo: "r.xlsx",
      bytes: new TextEncoder().encode("x"),
      actor,
    });
    expect(roto.ok ? null : roto.error.code).toBe("DOCUMENTO_INVALIDO");
    const grande = await uc.execute({
      nombreArchivo: "r.xlsx",
      bytes: new Uint8Array(TAMANO_MAXIMO_EXCEL + 1),
      actor,
    });
    expect(grande.ok ? null : grande.error.code).toBe("DOCUMENTO_INVALIDO");
  });

  it("rechaza un Excel sin las hojas del registro", async () => {
    const bytes = escribirXlsx({ nombre: "Hoja1", encabezados: ["A"], filas: [["x"]] });
    const r = await uc.execute({ nombreArchivo: "r.xlsx", bytes, actor });
    expect(r.ok ? null : r.error.code).toBe("VALIDACION_FALLIDA");
  });
});

describe("mismosDatos", () => {
  it("ignora el orden de las claves y trata vacío como ausente", () => {
    expect(mismosDatos({ a: "1", b: "" }, { a: "1" })).toBe(true);
    expect(mismosDatos({ b: "2", a: "1" }, { a: "1", b: "2" })).toBe(true);
    expect(mismosDatos({ a: "1" }, { a: "2" })).toBe(false);
  });
});
