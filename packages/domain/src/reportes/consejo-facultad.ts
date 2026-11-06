/**
 * Listado consolidado para la sesión del Consejo de Facultad (HU-0046,
 * RN-07.1): una fila por titulando (especialidad, apellidos y nombres, orden)
 * y los casilleros de votación prellenados con «XXX» para los 2 docentes y
 * los 3 alumnos de la Comisión Académica. Puro: sin I/O ni formato de archivo.
 */

import { type ModalidadCanon, normalizarAdministrativo } from "../expediente/modalidades.js";

export const CASILLEROS_CONSEJO = [
  "DOCENTE 1",
  "DOCENTE 2",
  "ALUMNO 1",
  "ALUMNO 2",
  "ALUMNO 3",
] as const;

export const MARCA_CASILLERO = "XXX";

/** Modalidad con la que se titula (no la del plan). */
const MODALIDAD_TITULACION: Readonly<Record<ModalidadCanon, string>> = {
  TESIS: "TESIS",
  TRABAJO_ACADEMICO: "TRABAJO ACADÉMICO",
  ARTICULO: "TESIS (FORMATO ARTÍCULO)",
};

export interface TitulandoConsejo {
  readonly codigo: string;
  readonly programa: string;
  readonly modalidad: ModalidadCanon;
  readonly titulo: string;
  readonly fechaSustentacion: string | null;
  readonly participantes: ReadonlyArray<{
    readonly nombres: string;
    readonly apellidos: string;
    readonly dni: string;
  }>;
}

export interface ListadoConsejo {
  readonly encabezados: readonly string[];
  readonly filas: ReadonlyArray<ReadonlyArray<string | number>>;
}

export const ENCABEZADOS_CONSEJO: readonly string[] = [
  "N°",
  "ESPECIALIDAD",
  "APELLIDOS Y NOMBRES",
  "DNI",
  "MODALIDAD",
  "TÍTULO DE LA TESIS / TRABAJO ACADÉMICO",
  "EXPEDIENTE",
  "FECHA DE SUSTENTACIÓN",
  ...CASILLEROS_CONSEJO,
];

export function construirListadoConsejo(expedientes: readonly TitulandoConsejo[]): ListadoConsejo {
  const titulandos = expedientes.flatMap((e) => e.participantes.map((p) => ({ e, p })));
  titulandos.sort(
    (a, b) =>
      a.e.programa.localeCompare(b.e.programa, "es") ||
      a.p.apellidos.localeCompare(b.p.apellidos, "es") ||
      a.p.nombres.localeCompare(b.p.nombres, "es"),
  );
  return {
    encabezados: ENCABEZADOS_CONSEJO,
    filas: titulandos.map(({ e, p }, i) => [
      i + 1,
      e.programa.trim().toUpperCase(),
      `${p.apellidos.trim()}, ${p.nombres.trim()}`.toUpperCase(),
      p.dni,
      MODALIDAD_TITULACION[e.modalidad],
      e.titulo.trim(),
      e.codigo,
      e.fechaSustentacion ?? "",
      ...CASILLEROS_CONSEJO.map(() => MARCA_CASILLERO),
    ]),
  };
}
