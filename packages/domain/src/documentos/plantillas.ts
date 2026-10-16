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
    nombre: "Anexo 17 — Solicitud de inscripción del plan de tesis",
    etapa: "E1",
    estilo: "carta",
    titulo: "ANEXO 17\nSOLICITUD DE INSCRIPCIÓN DE PROYECTO DE PLAN DE TESIS",
    parrafos: [
      "Señor(a): <<DECANO>>\nDecano de la Facultad de Ingeniería de Producción y Servicios",
      "DATOS DEL (DE LA) SOLICITANTE:\n• Apellidos y Nombres: <<NOMBRES>>\n• Nacionalidad: <<NACIONALIDAD>>\n• DNI/C.E./Pasaporte: <<DNI>>\n• CUI: <<CUI>>\n• Dirección: <<DIRECCION>>\n• Distrito y Ciudad: <<CIUDAD>>\n• Teléfono/Celular: <<TELEFONO>>\n• Correo Electrónico: <<CORREO>>\n• Facultad: FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\n• Programa de Estudios: <<PROGRAMA>>",
      "Ante usted me presento con el debido respeto y expongo:\nEn virtud al Reglamento General: Obtención del Título Profesional de Segunda Especialidad, solicito a usted considerar el Proyecto de Plan de Tesis:\n«<<TESIS>>»",
      "Con el objeto de su inscripción y revisión, solicitando la designación:\n• Asesor: <<ASESOR>>\n• Coasesor: <<CO ASESOR>>",
      "Todo ello a efecto de optar el Título de Segunda Especialidad Profesional en <<PROGRAMA>>.",
      "Por lo expuesto, pido a usted acceder a mi solicitud disponiendo el trámite correspondiente.",
      "Arequipa, <<FECHA_SOLICITUD>>.",
    ],
    firmas: ["<<NOMBRES>>\nFirma del (de la) Solicitante\nDNI N° <<DNI>>"],
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
    nombre: "Carátula del plan de tesis",
    etapa: "E1",
    estilo: "caratula",
    titulo: "<<TESIS>>",
    parrafos: [
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA",
      "FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS",
      "UNIDAD DE SEGUNDA ESPECIALIDAD",
      "ANEXO 2: PORTADA DE SEGUNDA ESPECIALIDAD",
      "Plan de Tesis presentado por:",
      "<<NOM_MIN>>",
      "Para optar el Título de:",
      "<<PROGR_MIN>>",
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
      "“<<ANIO_LEMA>>”",
      "UNIDAD DE SEGUNDA ESPECIALIDAD",
      "DECRETO Nº <<DECRETO>>-USE-FIPS",
      "Arequipa, <<FECHA_DECRETO>>.",
      "Vista la solicitud presentada por don(ña) <<NOMBRES>>, egresado(a) de la <<PROGRAMA>>, por el que solicita Inscripción del Plan de Tesis de conformidad con lo establecido en el reglamento vigente de las Segundas Especialidades de la UNSA.",
      "CONSIDERANDO:\nQue el Director de la Unidad de Segunda Especialidad de la Facultad de Ingeniería de Producción y Servicios inscribió y registró el Plan de Tesis: «<<TESIS>>».\nEl jurado que evaluó el presente Plan de Tesis está integrado por los docentes:\n• Presidente: <<PRESIDENTE>>\n• Secretario: <<SECRETARIO>>\nSiendo su asesor el docente: <<ASESOR>>.\nQue, mediante ACTA DE CONFORMIDAD del Plan de Tesis, el jurado evaluador acordó APROBAR y continuar con el trámite correspondiente.",
      "SE DECRETA:\nAcceder a la inscripción al Plan de Tesis titulado: «<<TESIS>>»; presentada por don(ña) <<NOMBRES>>, egresado(a) de la <<PROGRAMA>>, de la Facultad de Ingeniería de Producción y Servicios.\nRecomendación: <<RECOMENDACION>>.",
      "Regístrese, comuníquese, archívese.",
    ],
    firmas: [
      "<<DIRECTOR_USE>>\nDirector de la Unidad de Segunda Especialidad\nFacultad de Ingeniería de Producción y Servicios",
    ],
  },
  {
    tipo: "OFICIO_CIRCULAR_TERNA",
    nombre: "Oficio circular — Designación de terna evaluadora",
    etapa: "E1",
    estilo: "carta",
    titulo: "OFICIO CIRCULAR <<OFICIO>>-USE-FIPS-UNSA",
    parrafos: [
      "“<<ANIO_LEMA>>”",
      "Arequipa, <<FECHA_CIRCULAR>>.",
      "Señores:\n<<PRESIDENTE>> (Presidente)\n<<SECRETARIO>> (Integrante)\n<<ASESOR>> (Asesor)\nPresente. –",
      "De mi consideración:",
      "Me dirijo a ustedes para comunicarles que la Unidad de acuerdo al reglamento de grados y títulos, ha visto por conveniente designarlos para la revisión y aprobación del Proyecto de Plan de Tesis para la obtención del Título de <<PROGRAMA>>, titulado: «<<TESIS>>», presentado por don(ña) <<NOMBRES>>, quien solicita la revisión y aprobación de su Plan de Tesis.",
      "Se les hace saber también que, de acuerdo al nuevo reglamento de Grados y Títulos de la FIPS, tienen ocho días hábiles para esta revisión y el dictamen debe ser por escrito según los formatos que le corresponden a la comisión en la que ustedes participan.",
      "Luego de la aprobación final correspondiente, y con fines de registro electrónico el graduando enviará al correo de la Unidad el Plan de Tesis aprobado, para lo cual se le solicita al presidente de dicha comisión hacer cumplir este pedido, de lo contrario la Unidad no emitirá el informe aprobatorio del Plan de Tesis.",
      "Adjunto copia del Plan de Tesis.\nSin otro particular me despido de ustedes.",
      "Atentamente,",
    ],
    firmas: [
      "<<DIRECTOR_USE>>\nDirector de la Unidad de Segunda Especialidad\nFacultad de Ingeniería de Producción y Servicios",
    ],
  },
  {
    tipo: "OBSERVACIONES_PLAN",
    nombre: "Formato de observaciones de plan de tesis",
    etapa: "E1",
    estilo: "carta",
    titulo: "FORMATO DE OBSERVACIONES DE PLAN DE TESIS",
    parrafos: [
      "Sr(a) Director(a) de la Unidad de Segunda Especialidad:",
      "Remito a Ud. las opiniones y/o recomendaciones presentadas por los Docentes Evaluadores del Plan de Tesis titulado: «<<TESIS>>», presentado por el (la) (los) Candidato(a)(s): <<NOMBRES>>.",
      "Que se adjunta a la presente, los que deberán ser subsanadas en un periodo máximo de 08 días hábiles contados a partir de la recepción del presente formato, de acuerdo al Reglamento de inscripción del plan de tesis de la Facultad de Ingeniería de Producción y Servicios.",
      "Arequipa, <<FECHA_OBSERVACION>>.",
      "OPINIONES Y/O RECOMENDACIONES DEL PLAN DE TESIS:\n<<RECOMENDACION>>",
      "EVALUADORES:\n• Presidente(a): <<PRESIDENTE>>\n• Asesor(a): <<ASESOR>>",
      "Fecha de Presentación: <<FECHA_PRESENTACION>>.",
    ],
    firmas: [
      "<<PRESIDENTE>>\nPresidente de la Comisión Evaluadora Plan de Tesis",
      "<<ASESOR>>\nAsesor(a)",
    ],
  },
  {
    tipo: "ACTA_CONFORMIDAD",
    nombre: "Acta de conformidad de tesis",
    etapa: "E2",
    estilo: "carta",
    titulo:
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN\nFACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\nUNIDAD DE SEGUNDA ESPECIALIDAD\nACTA DE CONFORMIDAD",
    parrafos: [
      "Los que suscriben en la condición de jurados designados mediante Resolución Decanal N° <<DECANAL>>-FIPS de fecha <<FECHA JURADOS>>, mediante el presente confirman la redacción de: <<MOD_F>>, titulado y realizado por:",
      "«<<TESIS>>»",
      "Autor(es): <<NOMBRES>> (DNI <<DNI>>)\nPrograma: <<PROGRAMA>>",
      "Lo que hacemos de conocimiento a efecto de continuar con el trámite de sustentación a fin de optar el Título de Segunda Especialidad Profesional en <<PROGRAMA>>.",
      "Mediante el presente se otorga conformidad del contenido, declarando la imposibilidad de realizar cambios sustanciales en el mismo durante o después de la sustentación.",
      "Arequipa, <<FECHA_CONFORMIDAD>>.",
    ],
    firmas: [
      "<<PRESIDENTE ETAPA 02>>\nPresidente",
      "<<INTEGRANTE>>\nIntegrante",
      "<<SECRETARIO ETAPA 02>>\nSecretario",
    ],
  },
  {
    tipo: "ACTA_DICTAMEN",
    nombre: "Acta de dictamen de tesis",
    etapa: "E2",
    estilo: "carta",
    titulo:
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN\nFACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\nUNIDAD DE SEGUNDA ESPECIALIDAD\nACTA DE DICTAMEN",
    parrafos: [
      "Vista la Resolución Decanal N° <<DECANAL>>-FIPS, así como el expediente adjunto, el Jurado Dictaminador integrado por los Docentes:\n• <<PRESIDENTE ETAPA 02>> (Presidente)\n• <<INTEGRANTE>> (Integrante)\n• <<SECRETARIO ETAPA 02>> (Secretario)",
      "Reunidos en la Sesión de fecha <<FECHA_DICTAMEN>>, con objeto de DICTAMINAR <<MOD_F>> titulado: «<<TESIS>>», presentado por <<NOMBRES>>.",
      "Luego de haber revisado la investigación correspondiente se ACORDÓ DAR PASE AL ACTO DE SUSTENTACIÓN PÚBLICA, en <<LUGAR SUSTENTACION>>, fijado para el día <<FECHA>> a horas <<HORA>>.",
      "En fe de lo cual firmamos en Arequipa a los <<FECHA_DICTAMEN>>.",
    ],
    firmas: [
      "<<PRESIDENTE ETAPA 02>>\nPresidente",
      "<<INTEGRANTE>>\nIntegrante",
      "<<SECRETARIO ETAPA 02>>\nSecretario",
    ],
  },
  {
    tipo: "ACTA_SUSTENTACION",
    nombre: "Acta de sustentación",
    etapa: "E2",
    estilo: "carta",
    titulo: "ACTA DE SUSTENTACIÓN N° <<ACTA_NUMERO>>\nSEGUNDA ESPECIALIDAD EN <<PROGRAMA>>",
    parrafos: [
      "Para optar el Título de Segunda Especialidad Profesional en <<PROGRAMA>>.\nGraduando(s): <<NOMBRES>>",
      "En Arequipa, siendo las <<HORA>> horas, del día <<FECHA>>, en <<LUGAR SUSTENTACION>>, en cumplimiento a la Resolución Decanal Nº <<DECANAL>>-FIPS, se reunió el jurado calificador integrado por:\n• Presidente: <<PRESIDENTE ETAPA 02>>\n• Integrante: <<INTEGRANTE>>\n• Secretario: <<SECRETARIO ETAPA 02>>",
      "Dándose inicio al Acto Público de Sustentación y Evaluación, en que expuso la investigación titulada: «<<TESIS>>».",
      "Rendida la sustentación, absueltas las observaciones y preguntas formuladas y efectuada la evaluación correspondiente, el resultado fue: <<VEREDICTO>>.",
      "En fe de lo cual se asentó la presente acta que firman los miembros integrantes del jurado.",
    ],
    firmas: [
      "<<PRESIDENTE ETAPA 02>>\nPresidente del Jurado",
      "<<INTEGRANTE>>\nIntegrante del Jurado",
      "<<SECRETARIO ETAPA 02>>\nSecretario del Jurado",
    ],
  },
  {
    tipo: "ANEXO_08",
    nombre: "Anexo N° 08 — Informe de conformidad del asesor",
    etapa: "E2",
    estilo: "carta",
    titulo: "ANEXO 8\nINFORME DE CONFORMIDAD DEL ASESOR",
    parrafos: [
      "Señor(a): <<DECANO>>\nDecano de la Facultad de Ingeniería de Producción y Servicios",
      "DATOS DEL ASESOR Y GRADUANDO:\n• Asesor: <<ASESOR>>\n• Graduando(s): <<NOMBRES>> (DNI <<DNI>>)\n• Programa: <<PROGRAMA>>",
      "Por medio del presente documento, cumplo con informar que se ha procedido con la revisión del contenido, diseño, redacción, sistema de citas y referencias exigidas por la U.N.S.A. de la investigación titulada: «<<TESIS>>».",
      "En tal sentido, de la revisión efectuada se hace constar que la investigación queda: APROBADA y expedita para continuar con el trámite correspondiente.",
      "Arequipa, <<FECHA_CONFORMIDAD_ASESOR>>.",
    ],
    firmas: ["<<ASESOR>>\nFirma - Asesor"],
  },
  {
    tipo: "ANEXO_27",
    nombre: "Anexo N° 27 — Solicitud para optar título 2da especialidad",
    etapa: "E2",
    estilo: "carta",
    titulo: "ANEXO N° 27\nSOLICITUD PARA OPTAR EL TÍTULO DE SEGUNDA ESPECIALIDAD",
    parrafos: [
      "Señor Decano de la Facultad de Ingeniería de Producción y Servicios — UNSA:",
      "Yo, <<NOMBRES>>, identificado(a) con DNI N° <<DNI>>, habiendo concluido y aprobado la sustentación de <<MOD_F>> titulada «<<TESIS>>» (expediente <<CODIGO>>), solicito se me otorgue el Título de Segunda Especialidad Profesional en <<PROGRAMA>>.",
      "Adjunto la documentación exigida de conformidad con el Reglamento General de Grados y Títulos.",
      "Arequipa, <<FECHA_EMISION>>.",
    ],
    firmas: ["<<NOMBRES>>\nDNI <<DNI>>"],
  },
  {
    tipo: "ANEXO_02_DJ",
    nombre: "Anexo N° 02 — DJ no antecedentes terrorismo",
    etapa: "E2",
    estilo: "carta",
    titulo:
      "ANEXO 2\nDECLARACIÓN JURADA DE NO REGISTRAR ANTECEDENTES PENALES Y/O JUDICIALES POR TERRORISMO",
    parrafos: [
      "DATOS DEL DECLARANTE:\n• Apellidos y Nombres: <<NOMBRES>>\n• Nacionalidad: <<NACIONALIDAD>>\n• DNI: <<DNI>>\n• CUI: <<CUI>>\n• Dirección: <<DIRECCION>>\n• Ciudad: <<CIUDAD>>\n• Teléfono: <<TELEFONO>>\n• Correo: <<CORREO>>\n• Programa: <<PROGRAMA>>",
      "Estando al amparo de lo dispuesto por los artículos 49° y 51° del D.S. 004-2019-JUS (TUO Ley N° 27444) y en pleno ejercicio de mis derechos ciudadanos: DECLARO BAJO JURAMENTO NO REGISTRAR ANTECEDENTES PENALES Y/O JUDICIALES POR LOS DELITOS DE TERRORISMO O APOLOGÍA AL TERRORISMO, a efecto de realizar el trámite de obtención del Título en <<PROGRAMA>>.",
      "Asimismo, manifiesto que lo declarado corresponde a la verdad, teniendo conocimiento de las responsabilidades civiles y penales (artículo 411° del Código Penal).",
      "Arequipa, <<FECHA_EMISION>>.",
    ],
    firmas: ["<<NOMBRES>>\nFirma y Huella Dactilar\nDNI N° <<DNI>>"],
  },
  {
    tipo: "ANEXO_02_DJ_P1",
    nombre: "Anexo N° 02 — DJ no antecedentes — Participante 01",
    etapa: "E2",
    estilo: "carta",
    titulo:
      "ANEXO 2\nDECLARACIÓN JURADA DE NO REGISTRAR ANTECEDENTES PENALES Y/O JUDICIALES POR TERRORISMO",
    parrafos: [
      "DATOS DEL DECLARANTE:\n• Apellidos y Nombres: <<NOMBRES>>\n• Nacionalidad: <<NACIONALIDAD>>\n• DNI: <<DNI>>\n• CUI: <<CUI>>\n• Dirección: <<DIRECCION>>\n• Ciudad: <<CIUDAD>>\n• Teléfono: <<TELEFONO>>\n• Correo: <<CORREO>>\n• Programa: <<PROGRAMA>>",
      "Estando al amparo de lo dispuesto por los artículos 49° y 51° del D.S. 004-2019-JUS (TUO Ley N° 27444) y en pleno ejercicio de mis derechos ciudadanos: DECLARO BAJO JURAMENTO NO REGISTRAR ANTECEDENTES PENALES Y/O JUDICIALES POR LOS DELITOS DE TERRORISMO O APOLOGÍA AL TERRORISMO, a efecto de realizar el trámite de obtención del Título en <<PROGRAMA>>.",
      "Asimismo, manifiesto que lo declarado corresponde a la verdad, teniendo conocimiento de las responsabilidades civiles y penales (artículo 411° del Código Penal).",
      "Arequipa, <<FECHA_EMISION>>.",
    ],
    firmas: ["<<NOMBRES>>\nFirma y Huella Dactilar\nDNI N° <<DNI>>"],
  },
  {
    tipo: "ANEXO_02_DJ_P2",
    nombre: "Anexo N° 02 — DJ no antecedentes — Participante 02",
    etapa: "E2",
    estilo: "carta",
    titulo:
      "ANEXO 2\nDECLARACIÓN JURADA DE NO REGISTRAR ANTECEDENTES PENALES Y/O JUDICIALES POR TERRORISMO",
    parrafos: [
      "DATOS DEL DECLARANTE:\n• Apellidos y Nombres: <<NOMBRES02>>\n• Nacionalidad: <<NACIONALIDAD02>>\n• DNI: <<DNI02>>\n• CUI: <<CUI02>>\n• Dirección: <<DIRECCION02>>\n• Ciudad: <<CIUDAD02>>\n• Teléfono: <<TELEFONO02>>\n• Correo: <<CORREO02>>\n• Programa: <<PROGRAMA>>",
      "Estando al amparo de lo dispuesto por los artículos 49° y 51° del D.S. 004-2019-JUS (TUO Ley N° 27444) y en pleno ejercicio de mis derechos ciudadanos: DECLARO BAJO JURAMENTO NO REGISTRAR ANTECEDENTES PENALES Y/O JUDICIALES POR LOS DELITOS DE TERRORISMO O APOLOGÍA AL TERRORISMO, a efecto de realizar el trámite de obtención del Título en <<PROGRAMA>>.",
      "Asimismo, manifiesto que lo declarado corresponde a la verdad, teniendo conocimiento de las responsabilidades civiles y penales (artículo 411° del Código Penal).",
      "Arequipa, <<FECHA_EMISION>>.",
    ],
    firmas: ["<<NOMBRES02>>\nFirma y Huella Dactilar\nDNI N° <<DNI02>>"],
  },
  {
    tipo: "ANEXO_32_VERACIDAD",
    nombre: "Anexo N° 32 — DJ veracidad de la información",
    etapa: "E2",
    estilo: "carta",
    titulo: "ANEXO 32\nDECLARACIÓN JURADA DE VERACIDAD DE LA INFORMACIÓN",
    parrafos: [
      "Yo(nosotros), <<NOMBRES>>, con DNI N° <<DNI>>, de la <<PROGRAMA>> de la Facultad de Ingeniería de Producción y Servicios, autor(es) de <<MOD_F>> titulada: «<<TESIS>>».",
      "DECLARO BAJO JURAMENTO QUE:\nLa veracidad de la información consignada y que los documentos presentados son copia fiel del original. En el caso de no ser cierta la manifestación antes señalada, asumo las consecuencias legales correspondientes y la Universidad no reconocerá validez alguna a la documentación.",
      "Se ratifica en lo expresado en la ciudad de <<CIUDAD>>, a los <<FECHA_EMISION>>.",
    ],
    firmas: ["<<NOMBRES>>\nFirma y Huella Digital\nDNI N° <<DNI>>"],
  },
  {
    tipo: "AUTORIZACION_IMPRESION",
    nombre: "Autorización de impresión de tesis",
    etapa: "E2",
    estilo: "carta",
    titulo:
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA\nFACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\nUNIDAD DE SEGUNDA ESPECIALIDAD\nAUTORIZACIÓN DE IMPRESIÓN",
    parrafos: [
      "Señor(a): <<NOMBRES>>",
      "Cumpliendo con el Reglamento de Grados y Títulos, el jurado calificador acuerda APROBAR LA IMPRESIÓN de la investigación para optar el Título de Segunda Especialidad en <<PROGRAMA>>, titulada: «<<TESIS>>».",
      "Miembros del Jurado:\n• Presidente: <<PRESIDENTE ETAPA 02>>\n• Integrante: <<INTEGRANTE>>\n• Secretario: <<SECRETARIO ETAPA 02>>",
      "Arequipa, <<FECHA_IMPRESION>>.",
    ],
    firmas: [
      "<<PRESIDENTE ETAPA 02>>\nPresidente",
      "<<INTEGRANTE>>\nIntegrante",
      "<<SECRETARIO ETAPA 02>>\nSecretario",
    ],
  },
  {
    tipo: "AUTORIZACION_PUBLICACION",
    nombre: "Autorización de publicación de tesis",
    etapa: "E2",
    estilo: "carta",
    titulo:
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA\nFACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\nUNIDAD DE SEGUNDA ESPECIALIDAD\nAUTORIZACIÓN DE PUBLICACIÓN",
    parrafos: [
      "Señor(a): <<NOMBRES>>",
      "Cumpliendo con el Reglamento de Grados y Títulos, el jurado calificador acuerda APROBAR LA PUBLICACIÓN de dicha investigación para optar el Título de Segunda Especialidad en <<PROGRAMA>>, titulada: «<<TESIS>>».",
      "Miembros del Jurado:\n• Presidente: <<PRESIDENTE ETAPA 02>>\n• Integrante: <<INTEGRANTE>>\n• Secretario: <<SECRETARIO ETAPA 02>>",
      "Arequipa, <<FECHA_PUBLICACION>>.",
    ],
    firmas: [
      "<<PRESIDENTE ETAPA 02>>\nPresidente",
      "<<INTEGRANTE>>\nIntegrante",
      "<<SECRETARIO ETAPA 02>>\nSecretario",
    ],
  },
  {
    tipo: "ANEXO_01_DJ",
    nombre: "Anexo N° 01 — Autorización publicación digital repositorio",
    etapa: "E2",
    estilo: "carta",
    titulo: "ANEXO 01\nDECLARACIÓN JURADA Y AUTORIZACIÓN DE PUBLICACIÓN DIGITAL",
    parrafos: [
      "Lugar y Fecha: Arequipa, <<FECHA_EMISION>>.",
      "DATOS DEL AUTOR:\n• Apellidos y Nombres: <<NOMBRES>>\n• DNI: <<DNI>>\n• CUI: <<CUI>>\n• Teléfono: <<TELEFONO>>\n• Correo: <<CORREO>>\n• Facultad: FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\n• Programa: <<PROGRAMA>>",
      "Título de la Investigación: «<<TESIS>>»",
      "Por el presente documento autorizo a la Universidad Nacional de San Agustín de Arequipa a publicar en formato digital y en acceso abierto el trabajo de investigación en el Repositorio Institucional de la UNSA.",
    ],
    firmas: ["<<NOMBRES>>\nFirma del Autor\nDNI N° <<DNI>>"],
  },
  {
    tipo: "ANEXO_01_DJ_P1",
    nombre: "Anexo N° 01 — Declaración jurada — Participante 01",
    etapa: "E2",
    estilo: "carta",
    titulo: "ANEXO 01\nDECLARACIÓN JURADA Y AUTORIZACIÓN DE PUBLICACIÓN DIGITAL",
    parrafos: [
      "Lugar y Fecha: Arequipa, <<FECHA_EMISION>>.",
      "DATOS DEL AUTOR:\n• Apellidos y Nombres: <<NOMBRES>>\n• DNI: <<DNI>>\n• CUI: <<CUI>>\n• Teléfono: <<TELEFONO>>\n• Correo: <<CORREO>>\n• Facultad: FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\n• Programa: <<PROGRAMA>>",
      "Título de la Investigación: «<<TESIS>>»",
      "Por el presente documento autorizo a la Universidad Nacional de San Agustín de Arequipa a publicar en formato digital y en acceso abierto el trabajo de investigación en el Repositorio Institucional de la UNSA.",
    ],
    firmas: ["<<NOMBRES>>\nFirma del Autor\nDNI N° <<DNI>>"],
  },
  {
    tipo: "ANEXO_01_DJ_P2",
    nombre: "Anexo N° 01 — Declaración jurada — Participante 02",
    etapa: "E2",
    estilo: "carta",
    titulo: "ANEXO 01\nDECLARACIÓN JURADA Y AUTORIZACIÓN DE PUBLICACIÓN DIGITAL",
    parrafos: [
      "Lugar y Fecha: Arequipa, <<FECHA_EMISION>>.",
      "DATOS DEL AUTOR:\n• Apellidos y Nombres: <<NOMBRES02>>\n• DNI: <<DNI02>>\n• CUI: <<CUI02>>\n• Teléfono: <<TELEFONO02>>\n• Correo: <<CORREO02>>\n• Facultad: FACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\n• Programa: <<PROGRAMA>>",
      "Título de la Investigación: «<<TESIS>>»",
      "Por el presente documento autorizo a la Universidad Nacional de San Agustín de Arequipa a publicar en formato digital y en acceso abierto el trabajo de investigación en el Repositorio Institucional de la UNSA.",
    ],
    firmas: ["<<NOMBRES02>>\nFirma del Autor\nDNI N° <<DNI02>>"],
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
      "ANEXO 2: PORTADA DE SEGUNDA ESPECIALIDAD",
      "Tesis presentada por:",
      "<<NOM_MIN>>",
      "Para optar el Título de:",
      "<<PROGR_MIN>>",
      "Asesor: <<ASESOR>>",
      "AREQUIPA – PERÚ",
      "<<ANIO>>",
    ],
    firmas: [],
  },
  {
    tipo: "OBSERVACIONES_TESIS",
    nombre: "Formato de observaciones de borrador de tesis",
    etapa: "E2",
    estilo: "carta",
    titulo: "FORMATO DE OBSERVACIONES DEL BORRADOR DE TESIS",
    parrafos: [
      "Sr. Director de la Unidad de Segunda Especialidad de la Facultad de Ingeniería de Producción y Servicios de la UNSA.",
      "Remito a Ud. las opiniones y/o recomendaciones presentadas por los Docentes Evaluadores de Tesis titulado: «<<TESIS>>», presentado por: <<NOMBRES>>.",
      "Los cuales deberán ser subsanadas en un periodo máximo de 08 días hábiles contados a partir de la recepción del presente formato, de acuerdo al Reglamento de la FIPS.",
      "Arequipa, <<FECHA DE OBSERVACIONES 02>>.",
      "OPINIONES Y/O RECOMENDACIONES:\n<<RECOMENDACIONES_TESIS>>",
      "EVALUADORES:\n• Presidente: <<PRESIDENTE ETAPA 02>>\n• Integrante: <<INTEGRANTE>>\n• Asesor: <<ASESOR>>",
    ],
    firmas: ["<<PRESIDENTE ETAPA 02>>\nPresidente de la Terna del Jurado de Tesis"],
  },
  {
    tipo: "INFORME_SIMILITUD",
    nombre: "Informe de similitud Turnitin",
    etapa: "E2",
    estilo: "carta",
    titulo: "INFORME DE SIMILITUD N° <<INFORME_SIMILITUD_NUM>>-USE-FIPS/SISGRAD",
    parrafos: [
      "A: <<DECANO>>\nDecano(a) de la Facultad de Ingeniería de Producción y Servicios",
      "De: Dra. Elizabeth Enriqueta Vidal Duarte\nDirectora de la Unidad de Investigación de la FIPS",
      "Asunto: Informe de Similitud - Expediente <<CODIGO>>\nFecha: Arequipa, <<FECHA DE SIMILITUD>>",
      "Mediante el presente cumplo con informar que <<NOMBRES>> ha presentado su trabajo de investigación titulado: «<<TESIS>>», para optar el Título de Segunda Especialidad en <<PROGRAMA>>.",
      "De la revisión del referido trabajo, haciendo uso de la herramienta de originalidad TURNITIN institucional, se concluye que cuenta con un porcentaje de similitud de: <<SIMILITUD>> %.",
      "Lo que hago de su conocimiento a efecto de proceder con el trámite respectivo.",
    ],
    firmas: [
      "Dra. Elizabeth Enriqueta Vidal Duarte\nDirectora de la Unidad de Investigación — FIPS",
    ],
  },
  {
    tipo: "INVITACION_PUBLICA",
    nombre: "Invitación pública a sustentación",
    etapa: "E2",
    estilo: "carta",
    titulo:
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA\nFACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\nUNIDAD DE SEGUNDA ESPECIALIDAD\nINVITACIÓN PÚBLICA",
    parrafos: [
      "<<PROGRAMA>>",
      "Se invita al público en general a la sustentación pública de la Tesis titulada: «<<TESIS>>», para optar el Título de Segunda Especialidad en <<PROGRAMA>>.",
      "Presentado por: <<NOMBRES>>",
      "JURADOS:\n• Presidente: <<PRESIDENTE ETAPA 02>>\n• Integrante: <<INTEGRANTE>>\n• Secretario: <<SECRETARIO ETAPA 02>>\n• Suplente: <<SUPLENTE ETAPA 02>>",
      "FECHA: <<FECHA>>\nHORA: <<HORA>>\nLUGAR: <<LUGAR SUSTENTACION>>",
      "Arequipa, <<FECHA_INVITACION>>.",
    ],
    firmas: [
      "<<DIRECTOR_USE>>\nDirector de la Unidad de Segunda Especialidad\nFacultad de Ingeniería de Producción y Servicios",
    ],
  },
  {
    tipo: "OFICIO_OTI_SIMILITUD",
    nombre: "Oficio a OTI para reporte de similitud",
    etapa: "E2",
    estilo: "carta",
    titulo: "OFICIO N° <<OFICIO_OTI>>-USE/FIPS\nSOLICITUD DE REPORTE DE SIMILITUD",
    parrafos: [
      "Arequipa, <<FECHA_OFICIO_OTI>>.",
      "Señor:\nMg. PICCONE DIAZ LUIS RENAN FELIPE\nJefe de la Oficina de Tecnologías de la Información — UNSA\nPresente. –",
      "Asunto: Reporte de Similitud — Unidad de Segunda Especialidad FIPS",
      "Es grato dirigirme a usted para saludarlo cordialmente y hacerle llegar la Tesis presentada por: <<NOMBRES>> (expediente <<CODIGO>>).",
      "La Unidad de Segunda Especialidad de la FIPS le solicita pasar la Tesis por la herramienta TURNITIN para poder continuar con los procesos administrativos correspondientes.",
      "Atentamente,",
    ],
    firmas: [
      "<<DIRECTOR_USE>>\nDirector de la Unidad de Segunda Especialidad\nFacultad de Ingeniería de Producción y Servicios",
    ],
  },
  {
    tipo: "OFICIO_UGI_REPOSITORIO",
    nombre: "Oficio a UGI para repositorio institucional",
    etapa: "E2",
    estilo: "carta",
    titulo: "OFICIO N° <<OFICIO_UGI>>-USE/FIPS\nAUTORIZACIÓN DE PUBLICACIÓN DIGITAL",
    parrafos: [
      "“<<ANIO_LEMA>>”\nArequipa, <<FECHA_OFICIO_UGI>>.",
      "Señores:\nUNIDAD DE GESTIÓN DE LA INFORMACIÓN — UNSA\nPresente. –",
      "Asunto: Autorización de publicación digital",
      "Es grato dirigirme a usted para saludarlo cordialmente y hacerles llegar los expedientes de la Tesis de: <<NOMBRES>>, para obtener el Título de Segunda Especialidad en <<PROGRAMA>>.",
      "La Unidad de Segunda Especialidad le solicita la Autorización de publicación digital del trabajo de investigación «<<TESIS>>» en el Repositorio Institucional.",
      "Atentamente,",
    ],
    firmas: [
      "<<DIRECTOR_USE>>\nDirector de la Unidad de Segunda Especialidad\nFacultad de Ingeniería de Producción y Servicios",
    ],
  },
  {
    tipo: "RESOLUCION_DECANAL",
    nombre: "Resolución decanal de nombramiento de jurado",
    etapa: "E2",
    estilo: "carta",
    titulo:
      "UNIVERSIDAD NACIONAL DE SAN AGUSTÍN DE AREQUIPA\nFACULTAD DE INGENIERÍA DE PRODUCCIÓN Y SERVICIOS\nRESOLUCIÓN DECANAL N° <<DECANAL>>-FIPS\nNOMBRAMIENTO DE JURADO",
    parrafos: [
      "Arequipa, <<FECHA JURADOS>>.",
      "Vista la solicitud de <<NOMBRES>> y el expediente adjunto (<<CODIGO>>), a fin de optar el Título de Segunda Especialidad en <<PROGRAMA>>, así como el informe de Secretaría de la FIPS.",
      "CONSIDERANDO:\nQue esta Unidad conduce a optar el Título de Segunda Especialidad de conformidad con lo dispuesto en el Estatuto de la UNSA y el Reglamento General de Segundas Especialidades, en uso de las atribuciones conferidas a este Decanato:",
      "SE DECRETA:\nNombrar la Terna del Jurado, integrado por los señores Docentes:\n• Presidente: <<PRESIDENTE ETAPA 02>>\n• Integrante: <<INTEGRANTE>>\n• Secretario: <<SECRETARIO ETAPA 02>>\n• Suplente: <<SUPLENTE ETAPA 02>>\nPresidida por el primero de los nombrados.",
      "El Jurado revisará la documentación y estudiará el contenido de la Tesis titulada: «<<TESIS>>».\nEl Jurado dictaminará si cumple con los requisitos y comunicará su decisión en un plazo de veinte días hábiles.",
      "Regístrese, comuníquese y archívese.",
    ],
    firmas: ["<<DECANO>>\nDecano — FIPS"],
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

/**
 * Resuelve el nombre oficial de archivo según el tipo y el número de tesistas (1 o 2).
 * Respeta rigurosamente los nombres provistos en las plantillas oficiales de la FIPS.
 */
export function resolverNombreArchivo(
  tipo: string,
  numTesistas = 1,
  formato: "pdf" | "docx" = "pdf",
): string {
  const sufijo = numTesistas > 1 ? "02 TESISTAS" : "01 TESISTA";
  const ext = formato;
  switch (tipo) {
    case "SOLICITUD_INSCRIPCION":
    case "ANEXO_17":
      return `ANEXO 17 - ${sufijo}.${ext}`;
    case "CARATULA_PLAN":
      return `CARATULA_PLAN DE TESIS.${ext}`;
    case "DECRETO_APROBACION":
      return `DECRETO - ${sufijo}.${ext}`;
    case "OFICIO_CIRCULAR_TERNA":
    case "OFICIO_CIRCULAR":
      return `OFICIO CIRCULAR- ${sufijo}.${ext}`;
    case "OBSERVACIONES_PLAN":
    case "OBSERVACIONES_PLAN_TESIS":
      return `OBSERVACIONES DE PLAN DE TESIS - ${sufijo}.${ext}`;
    // Etapa 02
    case "ACTA_CONFORMIDAD":
      return `ACTA DE CONFORMIDAD_TESIS - ${sufijo}.${ext}`;
    case "ACTA_DICTAMEN":
      return `ACTA DE DICTAMEN_TESIS - ${sufijo}.${ext}`;
    case "ACTA_SUSTENTACION":
      return `ACTA DE SUSTENTACIÓN - ${sufijo}.${ext}`;
    case "ANEXO_08":
    case "INFORME_ASESORAMIENTO":
      return `ANEXO N° 08 INFORME DE CONFORMIDAD DE ASESORAMIENTO - ${sufijo}.${ext}`;
    case "ANEXO_27":
      return `ANEXO N° 27 SOLICITUD (2) PARA OPTAR TITULO 2DA. ESPECIALIDAD - ${sufijo}.${ext}`;
    case "ANEXO_02_DJ":
      return `ANEXO N°2 - ${sufijo} - DECLARACIÓN JURADA.${ext}`;
    case "ANEXO_02_DJ_P1":
      return `ANEXO N°2  _ 01 PARTICPANTE - 02 TESISTA - DECLARACIÓN JURADA.${ext}`;
    case "ANEXO_02_DJ_P2":
      return `ANEXO N°2  _ 02 PARTICPANTE - 02 TESISTA - DECLARACIÓN JURADA.${ext}`;
    case "ANEXO_32_VERACIDAD":
      return `ANEXO N°32 DECLARACIÓN JURADA VERACIDAD DE LA INFORMACIÓN - ${numTesistas > 1 ? "02 TESISTAS" : "02 TESISTA"}.${ext}`;
    case "AUTORIZACION_IMPRESION":
      return `AUTORIZACIÓN DE IMPRESIÓN_TESIS - ${sufijo}.${ext}`;
    case "AUTORIZACION_PUBLICACION":
      return `AUTORIZACIÓN DE PUBLICACIÓN_TESIS - ${sufijo}.${ext}`;
    case "ANEXO_01_DJ":
      return `Anexo-1 - ${sufijo}.${ext}`;
    case "ANEXO_01_DJ_P1":
      return `Anexo-1 _ 01 PARTICIPANTE - 02 TESISTA.${ext}`;
    case "ANEXO_01_DJ_P2":
      return `Anexo-1 _ 02 PARTICIPANTE - 02 TESISTA.${ext}`;
    case "CARATULA_FINAL":
      return `CARATULA_PLAN DE TESIS FINAL - ${sufijo}.${ext}`;
    case "OBSERVACIONES_TESIS":
      return `FORMATO - FIPS FORMATO DE OBSERVACIONES DE TESIS - ${sufijo}.${ext}`;
    case "INFORME_SIMILITUD":
      return `FORMATO INFORME SIMILITUD 00X-UINVESTIGACION-FIPS-2026 (XX_) - ${sufijo}.${ext}`;
    case "INVITACION_PUBLICA":
      return `INVITACIÓN PÚBLICA_TESIS-${sufijo}.${ext}`;
    case "OFICIO_OTI_SIMILITUD":
      return `OFICIO N° 322-2026-USE-FIPS A OTI SIMILITUD - ${sufijo}.${ext}`;
    case "OFICIO_UGI_REPOSITORIO":
      return `OFICIO N° XXX-2026-USE-FIPS A UGI REPOSITORIO - ${sufijo}.${ext}`;
    case "RESOLUCION_DECANAL":
      return `RESOLUCIÓN DECANAL - ${sufijo}.${ext}`;
    default:
      return `${tipo.toLowerCase().replace(/_/g, "-")}.${ext}`;
  }
}

/**
 * Retorna el nombre de la subcarpeta de etapa institucional dentro del expediente en Google Drive.
 */
export function resolverSubcarpetaEtapa(etapa: EtapaPlantilla | string): string {
  if (etapa === "E1") return "01. Plan de Tesis";
  if (etapa === "E2") return "02. Desarrollo y Sustentacion";
  return "";
}

/**
 * Retorna el nombre del archivo al descargar según el estándar institucional:
 * {codigo} - {nombreOficialSegunPlantilla}.{ext}
 * Ejemplo: "SET005 - Anexo 17 — Solicitud de inscripción del plan de tesis.docx"
 */
export function resolverNombreArchivoDescarga(
  codigo: string,
  tipo: string,
  ext: "pdf" | "docx" = "docx",
): string {
  if (tipo === "ANEXO_01_DJ_P1") {
    return `${codigo} - Participante 01 - Anexo 01 - Declaración jurada.${ext}`;
  }
  if (tipo === "ANEXO_01_DJ_P2") {
    return `${codigo} - Participante 02 - Anexo 01 - Declaración jurada.${ext}`;
  }
  if (tipo === "ANEXO_02_DJ_P1") {
    return `${codigo} - Participante 01 - Anexo 02 - Declaración jurada no antecedentes.${ext}`;
  }
  if (tipo === "ANEXO_02_DJ_P2") {
    return `${codigo} - Participante 02 - Anexo 02 - Declaración jurada no antecedentes.${ext}`;
  }

  const p = plantillaDe(tipo);
  const titulo = p?.nombre ?? tipo.replace(/_/g, " ");
  const limpio = titulo
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${codigo} - ${limpio}.${ext}`;
}
