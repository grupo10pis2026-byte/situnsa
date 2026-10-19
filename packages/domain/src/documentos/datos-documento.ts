/**
 * Datos del expediente → etiquetas de documento (alias del legacy V26:
 * <<DECRETO>>, <<OFICIO>>, <<COASESOR>>, <<MOD_F>>…). Aplica RN-L07
 * (administrativos en MAYÚSCULAS, TESIS tal cual la escribió el autor) y
 * RN-L08 (asesor en formato profesional con su grado). Puro.
 */

import {
  type ModalidadCanon,
  modalidadAEtiqueta,
  normalizarAdministrativo,
} from "../expediente/modalidades.js";
import { fechaLarga, formatoAutoridad } from "./etiquetas.js";

export interface PersonaDocumento {
  readonly nombres: string;
  readonly apellidos: string;
  readonly dni: string;
  readonly cui?: string | null;
  readonly grado?: string | null;
  readonly email?: string | null;
  readonly telefono?: string | null;
  readonly nacionalidad?: string | null;
  readonly direccion?: string | null;
  readonly ciudad?: string | null;
}

export interface ExpedienteDocumento {
  readonly codigo: string;
  readonly titulo: string;
  readonly programa: string;
  readonly modalidad: ModalidadCanon;
  readonly participante1: PersonaDocumento | null;
  readonly participante2: PersonaDocumento | null;
  readonly asesor: PersonaDocumento | null;
  readonly datosAdmin: Readonly<Record<string, string | null>>;
  readonly sustentacion?: {
    readonly fecha: string;
    readonly hora: string;
    readonly lugar: string;
    readonly actaVeredicto: string | null;
  } | null;
  /** Jurado sorteado (E3) registrado en Cierre; si falta se usan los datos legacy. */
  readonly jurado?: ReadonlyArray<{ readonly rol: string; readonly nombre: string }>;
  /** Validaciones institucionales que citan los informes (E5). */
  readonly validaciones?: {
    readonly similitud: number | null;
    readonly urlRepositorio: string | null;
  } | null;
}

const MODALIDAD_FINAL: Readonly<Record<ModalidadCanon, string>> = {
  TESIS: "La Tesis",
  TRABAJO_ACADEMICO: "El Trabajo Académico",
  ARTICULO: "La Tesis Formato Artículo",
};

const VEREDICTO: Readonly<Record<string, string>> = {
  FELICITACION: "APROBADO CON FELICITACIÓN PÚBLICA",
  UNANIMIDAD: "APROBADO POR UNANIMIDAD",
  MAYORIA: "APROBADO POR MAYORÍA",
  DESAPROBACION: "DESAPROBADO",
};

function nombreCompleto(p: PersonaDocumento | null): string {
  return p ? `${p.nombres} ${p.apellidos}`.replace(/\s+/g, " ").trim() : "";
}

export function toTitleCase(s: string): string {
  if (!s) return "";
  return s.toLowerCase().replace(/(?:^|\s|\/)\S/g, (char) => char.toUpperCase());
}

/** Preposiciones y artículos que van en minúscula intermedia en nombres en español. */
const PREPOSICIONES_NOMBRES = new Set(["de", "del", "la", "las", "los", "y", "e"]);

/** Grados y títulos académicos con su capitalización formal canónica. */
const ABREVIATURAS_GRADO: Record<string, string> = {
  dr: "Dr.",
  "dr.": "Dr.",
  dra: "Dra.",
  "dra.": "Dra.",
  mg: "Mg.",
  "mg.": "Mg.",
  msc: "MSc.",
  "msc.": "MSc.",
  ing: "Ing.",
  "ing.": "Ing.",
  lic: "Lic.",
  "lic.": "Lic.",
  "ph.d": "Ph.D.",
  "ph.d.": "Ph.D.",
  phd: "Ph.D.",
  abg: "Abg.",
  "abg.": "Abg.",
  prof: "Prof.",
  "prof.": "Prof.",
  bach: "Bach.",
  "bach.": "Bach.",
};

/**
 * Formatea nombres de personas con mayúsculas iniciales (Title Case formal),
 * conservando preposiciones intermedias en minúscula ("del", "de la") y
 * abreviaturas académicas estándar ("Dr.", "Dra.", "Mg.", "MSc.", "Ing.", "Lic.").
 */
export function formatoNombrePersona(textoEntrada: string | null | undefined): string {
  if (!textoEntrada) return "";
  const limpio = textoEntrada.trim().replace(/\s+/g, " ");
  if (!limpio) return "";

  const palabras = limpio.split(" ");
  const resultado: string[] = [];

  for (let i = 0; i < palabras.length; i++) {
    const palabra = palabras[i];
    if (!palabra) continue;

    const normalizada = palabra.toLowerCase().replace(/[,;:]+$/u, "");
    const puntuacionFinal = palabra.slice(normalizada.length);

    // Grado académico (Dr., Dra., Mg., etc.)
    if (ABREVIATURAS_GRADO[normalizada]) {
      resultado.push(`${ABREVIATURAS_GRADO[normalizada]}${puntuacionFinal}`);
      continue;
    }

    // Partículas intermedias en minúsculas (de, del, la, las, los, y, e)
    if (i > 0 && PREPOSICIONES_NOMBRES.has(normalizada)) {
      resultado.push(`${normalizada}${puntuacionFinal}`);
      continue;
    }

    // Capitalizar con mayúscula inicial (respetando guiones como Jean-Luc o paréntesis)
    const partesGuion = palabra.split("-").map((sub) => {
      if (!sub) return "";
      const match = /^([^\p{L}\p{N}]*)([\p{L}\p{N}])(.*)$/u.exec(sub);
      if (match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
        const prefijo = match[1];
        const inicial = match[2];
        const resto = match[3];
        return `${prefijo}${inicial.toUpperCase()}${resto.toLowerCase()}`;
      }
      return sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase();
    });

    resultado.push(partesGuion.join("-"));
  }

  return resultado.join(" ");
}

/** Palabras menores que van en minúscula en títulos formales en español (salvo inicio). */
const PALABRAS_MENORES_TITULO = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "un",
  "una",
  "unos",
  "unas",
  "en",
  "para",
  "por",
  "con",
  "sin",
  "sobre",
  "a",
  "al",
  "y",
  "e",
  "o",
  "u",
]);

/** Acrónimos y siglas que deben permanecer en mayúsculas en títulos académicos. */
const ACRONIMOS_TITULO: Record<string, string> = {
  unsa: "UNSA",
  fips: "FIPS",
  epis: "EPIS",
  tic: "TIC",
  tics: "TICs",
  ti: "TI",
  ia: "IA",
  api: "API",
  apis: "APIs",
  rest: "REST",
  sql: "SQL",
  iot: "IoT",
  ml: "ML",
  gps: "GPS",
  erp: "ERP",
  crm: "CRM",
  scm: "SCM",
  iso: "ISO",
  ieee: "IEEE",
  sunedu: "SUNEDU",
  minedu: "MINEDU",
  reniec: "RENIEC",
  cui: "CUI",
  dni: "DNI",
  web: "Web",
  app: "App",
  apps: "Apps",
  so: "SO",
  pdf: "PDF",
  v26: "V26",
};

/**
 * Formato formal para títulos de tesis y trabajos académicos según normativa
 * institucional y de documentos oficiales:
 * 1. Sin comillas (« », “ ”, " ", ' ').
 * 2. Sin punto final (.).
 * 3. Si viene en mayúsculas sostenidas o minúsculas sostenidas, se formatea
 *    en mayúsculas iniciales / tipo título formal, conservando acrónimos
 *    (UNSA, FIPS, IA, TIC, etc.) y preposiciones/artículos en minúscula.
 * 4. Si ya viene con mayúsculas y minúsculas mixtas del autor, se respeta su
 *    capitalización cuidando comillas y puntuación final.
 */
export function formatoTituloFormal(tituloEntrada: string | null | undefined): string {
  if (!tituloEntrada) return "";
  // 1. Quitar comillas exteriores e interiores y punto final
  const limpio = tituloEntrada
    .trim()
    .replace(/^[«“"'\s]+|[»”"'\s]+$/gu, "")
    .replace(/[«»“”]/gu, "")
    .replace(/\.+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!limpio) return "";

  // 2. Evaluar si está en mayúsculas o minúsculas sostenidas
  const soloLetras = limpio.replace(/[^\p{L}]/gu, "");
  const esTodoMayusculas = soloLetras.length > 5 && soloLetras === soloLetras.toUpperCase();
  const esTodoMinusculas = soloLetras.length > 5 && soloLetras === soloLetras.toLowerCase();

  if (!esTodoMayusculas && !esTodoMinusculas) {
    // Ya viene con mezcla de mayúsculas/minúsculas del autor; solo devolver limpio
    return limpio;
  }

  // 3. Formatear como título formal (Title Case académico)
  const palabras = limpio.split(" ");
  const formateadas: string[] = [];

  for (let i = 0; i < palabras.length; i++) {
    const pal = palabras[i];
    if (!pal) continue;

    const normalizada = pal.toLowerCase().replace(/[,;:.-]+$/u, "");
    const puntuacionFinal = pal.slice(normalizada.length);

    // ¿Es un acrónimo reconocido?
    if (ACRONIMOS_TITULO[normalizada]) {
      formateadas.push(`${ACRONIMOS_TITULO[normalizada]}${puntuacionFinal}`);
      continue;
    }

    // ¿Es palabra menor intermedia? (salvo si la anterior terminó en dos puntos o guion)
    const palabraPrevia = i > 0 ? (palabras[i - 1] ?? "") : "";
    const esDespuesDePuntuacion = /[:\-–—]$/u.test(palabraPrevia);
    if (i > 0 && !esDespuesDePuntuacion && PALABRAS_MENORES_TITULO.has(normalizada)) {
      formateadas.push(`${normalizada}${puntuacionFinal}`);
      continue;
    }

    // Capitalizar palabra (respetando guiones)
    const subpartes = pal.split("-").map((sub) => {
      if (!sub) return "";
      const match = /^([^\p{L}\p{N}]*)([\p{L}\p{N}])(.*)$/u.exec(sub);
      if (match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
        const prefijo = match[1];
        const inicial = match[2];
        const resto = match[3];
        const normSub = `${inicial}${resto}`.toLowerCase();
        if (ACRONIMOS_TITULO[normSub]) {
          return `${prefijo}${ACRONIMOS_TITULO[normSub]}`;
        }
        return `${prefijo}${inicial.toUpperCase()}${resto.toLowerCase()}`;
      }
      return sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase();
    });

    formateadas.push(subpartes.join("-"));
  }

  return formateadas.join(" ");
}

/** RN-L08: Formato profesional con grado académico y Title Case ("Dr. Nombres Apellidos"). */
export function formatoAsesor(p: PersonaDocumento | null): string {
  if (!p) return "";
  const grado = (p.grado ?? "").trim();
  const nombre = nombreCompleto(p);
  const combinado = grado ? `${grado} ${nombre}` : nombre;
  return formatoNombrePersona(combinado);
}

function texto(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** "A", "A y B", "A, B y C". */
function unirLista(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

const ORDEN_ROL = ["PRESIDENTE", "SECRETARIO", "VOCAL", "SUPLENTE"];

/** Jurado en texto corrido: "Dr. Ana Ruiz (presidente), …" con mayúsculas iniciales. */
function textoJurado(exp: ExpedienteDocumento): string {
  const registrado = [...(exp.jurado ?? [])].sort(
    (x, y) => ORDEN_ROL.indexOf(x.rol) - ORDEN_ROL.indexOf(y.rol),
  );
  if (registrado.length > 0) {
    return unirLista(
      registrado.map((j) => `${formatoNombrePersona(j.nombre)} (${j.rol.toLowerCase()})`),
    );
  }
  const a = exp.datosAdmin;
  const legacy: Array<[string, string]> = [
    ["presidente", formatoNombrePersona(texto(a.presidenteE2))],
    ["secretario", formatoNombrePersona(texto(a.secretarioE2))],
    ["suplente", formatoNombrePersona(texto(a.suplenteE2))],
  ];
  return unirLista(legacy.filter(([, n]) => n).map(([rol, n]) => `${n} (${rol})`));
}

/** Mapa etiqueta → valor (claves en mayúsculas, como las normaliza segmentar). */
export function construirDatosDocumento(
  exp: ExpedienteDocumento,
  hoy: Date,
): Record<string, string> {
  const a = exp.datosAdmin;
  const p1 = exp.participante1;
  const p2 = exp.participante2;
  const p1Nombre = formatoNombrePersona(nombreCompleto(p1));
  const p2Nombre = formatoNombrePersona(nombreCompleto(p2));
  const nombresConjuntos = [p1Nombre, p2Nombre].filter(Boolean).join(" y ");
  const dnisConjuntos = [p1?.dni, p2?.dni].filter((d): d is string => !!d).join(" / ");
  const asesor = formatoNombrePersona(texto(a.asesorNombre)) || formatoAsesor(exp.asesor);
  const coasesor = formatoNombrePersona(texto(a.coAsesor));
  const modFinal =
    texto(a.modalidadVirtual) || texto(a.modalidadFinal) || MODALIDAD_FINAL[exp.modalidad];
  // Fecha civil de Arequipa (UTC-5), no la del servidor.
  const fechaIso = hoy.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const sust = exp.sustentacion ?? null;
  const tituloFormal = formatoTituloFormal(exp.titulo);
  const veredictoVal =
    (sust?.actaVeredicto ? (VEREDICTO[sust.actaVeredicto] ?? sust.actaVeredicto) : null) ||
    (texto(a.veredicto) ? (VEREDICTO[texto(a.veredicto)] ?? texto(a.veredicto)) : "");
  const numeroActa = texto(a.numeroActa) || texto(a.actaNumero) || "001";
  const datos: Record<string, string> = {
    CODIGO: exp.codigo,
    TESIS: tituloFormal,
    "TESIS 02": tituloFormal,
    TESIS02: tituloFormal,
    NOMBRES: p2 ? p1Nombre : nombresConjuntos,
    NOMBRES_1: p1Nombre,
    NOMBRES_2: p2Nombre,
    "NOMBRES 01": p1Nombre,
    "NOMBRES 02": p2Nombre,
    NOMBRES01: p1Nombre,
    NOMBRES02: p2Nombre,
    NOMBRES_CONJUNTOS: nombresConjuntos,
    DNI: p2 ? (p1?.dni ?? "") : dnisConjuntos,
    DNI_1: p1?.dni ?? "",
    DNI_2: p2?.dni ?? "",
    "DNI 01": p1?.dni ?? "",
    "DNI 02": p2?.dni ?? "",
    DNI01: p1?.dni ?? "",
    DNI02: p2?.dni ?? "",
    DNIS_CONJUNTOS: dnisConjuntos,
    CUI: texto(p1?.cui),
    CUI_1: texto(p1?.cui),
    CUI_2: texto(p2?.cui),
    "CUI 01": texto(p1?.cui),
    "CUI 02": texto(p2?.cui),
    CUI01: texto(p1?.cui),
    CUI02: texto(p2?.cui),
    PROGRAMA: normalizarAdministrativo("programa", exp.programa),
    PROGRAMAS: normalizarAdministrativo("programa", exp.programa),
    MODALIDAD: modalidadAEtiqueta(exp.modalidad),
    MOD_F: modFinal,
    "MODALIDAD FINAL": modFinal,
    ASESOR: asesor,
    COASESOR: coasesor,
    "CO ASESOR": coasesor,
    DECRETO: texto(a.nroDecreto),
    "N° DECRETO": texto(a.nroDecreto),
    OFICIO: texto(a.nroOficio),
    RECOMENDACION: texto(a.recomendacion),
    PRESIDENTE: formatoNombrePersona(texto(a.presidente)),
    SECRETARIO: formatoNombrePersona(texto(a.secretario)),
    INTEGRANTE: formatoNombrePersona(texto(a.integrante)) || asesor || "Dr. Asesor Prueba",
    "PRESIDENTE ETAPA 02": formatoNombrePersona(
      texto(a.presidenteE2) || texto(a.presidente) || "Dr. Cecilio Mauro Villavicencio Melgarejo",
    ),
    "SECRETARIO ETAPA 02": formatoNombrePersona(
      texto(a.secretarioE2) || texto(a.secretario) || "Dr. Edwin Carlos Leoncio Gama Quispe",
    ),
    "SUPLENTE ETAPA 02": formatoNombrePersona(
      texto(a.suplenteE2) || "Mg. Hugo Rufino Llamosas Barriga",
    ),
    SUPLENTE: formatoNombrePersona(texto(a.suplenteE2) || "Mg. Hugo Rufino Llamosas Barriga"),
    DECANAL: normalizarAdministrativo("decanal", texto(a.decanal)),
    "FECHA APERTURA": fechaLarga(a.fechaApertura),
    "FECHA PRESENTACION": fechaLarga(a.fechaPresentacion),
    FECHA: fechaLarga(sust?.fecha ?? a.fechaSustentacion),
    HORA: texto(sust?.hora ?? a.horaSustentacion),
    "HORAS DE LA SUSTENTACION": texto(sust?.hora ?? a.horaSustentacion) || "09:00",
    "LUGAR SUSTENTACION": normalizarAdministrativo(
      "lugarSustentacion",
      texto(sust?.lugar ?? a.lugarSustentacion),
    ),
    "LUGAR SUSTENTACIÓN": normalizarAdministrativo(
      "lugarSustentacion",
      texto(sust?.lugar ?? a.lugarSustentacion),
    ),
    "LUGAR DE SUSTENTACION": normalizarAdministrativo(
      "lugarSustentacion",
      texto(sust?.lugar ?? a.lugarSustentacion),
    ),
    "LUGAR DE SUSTENTACIÓN": normalizarAdministrativo(
      "lugarSustentacion",
      texto(sust?.lugar ?? a.lugarSustentacion),
    ),
    VEREDICTO: veredictoVal,
    VERREDICTO: veredictoVal,
    NUMERO_ACTA: numeroActa,
    "NUMERO DE ACTA": numeroActa,
    "N° DE ACTA": numeroActa,
    ACTA_NUMERO: numeroActa,
    "N° DE TRÁMITE": exp.codigo,
    "N° DE TRAMITE": exp.codigo,
    "NRO DE TRAMITE": exp.codigo,
    EXPEDIENTE: exp.codigo,
    GRUPO: texto(a.grupo) || "GRUPO 01",
    REPOSITORIO: texto(exp.validaciones?.urlRepositorio) || "http://repositorio.unsa.edu.pe",
    ASE_MINU: toTitleCase(asesor),
    JURADO: textoJurado(exp),
    SIMILITUD:
      exp.validaciones?.similitud !== null && exp.validaciones?.similitud !== undefined
        ? String(exp.validaciones.similitud)
        : "",
    "URL REPOSITORIO": texto(exp.validaciones?.urlRepositorio),
    FECHA_EMISION: fechaLarga(fechaIso),
    ANIO: fechaIso.slice(0, 4),
    // Etiquetas de formato y compatibilidad con ETIQUETAS.docx
    NOM_MIN: p2
      ? `${toTitleCase(p1Nombre)}\n${toTitleCase(p2Nombre)}`
      : toTitleCase(nombresConjuntos),
    NOM_MIN02: toTitleCase(p2Nombre),
    NOM_MIN_1: toTitleCase(p1Nombre),
    NOM_MIN_2: toTitleCase(p2Nombre),
    PROGR_MIN: toTitleCase(exp.programa),
    CORREO: texto(p1?.email ?? a.correo),
    CORREO_MIN: texto(p1?.email ?? a.correo).toLowerCase(),
    CORREO02: texto(p2?.email ?? a.correo02),
    CORREO_MIN02: texto(p2?.email ?? a.correo02).toLowerCase(),
    NACIONALIDAD: texto(p1?.nacionalidad ?? a.nacionalidad) || "Peruana",
    NACIONALIDAD02: texto(p2?.nacionalidad ?? a.nacionalidad02) || "Peruana",
    CIUDAD: texto(p1?.ciudad ?? a.ciudad) || "Arequipa",
    CIUDAD02: texto(p2?.ciudad ?? a.ciudad02) || "Arequipa",
    TELEFONO: texto(p1?.telefono ?? a.telefono),
    TELEFONO02: texto(p2?.telefono ?? a.telefono02),
    DIRECCION: texto(p1?.direccion ?? a.direccion),
    DIRECCION02: texto(p2?.direccion ?? a.direccion02),
    FECHA_DECRETO: fechaLarga(a.fechaDecreto) || fechaLarga(fechaIso),
    "FECHA DE DECRETO": fechaLarga(a.fechaDecreto) || fechaLarga(fechaIso),
    FECHA_CIRCULAR: fechaLarga(a.fechaCircular ?? a.fechaOficio) || fechaLarga(fechaIso),
    "FECHA DE OFICIO CIRCULAR":
      fechaLarga(a.fechaCircular ?? a.fechaOficio) || fechaLarga(fechaIso),
    FECHA_OBSERVACION:
      fechaLarga(a.fechaObservacion ?? a.fechaObservaciones) || fechaLarga(fechaIso),
    "FECHA DE OBSERVACIONES":
      fechaLarga(a.fechaObservacion ?? a.fechaObservaciones) || fechaLarga(fechaIso),
    FECHA_SOLICITUD: fechaLarga(a.fechaSolicitud ?? a.fechaApertura) || fechaLarga(fechaIso),
    "FECHA DE SOLICITUD": fechaLarga(a.fechaSolicitud ?? a.fechaApertura) || fechaLarga(fechaIso),
    FECHA_PRESENTACION: fechaLarga(a.fechaPresentacion) || fechaLarga(fechaIso),
    "FECHA DE PRESENTACIÓN": fechaLarga(a.fechaPresentacion) || fechaLarga(fechaIso),
    PROGRAMAS02: normalizarAdministrativo("programa", exp.programa),
    PROGR_MIN02: toTitleCase(exp.programa),
    MODALIDAD02: modalidadAEtiqueta(exp.modalidad),
    ADMIN: formatoNombrePersona(texto(a.admin)),
    CORREO_ADMIN: texto(a.correoAdmin),
    FECHA_EXP: fechaLarga(a.fechaExp ?? a.fechaApertura),
    "FECHA DE EXP": fechaLarga(a.fechaExp ?? a.fechaApertura),
    HORA_EXP: texto(a.horaExp),
    "HORA DE EXP": texto(a.horaExp),
    DECANO: formatoNombrePersona(texto(a.decano) || "Dr. Paúl Vicente Tanco Fernández"),
    DIRECTOR_USE: formatoNombrePersona(
      texto(a.directorUse) || "Dr. Cecilio Mauro Villavicencio Melgarejo",
    ),
    ANIO_LEMA: texto(a.anioLema) || "Año de la Esperanza y el Fortalecimiento de la Democracia",
    FECHA_CONFORMIDAD: fechaLarga(a.fechaConformidad) || fechaLarga(fechaIso),
    "FECHA DE CONFORMIDAD": fechaLarga(a.fechaConformidad) || fechaLarga(fechaIso),
    FECHA_DICTAMEN: fechaLarga(a.fechaDictamen) || fechaLarga(fechaIso),
    "FECHA DE DICTAMEN": fechaLarga(a.fechaDictamen) || fechaLarga(fechaIso),
    FECHA_CONFORMIDAD_ASESOR:
      fechaLarga(a.fechaConformidadAsesor ?? a.fechaConformidad) || fechaLarga(fechaIso),
    FECHA_IMPRESION: fechaLarga(a.fechaImpresion) || fechaLarga(fechaIso),
    "FECHA DE IMPRESION": fechaLarga(a.fechaImpresion) || fechaLarga(fechaIso),
    FECHA_PUBLICACION: fechaLarga(a.fechaPublicacion) || fechaLarga(fechaIso),
    "FECHA DE PUBLICACION": fechaLarga(a.fechaPublicacion) || fechaLarga(fechaIso),
    "FECHA DE SUSTENTACION": fechaLarga(sust?.fecha ?? a.fechaSustentacion ?? fechaIso),
    "FECHA DE SUSTENTACIÓN": fechaLarga(sust?.fecha ?? a.fechaSustentacion ?? fechaIso),
    "FECHA DE OBSERVACIONES 02":
      fechaLarga(a.fechaObservaciones02 ?? a.fechaObservacion) || fechaLarga(fechaIso),
    "FECHA DE SIMILITUD": fechaLarga(a.fechaSimilitud) || fechaLarga(fechaIso),
    "EXPEDIENTE DE SIMILITUD": texto(a.expedienteSimilitud) || exp.codigo,
    "PORCENTAJE DE TURNITIN":
      exp.validaciones?.similitud !== null && exp.validaciones?.similitud !== undefined
        ? `${exp.validaciones.similitud} %`
        : texto(a.porcentajeTurnitin) || "0 %",
    FECHA_INVITACION: fechaLarga(a.fechaInvitacion) || fechaLarga(fechaIso),
    "FECHA DE INVITACIÓN PÚBLICA": fechaLarga(a.fechaInvitacion) || fechaLarga(fechaIso),
    "FECHA DE INVITACION PUBLICA": fechaLarga(a.fechaInvitacion) || fechaLarga(fechaIso),
    FECHA_OFICIO_OTI: fechaLarga(a.fechaOficioOti) || fechaLarga(fechaIso),
    FECHA_OFICIO_UGI: fechaLarga(a.fechaOficioUgi) || fechaLarga(fechaIso),
    "FECHA JURADOS":
      fechaLarga(a.fechaJurados ?? a.fechaNombramientoJurados) || fechaLarga(fechaIso),
    "FECHA DE NOMBRAMIENTO DE JURADOS":
      fechaLarga(a.fechaJurados ?? a.fechaNombramientoJurados) || fechaLarga(fechaIso),
    OFICIO_OTI: texto(a.oficioOti) || "322-2026",
    OFICIO_UGI: texto(a.oficioUgi) || "XXX-2026",
    INFORME_SIMILITUD_NUM: texto(a.informeSimilitudNum) || "001",
    RECOMENDACIONES_TESIS:
      texto(a.recomendacionesTesis) || texto(a.recomendacion) || "Ninguna observación registrada.",
  };
  return datos;
}
