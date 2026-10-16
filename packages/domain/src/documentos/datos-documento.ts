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
import { fechaLarga } from "./etiquetas.js";

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
  return s
    .toLowerCase()
    .replace(/(?:^|\s|\/)\S/g, (char) => char.toUpperCase());
}

/** RN-L08: "DR. NOMBRES APELLIDOS" usando el grado registrado del asesor. */
export function formatoAsesor(p: PersonaDocumento | null): string {
  if (!p) return "";
  const grado = (p.grado ?? "").trim();
  const nombre = nombreCompleto(p);
  return normalizarAdministrativo("asesorNombre", grado ? `${grado} ${nombre}` : nombre);
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

/** Jurado en texto corrido: "DR. ANA RUIZ (presidente), …" (RN-L07: nombres en mayúsculas). */
function textoJurado(exp: ExpedienteDocumento): string {
  const registrado = [...(exp.jurado ?? [])].sort(
    (x, y) => ORDEN_ROL.indexOf(x.rol) - ORDEN_ROL.indexOf(y.rol),
  );
  if (registrado.length > 0) {
    return unirLista(
      registrado.map(
        (j) => `${normalizarAdministrativo("asesorNombre", j.nombre)} (${j.rol.toLowerCase()})`,
      ),
    );
  }
  const a = exp.datosAdmin;
  const legacy: Array<[string, string]> = [
    ["presidente", texto(a.presidenteE2)],
    ["secretario", texto(a.secretarioE2)],
    ["suplente", texto(a.suplenteE2)],
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
  const p1Nombre = nombreCompleto(p1);
  const p2Nombre = nombreCompleto(p2);
  const nombresConjuntos = [p1Nombre, p2Nombre].filter(Boolean).join(" y ");
  const dnisConjuntos = [p1?.dni, p2?.dni].filter((d): d is string => !!d).join(" / ");
  const asesor = texto(a.asesorNombre) || formatoAsesor(exp.asesor);
  const modFinal =
    texto(a.modalidadVirtual) || texto(a.modalidadFinal) || MODALIDAD_FINAL[exp.modalidad];
  // Fecha civil de Arequipa (UTC-5), no la del servidor.
  const fechaIso = hoy.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const sust = exp.sustentacion ?? null;
  const datos: Record<string, string> = {
    CODIGO: exp.codigo,
    TESIS: exp.titulo.trim(),
    "TESIS 02": exp.titulo.trim(),
    TESIS02: exp.titulo.trim(),
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
    COASESOR: texto(a.coAsesor),
    "CO ASESOR": texto(a.coAsesor),
    DECRETO: texto(a.nroDecreto),
    "N° DECRETO": texto(a.nroDecreto),
    OFICIO: texto(a.nroOficio),
    RECOMENDACION: texto(a.recomendacion),
    PRESIDENTE: texto(a.presidente),
    SECRETARIO: texto(a.secretario),
    INTEGRANTE: texto(a.integrante) || asesor || "DR. ASESOR PRUEBA",
    "PRESIDENTE ETAPA 02":
      texto(a.presidenteE2) || texto(a.presidente) || "Dr. Cecilio Mauro Villavicencio Melgarejo",
    "SECRETARIO ETAPA 02":
      texto(a.secretarioE2) || texto(a.secretario) || "Dr. Edwin Carlos Leoncio Gama Quispe",
    "SUPLENTE ETAPA 02": texto(a.suplenteE2) || "Mg. Hugo Rufino Llamosas Barriga",
    SUPLENTE: texto(a.suplenteE2) || "Mg. Hugo Rufino Llamosas Barriga",
    DECANAL: texto(a.decanal),
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
    VEREDICTO: sust?.actaVeredicto ? (VEREDICTO[sust.actaVeredicto] ?? sust.actaVeredicto) : "",
    VERREDICTO:
      (sust?.actaVeredicto ? (VEREDICTO[sust.actaVeredicto] ?? sust.actaVeredicto) : null) ||
      texto(a.veredicto) ||
      "UNANIMIDAD",
    JURADO: textoJurado(exp),
    SIMILITUD:
      exp.validaciones?.similitud !== null && exp.validaciones?.similitud !== undefined
        ? String(exp.validaciones.similitud)
        : "",
    "URL REPOSITORIO": texto(exp.validaciones?.urlRepositorio),
    FECHA_EMISION: fechaLarga(fechaIso),
    ANIO: fechaIso.slice(0, 4),
    // Etiquetas de formato y compatibilidad con ETIQUETAS.docx
    NOM_MIN: toTitleCase(nombresConjuntos),
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
    "FECHA DE OFICIO CIRCULAR": fechaLarga(a.fechaCircular ?? a.fechaOficio) || fechaLarga(fechaIso),
    FECHA_OBSERVACION: fechaLarga(a.fechaObservacion ?? a.fechaObservaciones) || fechaLarga(fechaIso),
    "FECHA DE OBSERVACIONES":
      fechaLarga(a.fechaObservacion ?? a.fechaObservaciones) || fechaLarga(fechaIso),
    FECHA_SOLICITUD: fechaLarga(a.fechaSolicitud ?? a.fechaApertura) || fechaLarga(fechaIso),
    "FECHA DE SOLICITUD": fechaLarga(a.fechaSolicitud ?? a.fechaApertura) || fechaLarga(fechaIso),
    FECHA_PRESENTACION: fechaLarga(a.fechaPresentacion) || fechaLarga(fechaIso),
    "FECHA DE PRESENTACIÓN": fechaLarga(a.fechaPresentacion) || fechaLarga(fechaIso),
    PROGRAMAS02: normalizarAdministrativo("programa", exp.programa),
    PROGR_MIN02: toTitleCase(exp.programa),
    MODALIDAD02: modalidadAEtiqueta(exp.modalidad),
    ADMIN: texto(a.admin),
    CORREO_ADMIN: texto(a.correoAdmin),
    FECHA_EXP: fechaLarga(a.fechaExp ?? a.fechaApertura),
    "FECHA DE EXP": fechaLarga(a.fechaExp ?? a.fechaApertura),
    HORA_EXP: texto(a.horaExp),
    "HORA DE EXP": texto(a.horaExp),
    DECANO: texto(a.decano) || "Dr. Paúl Vicente Tanco Fernández",
    DIRECTOR_USE: texto(a.directorUse) || "Dr. Cecilio Mauro Villavicencio Melgarejo",
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
    FECHA_OFICIO_OTI: fechaLarga(a.fechaOficioOti) || fechaLarga(fechaIso),
    FECHA_OFICIO_UGI: fechaLarga(a.fechaOficioUgi) || fechaLarga(fechaIso),
    "FECHA JURADOS":
      fechaLarga(a.fechaJurados ?? a.fechaNombramientoJurados) || fechaLarga(fechaIso),
    "FECHA DE NOMBRAMIENTO DE JURADOS":
      fechaLarga(a.fechaJurados ?? a.fechaNombramientoJurados) || fechaLarga(fechaIso),
    ACTA_NUMERO: texto(a.actaNumero) || "001",
    OFICIO_OTI: texto(a.oficioOti) || "322-2026",
    OFICIO_UGI: texto(a.oficioUgi) || "XXX-2026",
    INFORME_SIMILITUD_NUM: texto(a.informeSimilitudNum) || "001",
    RECOMENDACIONES_TESIS:
      texto(a.recomendacionesTesis) || texto(a.recomendacion) || "Ninguna observación registrada.",
  };
  return datos;
}
