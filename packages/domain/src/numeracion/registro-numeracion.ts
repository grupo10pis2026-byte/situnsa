/**
 * Registro de oficios y decretos (Excel maestro del área, legacy
 * `SIG102_OficiosDecretos.gs`). Funciones puras: interpretan las filas ya
 * leídas del Excel, normalizan textos y puntúan coincidencias con
 * expedientes. La importación y la vinculación (I/O) viven en el API.
 */

export type TipoNumeracion = "OFICIO" | "DECRETO";

export const TIPOS_NUMERACION: readonly TipoNumeracion[] = ["OFICIO", "DECRETO"];

/** Nombres de hoja aceptados (el piloto toleraba `OFICIO` en singular). */
export const HOJAS_REGISTRO: Record<TipoNumeracion, readonly string[]> = {
  OFICIO: ["OFICIOS", "OFICIO"],
  DECRETO: ["DECRETOS", "DECRETO"],
};

/** Encabezados aceptados para la columna del número (normalizados). */
const COLUMNA_NUMERO: Record<TipoNumeracion, readonly string[]> = {
  OFICIO: ["N", "NO", "NRO", "NUMERO", "N OFICIO", "NRO OFICIO"],
  DECRETO: ["NRO CC", "NRO", "N", "NUMERO", "N DECRETO", "NRO DECRETO"],
};

/** Campo lógico → encabezado del Excel (mismos labels del piloto). */
export const CAMPOS_REGISTRO = {
  OFICIO: {
    asunto: "ASUNTO",
    enviadoA: "ENVIADO A",
    encargado: "ENCARGADO",
    fechaDoc: "FECHA DEL DOC.",
    fechaEnvio: "FECHA DE ENVÍO",
    expediente: "EXPEDIENTE",
    anexos: "ANEXOS",
    conformidad: "CONFORMIDAD",
    estado: "ESTADO",
    observaciones: "OBSERVACIONES",
  },
  DECRETO: {
    nombreAlumno: "NOMBRE ALUMNO",
    tesis: "NOMBRE PLAN DE TESIS",
    especialidad: "ESPECIALIDAD",
    modalidad: "MODALIDAD",
    jurados: "JURADOS",
    fechaEmision: "FECHA EMISIÓN",
    fechaExpiracion: "FECHA EXPIRACIÓN",
    fechaAmpliacion: "FECHA AMPLIACIÓN",
  },
} as const satisfies Record<TipoNumeracion, Record<string, string>>;

/** Campo del registro que aporta la fecha del documento al expediente. */
export const CAMPO_FECHA_DOCUMENTO: Record<TipoNumeracion, string> = {
  OFICIO: "fechaDoc",
  DECRETO: "fechaEmision",
};

export interface RegistroNumeracion {
  tipo: TipoNumeracion;
  /** Número tal como figura en el Excel (sin relleno). */
  numero: string;
  /** Campos lógicos de `CAMPOS_REGISTRO[tipo]` (texto o fecha ISO). */
  datos: Record<string, string>;
  /** Fila del Excel (1-based) para reportes. */
  fila: number;
}

export interface LecturaRegistro {
  registros: RegistroNumeracion[];
  /** Números repetidos en el Excel (se conserva la primera fila). */
  duplicados: string[];
  /** Columnas esperadas que no aparecen en el encabezado. */
  columnasFaltantes: string[];
}

/** Mayúsculas sin tildes ni signos: comparación tolerante (legacy `SIG102_norm_`). */
export function normalizarTexto(x: string | null | undefined): string {
  return String(x ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function indiceEncabezado(fila: readonly string[]): Map<string, number> {
  const indice = new Map<string, number>();
  fila.forEach((h, i) => {
    const k = normalizarTexto(h);
    if (k && !indice.has(k)) indice.set(k, i);
  });
  return indice;
}

function columnaNumero(tipo: TipoNumeracion, indice: Map<string, number>): number | undefined {
  for (const k of COLUMNA_NUMERO[tipo]) {
    const i = indice.get(k);
    if (i !== undefined) return i;
  }
  return undefined;
}

/**
 * Interpreta las filas de una hoja OFICIOS/DECRETOS. El encabezado es la
 * primera fila (de las 10 primeras) que contiene la columna del número.
 * Se omiten filas sin número o con el número pre-llenado pero sin datos
 * (el piloto las trataba como consecutivos libres).
 */
export function leerRegistros(
  tipo: TipoNumeracion,
  filas: ReadonlyArray<readonly string[]>,
): LecturaRegistro | null {
  let filaEncabezado = -1;
  let indice = new Map<string, number>();
  let colNumero: number | undefined;
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const idx = indiceEncabezado(filas[i] ?? []);
    const col = columnaNumero(tipo, idx);
    if (col !== undefined) {
      filaEncabezado = i;
      indice = idx;
      colNumero = col;
      break;
    }
  }
  if (filaEncabezado < 0 || colNumero === undefined) return null;

  const campos = CAMPOS_REGISTRO[tipo] as Record<string, string>;
  const columnas: Array<[string, number]> = [];
  const columnasFaltantes: string[] = [];
  for (const [campo, encabezado] of Object.entries(campos)) {
    const i = indice.get(normalizarTexto(encabezado));
    if (i === undefined) columnasFaltantes.push(encabezado);
    else columnas.push([campo, i]);
  }

  const vistos = new Set<string>();
  const duplicados = new Set<string>();
  const registros: RegistroNumeracion[] = [];
  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    const numero = String(fila[colNumero] ?? "").trim();
    if (!numero) continue;
    const datos: Record<string, string> = {};
    let ocupada = false;
    for (const [campo, col] of columnas) {
      const v = String(fila[col] ?? "").trim();
      datos[campo] = v;
      if (v) ocupada = true;
    }
    if (!ocupada) continue;
    const clave = claveNumero(numero);
    if (vistos.has(clave)) {
      duplicados.add(numero);
      continue;
    }
    vistos.add(clave);
    registros.push({ tipo, numero, datos, fila: i + 1 });
  }
  return { registros, duplicados: [...duplicados], columnasFaltantes };
}

/** Clave de unicidad del número: `7`, `07` y `0007` son el mismo registro. */
export function claveNumero(numero: string): string {
  const v = numero.trim().toUpperCase();
  return /^\d+$/.test(v) ? String(Number(v)) : v.replace(/\s+/g, " ");
}

/**
 * Número tal como entra en `<<OFICIO>>` / `<<DECRETO>>`: los correlativos
 * numéricos se rellenan a 4 dígitos (regla del piloto: `0012`, `0007`).
 */
export function formatearNumeroRegistro(numero: string): string {
  const v = numero.trim().toUpperCase();
  return /^\d+$/.test(v) ? String(Number(v)).padStart(4, "0") : v;
}

/** Datos del expediente que se comparan contra el registro. */
export interface ExpedienteComparable {
  codigo: string;
  titulo: string;
  programa?: string | null;
  /** Nombres completos de los participantes ("Nombres Apellidos"). */
  participantes: readonly string[];
}

function tokens(x: string): string[] {
  return normalizarTexto(x)
    .split(" ")
    .filter((w) => w.length > 0);
}

function mismoConjunto(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  const sa = [...a].sort().join(" ");
  const sb = [...b].sort().join(" ");
  return sa === sb;
}

/** ¿El nombre del Excel corresponde exactamente (sin importar el orden) a los participantes? */
function alumnoExacto(nombreRegistro: string, participantes: readonly string[]): boolean {
  const reg = tokens(nombreRegistro);
  if (reg.length === 0) return false;
  if (participantes.some((p) => mismoConjunto(reg, tokens(p)))) return true;
  return participantes.length > 1 && mismoConjunto(reg, participantes.flatMap(tokens));
}

function tokensCompartidos(texto: string, participantes: readonly string[]): number {
  const t = new Set(tokens(texto));
  const nombres = new Set(participantes.flatMap(tokens).filter((w) => w.length > 3));
  let n = 0;
  for (const w of nombres) if (t.has(w)) n++;
  return n;
}

/**
 * Coincidencia exacta y segura (vinculación automática): oficio por código
 * SET en la columna EXPEDIENTE; decreto por alumno **y** título.
 */
export function coincidenciaExacta(
  registro: RegistroNumeracion,
  exp: ExpedienteComparable,
): boolean {
  if (registro.tipo === "OFICIO") {
    const ref = normalizarTexto(registro.datos.expediente);
    return !!ref && ref === normalizarTexto(exp.codigo);
  }
  const tesis = normalizarTexto(registro.datos.tesis);
  return (
    !!tesis &&
    tesis === normalizarTexto(exp.titulo) &&
    alumnoExacto(registro.datos.nombreAlumno ?? "", exp.participantes)
  );
}

/** Puntaje de similitud (legacy `SIG102_candidatos_`): ≥ 50 se ofrece como candidato. */
export function puntuarCoincidencia(
  registro: RegistroNumeracion,
  exp: ExpedienteComparable,
): number {
  const d = registro.datos;
  if (registro.tipo === "OFICIO") {
    const codigo = normalizarTexto(exp.codigo);
    const ref = normalizarTexto(d.expediente);
    const asunto = normalizarTexto(d.asunto);
    if (codigo && ref === codigo) return 100;
    if (codigo && ref.includes(codigo)) return 85;
    if (codigo && asunto.split(" ").includes(codigo)) return 75;
    if (tokensCompartidos(d.asunto ?? "", exp.participantes) >= 2) return 50;
    return 0;
  }
  let puntaje = 0;
  if (alumnoExacto(d.nombreAlumno ?? "", exp.participantes)) puntaje = 80;
  else if (tokensCompartidos(d.nombreAlumno ?? "", exp.participantes) >= 2) puntaje = 50;
  const tesis = normalizarTexto(d.tesis);
  if (tesis && tesis === normalizarTexto(exp.titulo)) puntaje += 30;
  if (exp.programa && normalizarTexto(d.especialidad) === normalizarTexto(exp.programa)) {
    puntaje += 10;
  }
  return puntaje;
}

export interface Candidato {
  registro: RegistroNumeracion;
  puntaje: number;
}

/** Candidatos ordenados por puntaje (máx. `limite`). */
export function candidatosPara(
  exp: ExpedienteComparable,
  registros: readonly RegistroNumeracion[],
  limite = 8,
): Candidato[] {
  return registros
    .map((registro) => ({ registro, puntaje: puntuarCoincidencia(registro, exp) }))
    .filter((c) => c.puntaje >= 50)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, limite);
}

/** Texto plano del registro para búsqueda (número + campos). */
export function textoBusqueda(registro: Pick<RegistroNumeracion, "numero" | "datos">): string {
  return normalizarTexto([registro.numero, ...Object.values(registro.datos)].join(" "));
}
