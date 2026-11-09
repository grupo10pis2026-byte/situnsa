/**
 * Catálogo de plantillas documentales (HU-0017/0018/0020/0030, HU-0068).
 *
 * Son **formatos base** con etiquetas del legacy (<<TESIS>>, <<NOMBRES>>,
 * <<DECRETO>>…): el texto institucional definitivo lo valida el área y se
 * versiona aquí (VERSION_PLANTILLAS). Los documentos que redacta el tesista
 * (plan, anexos 17/18/33) no tienen plantilla. Puro, sin I/O.
 */

import { type Segmento, segmentar } from "./etiquetas.js";

export const VERSION_PLANTILLAS = "v1";

export type EstiloPlantilla = "carta" | "caratula";

/** Etapas con formatos generables: E1/E2 (documentos del tesista) y E6 (informes del área). */
export type EtapaPlantilla = "E1" | "E2" | "E6";

export interface PlantillaDocumento {
  /** Tipo del checklist (o documento solo generado: CARATULA_PLAN, DECRETO_APROBACION). */
  readonly tipo: string;
  readonly nombre: string;
  readonly etapa: EtapaPlantilla;
  readonly estilo: EstiloPlantilla;
  readonly titulo: string;
  readonly parrafos: readonly string[];
  readonly firmas: readonly string[];
}

const LUGAR_FECHA = "Arequipa, <<FECHA_EMISION>>.";

export const PLANTILLAS: readonly PlantillaDocumento[] = [
  {
    tipo: "SOLICITUD_INSCRIPCION",
    nombre: "Solicitud de inscripción del plan",
    etapa: "E1",
    estilo: "carta",
    titulo: "SOLICITUD DE INSCRIPCIÓN DEL PLAN",
    parrafos: [
      "Señor Director de la Unidad de Segunda Especialidad de la Facultad de Ingeniería de Producción y Servicios — UNSA:",
      "Yo, <<NOMBRES>>, identificado(a) con DNI N° <<DNI>>, egresado(a) del programa <<PROGRAMA>>, solicito la inscripción de mi <<MODALIDAD>> titulado «<<TESIS>>», bajo la asesoría de <<ASESOR>>.",
      "Adjunto la documentación exigida para la Etapa 1 del proceso de titulación (expediente <<CODIGO>>).",
      LUGAR_FECHA,
    ],
    firmas: ["<<NOMBRES>>\nDNI <<DNI>>"],
  },
  {
    tipo: "ACEPTACION_ASESORIA",
    nombre: "Formato de aceptación de asesoría",
    etapa: "E1",
    estilo: "carta",
    titulo: "FORMATO DE ACEPTACIÓN DE ASESORÍA",
    parrafos: [
      "Quien suscribe, <<ASESOR>>, acepta asesorar el <<MODALIDAD>> titulado «<<TESIS>>», presentado por <<NOMBRES>> (DNI <<DNI>>), del programa <<PROGRAMA>>.",
      "Se compromete a cumplir el cronograma de asesoría consignado en el plan y a emitir el visto bueno correspondiente en cada etapa del proceso.",
      LUGAR_FECHA,
    ],
    firmas: ["<<ASESOR>>\nAsesor"],
  },
  {
    tipo: "DJ_CONFIDENCIALIDAD",
    nombre: "DJ de confidencialidad",
    etapa: "E1",
    estilo: "carta",
    titulo: "DECLARACIÓN JURADA DE CONFIDENCIALIDAD",
    parrafos: [
      "Yo, <<NOMBRES>>, identificado(a) con DNI N° <<DNI>>, declaro bajo juramento que la información de la organización utilizada en el trabajo «<<TESIS>>» se consigna con la autorización correspondiente y que no divulgaré datos confidenciales sin el consentimiento expreso de la entidad.",
      LUGAR_FECHA,
    ],
    firmas: ["<<NOMBRES>>\nDNI <<DNI>>"],
  },
  {
    tipo: "CARATULA_PLAN",
    nombre: "Carátula del plan",
    etapa: "E1",
    estilo: "caratula",
    titulo: "<<TESIS>>",
    parrafos: [
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA",
      "FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS",
      "UNIDAD DE SEGUNDA ESPECIALIDAD",
      "<<PROGRAMA>>",
      "<<MODALIDAD>> presentado por:",
      "<<NOMBRES>>",
      "Asesor: <<ASESOR>>",
      "AREQUIPA – PERÚ",
      "<<ANIO>>",
    ],
    firmas: [],
  },
  {
    tipo: "DECRETO_APROBACION",
    nombre: "Decreto de aprobación del plan",
    etapa: "E1",
    estilo: "carta",
    titulo: "DECRETO N° <<DECRETO>>",
    parrafos: [
      "Visto el expediente <<CODIGO>> presentado por <<NOMBRES>>, del programa <<PROGRAMA>>, y contando con la conformidad de la terna revisora integrada por <<PRESIDENTE>> (presidente), <<SECRETARIO>> (secretario) y <<ASESOR>> (asesor);",
      "SE DECRETA: aprobar el <<MODALIDAD>> titulado «<<TESIS>>» e inscribirlo en el registro de la Unidad de Segunda Especialidad, con la recomendación: <<RECOMENDACION>>.",
      LUGAR_FECHA,
    ],
    firmas: ["Director de la Unidad de Segunda Especialidad"],
  },
  {
    tipo: "ACTA_CONFORMIDAD",
    nombre: "Acta de conformidad de tesis",
    etapa: "E2",
    estilo: "carta",
    titulo: "ACTA DE CONFORMIDAD DEL BORRADOR",
    parrafos: [
      "El asesor <<ASESOR>> otorga su conformidad al borrador de <<MOD_F>> titulado «<<TESIS>>», presentado por <<NOMBRES>> (expediente <<CODIGO>>), por encontrarse culminado y apto para continuar con el proceso de evaluación.",
      LUGAR_FECHA,
    ],
    firmas: ["<<ASESOR>>\nAsesor"],
  },
  {
    tipo: "ACTA_DICTAMEN",
    nombre: "Acta de dictamen de tesis",
    etapa: "E2",
    estilo: "carta",
    titulo: "ACTA DE DICTAMEN",
    parrafos: [
      "Los miembros del jurado designados mediante <<DECANAL>>: <<PRESIDENTE ETAPA 02>> (presidente), <<SECRETARIO ETAPA 02>> (secretario) y <<SUPLENTE ETAPA 02>> (suplente), habiendo revisado el borrador de <<MOD_F>> titulado «<<TESIS>>», presentado por <<NOMBRES>>, emiten dictamen FAVORABLE y lo declaran apto para sustentación.",
      LUGAR_FECHA,
    ],
    firmas: ["<<PRESIDENTE ETAPA 02>>\nPresidente", "<<SECRETARIO ETAPA 02>>\nSecretario"],
  },
  {
    tipo: "ACTA_SUSTENTACION",
    nombre: "Acta de sustentación",
    etapa: "E2",
    estilo: "carta",
    titulo: "ACTA DE SUSTENTACIÓN",
    parrafos: [
      "En la ciudad de Arequipa, el <<FECHA>>, a las <<HORA>> horas, en <<LUGAR SUSTENTACION>>, se reunió el jurado integrado por <<PRESIDENTE ETAPA 02>>, <<SECRETARIO ETAPA 02>> y <<SUPLENTE ETAPA 02>> para la sustentación de <<MOD_F>> titulada «<<TESIS>>», presentada por <<NOMBRES>>.",
      "Concluida la exposición y absueltas las preguntas, el jurado acordó: <<VEREDICTO>>.",
    ],
    firmas: [
      "<<PRESIDENTE ETAPA 02>>\nPresidente",
      "<<SECRETARIO ETAPA 02>>\nSecretario",
      "<<SUPLENTE ETAPA 02>>\nSuplente",
    ],
  },
  {
    tipo: "ANEXO_27",
    nombre: "Anexo N° 27 — Solicitud para optar título 2da especialidad",
    etapa: "E2",
    estilo: "carta",
    titulo: "SOLICITUD PARA OPTAR EL TÍTULO DE SEGUNDA ESPECIALIDAD",
    parrafos: [
      "Señor Decano de la Facultad de Ingeniería de Producción y Servicios — UNSA:",
      "Yo, <<NOMBRES>>, identificado(a) con DNI N° <<DNI>>, habiendo concluido la evaluación de <<MOD_F>> titulada «<<TESIS>>» (expediente <<CODIGO>>), solicito se me otorgue el título de <<PROGRAMA>>.",
      LUGAR_FECHA,
    ],
    firmas: ["<<NOMBRES>>\nDNI <<DNI>>"],
  },
  {
    tipo: "ANEXO_01_DJ",
    nombre: "Anexo N° 01 — Declaración jurada",
    etapa: "E2",
    estilo: "carta",
    titulo: "DECLARACIÓN JURADA",
    parrafos: [
      "Yo, <<NOMBRES>>, identificado(a) con DNI N° <<DNI>>, declaro bajo juramento que la documentación presentada en el expediente <<CODIGO>> es auténtica y que no registro antecedentes penales ni judiciales que impidan la obtención del título.",
      LUGAR_FECHA,
    ],
    firmas: ["<<NOMBRES>>\nDNI <<DNI>>"],
  },
  {
    tipo: "ANEXO_32_VERACIDAD",
    nombre: "Anexo N° 32 — DJ veracidad de la información",
    etapa: "E2",
    estilo: "carta",
    titulo: "DECLARACIÓN JURADA DE VERACIDAD DE LA INFORMACIÓN",
    parrafos: [
      "Yo, <<NOMBRES>>, identificado(a) con DNI N° <<DNI>>, declaro que la información contenida en <<MOD_F>> titulada «<<TESIS>>» es veraz y original, y que he respetado los derechos de autor citando las fuentes utilizadas.",
      LUGAR_FECHA,
    ],
    firmas: ["<<NOMBRES>>\nDNI <<DNI>>"],
  },
  {
    tipo: "AUTORIZACION_IMPRESION",
    nombre: "Autorización de impresión de tesis",
    etapa: "E2",
    estilo: "carta",
    titulo: "AUTORIZACIÓN DE IMPRESIÓN",
    parrafos: [
      "El asesor <<ASESOR>> autoriza la impresión de la versión final de <<MOD_F>> titulada «<<TESIS>>», presentada por <<NOMBRES>>, por haber incorporado las observaciones formuladas por el jurado.",
      LUGAR_FECHA,
    ],
    firmas: ["<<ASESOR>>\nAsesor"],
  },
  {
    tipo: "AUTORIZACION_PUBLICACION",
    nombre: "Autorización de publicación de tesis",
    etapa: "E2",
    estilo: "carta",
    titulo: "AUTORIZACIÓN DE PUBLICACIÓN EN EL REPOSITORIO INSTITUCIONAL",
    parrafos: [
      "Yo, <<NOMBRES>>, identificado(a) con DNI N° <<DNI>>, autorizo a la Universidad Nacional de San Agustín de Arequipa a publicar <<MOD_F>> titulada «<<TESIS>>» en su Repositorio Institucional, en acceso abierto, conforme a la normativa vigente.",
      LUGAR_FECHA,
    ],
    firmas: ["<<NOMBRES>>\nDNI <<DNI>>"],
  },
  {
    tipo: "CARATULA_FINAL",
    nombre: "Carátula plan de tesis final",
    etapa: "E2",
    estilo: "caratula",
    titulo: "<<TESIS>>",
    parrafos: [
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA",
      "FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS",
      "UNIDAD DE SEGUNDA ESPECIALIDAD",
      "<<MOD_F>> presentada por:",
      "<<NOMBRES>>",
      "Para optar el título de <<PROGRAMA>>",
      "Asesor: <<ASESOR>>",
      "AREQUIPA – PERÚ",
      "<<ANIO>>",
    ],
    firmas: [],
  },
  {
    // HU-0045: informe del área que abre la Etapa 6 (aprobaciones institucionales).
    tipo: "INFORME_SECRETARIA",
    nombre: "Informe para Secretaría Académica",
    etapa: "E6",
    estilo: "carta",
    titulo: "INFORME PARA SECRETARÍA ACADÉMICA",
    parrafos: [
      "Señor(a) Secretario(a) Académico(a) de la Facultad de Ingeniería de Producción y Servicios — UNSA:",
      "Se informa que el expediente <<CODIGO>>, de <<NOMBRES>> (DNI <<DNI>>), del programa <<PROGRAMA>>, concluyó las etapas académicas del proceso de titulación. <<MOD_F>> «<<TESIS>>» contó con la asesoría de <<ASESOR>>.",
      "El plan fue aprobado mediante decreto N° <<DECRETO>>. El jurado, designado por resolución decanal <<DECANAL>>, estuvo integrado por <<JURADO>>.",
      "La sustentación se realizó el <<FECHA>> con resultado <<VEREDICTO>>. El índice de similitud del reporte Turnitin es de <<SIMILITUD>> % y el trabajo se encuentra registrado en el repositorio institucional: <<URL REPOSITORIO>>.",
      "Se remite el expediente para su revisión por la Comisión de Grados y Títulos y su posterior presentación al Consejo de Facultad.",
      LUGAR_FECHA,
    ],
    firmas: ["Responsable del Área de Titulación\nUnidad de Segunda Especialidad — FIPS"],
  },
];

export function plantillaDe(tipo: string): PlantillaDocumento | null {
  return PLANTILLAS.find((p) => p.tipo === tipo) ?? null;
}

export interface DocumentoRenderizado {
  readonly tipo: string;
  readonly nombre: string;
  readonly estilo: EstiloPlantilla;
  readonly titulo: readonly Segmento[];
  readonly parrafos: ReadonlyArray<readonly Segmento[]>;
  readonly firmas: ReadonlyArray<readonly Segmento[]>;
  /** Etiquetas sin dato (campos pendientes del documento). */
  readonly pendientes: readonly string[];
  /** Tabla opcional tras los párrafos (fichas y reportes del taller). */
  readonly tabla?: TablaDocumento;
}

export interface TablaDocumento {
  /** Encabezados y ancho relativo de cada columna (se reparten el ancho útil). */
  readonly columnas: ReadonlyArray<{ readonly titulo: string; readonly peso: number }>;
  /** Celdas; una celda "pendiente" se resalta como las etiquetas sin dato. */
  readonly filas: ReadonlyArray<
    ReadonlyArray<{ readonly texto: string; readonly pendiente?: boolean }>
  >;
}

/** Inserta los datos en la plantilla y conserva las etiquetas pendientes. */
export function renderizarPlantilla(
  plantilla: PlantillaDocumento,
  datos: Readonly<Record<string, string>>,
): DocumentoRenderizado {
  const pendientes = new Set<string>();
  const aplicar = (texto: string): Segmento[] => {
    const r = segmentar(texto, datos);
    for (const p of r.pendientes) pendientes.add(p);
    return r.segmentos;
  };
  return {
    tipo: plantilla.tipo,
    nombre: plantilla.nombre,
    estilo: plantilla.estilo,
    titulo: aplicar(plantilla.titulo),
    parrafos: plantilla.parrafos.map(aplicar),
    firmas: plantilla.firmas.map(aplicar),
    pendientes: [...pendientes].sort(),
  };
}
