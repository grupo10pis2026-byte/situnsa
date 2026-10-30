import { z } from "zod";

/**
 * Catálogo canónico de formatos y documentos para la modalidad de 1 Tesista.
 */

export const DOCUMENTOS_1_TESISTA_ETAPA_01 = [
  "ANEXO_17",
  "CARATULA_PLAN",
  "DECRETO_APROBACION",
  "ETIQUETAS",
  "OBSERVACIONES_PLAN",
  "OFICIO_CIRCULAR_TERNA",
] as const;

export type Documento1TesistaEtapa01 = (typeof DOCUMENTOS_1_TESISTA_ETAPA_01)[number];
export const Documento1TesistaEtapa01Schema = z.enum(DOCUMENTOS_1_TESISTA_ETAPA_01);

export const DOCUMENTOS_1_TESISTA_ETAPA_02 = [
  "ACTA_CONFORMIDAD",
  "ACTA_DICTAMEN",
  "ACTA_SUSTENTACION",
  "ANEXO_08",
  "ANEXO_27",
  "ANEXO_02_DJ",
  "ANEXO_32_VERACIDAD",
  "ANEXO_01_DJ",
  "AUTORIZACION_IMPRESION",
  "AUTORIZACION_PUBLICACION",
  "CARATULA_FINAL",
  "OBSERVACIONES_TESIS",
  "INFORME_SIMILITUD",
  "INVITACION_PUBLICA",
  "OFICIO_OTI_SIMILITUD",
  "OFICIO_UGI_REPOSITORIO",
  "RESOLUCION_DECANAL",
] as const;

export type Documento1TesistaEtapa02 = (typeof DOCUMENTOS_1_TESISTA_ETAPA_02)[number];
export const Documento1TesistaEtapa02Schema = z.enum(DOCUMENTOS_1_TESISTA_ETAPA_02);

export const ARCHIVOS_FISICOS_1_TESISTA_E1: Record<Documento1TesistaEtapa01, string> = {
  ANEXO_17: "ANEXO 17 - 01 TESISTA.docx",
  CARATULA_PLAN: "CARATULA_PLAN DE TESIS.docx",
  DECRETO_APROBACION: "DECRETO - 01 TESISTA.docx",
  ETIQUETAS: "ETIQUETAS.docx",
  OBSERVACIONES_PLAN: "OBSERVACIONES DE PLAN DE TESIS - 01 TESISTA.docx",
  OFICIO_CIRCULAR_TERNA: "OFICIO CIRCULAR- 01 TESISTA.docx",
};

export const ARCHIVOS_FISICOS_1_TESISTA_E2: Record<Documento1TesistaEtapa02, string> = {
  ACTA_CONFORMIDAD: "ACTA DE CONFORMIDAD_TESIS - 01 TESISTA.docx",
  ACTA_DICTAMEN: "ACTA DE DICTAMEN_TESIS - 01 TESISTA.docx",
  ACTA_SUSTENTACION: "ACTA DE SUSTENTACIÓN - 01 TESISTA.docx",
  ANEXO_08: "ANEXO N° 08 INFORME DE CONFORMIDAD DE ASESORAMIENTO - 01 TESISTA.docx",
  ANEXO_27: "ANEXO N° 27 SOLICITUD (2) PARA OPTAR TITULO 2DA. ESPECIALIDAD - 01 TESISTA.docx",
  ANEXO_02_DJ: "ANEXO N°2 - 01 TESISTA - DECLARACIÓN JURADA.docx",
  ANEXO_32_VERACIDAD: "ANEXO N°32 DECLARACIÓN JURADA VERACIDAD DE LA INFORMACIÓN - 01 TESISTA.docx",
  ANEXO_01_DJ: "Anexo-1 - 01 TESISTA.docx",
  AUTORIZACION_IMPRESION: "AUTORIZACIÓN DE IMPRESIÓN_TESIS - 01 TESISTA.docx",
  AUTORIZACION_PUBLICACION: "AUTORIZACIÓN DE PUBLICACIÓN_TESIS - 01 TESISTA.docx",
  CARATULA_FINAL: "CARATULA_PLAN DE TESIS FINAL - 01 TESISTA.docx",
  OBSERVACIONES_TESIS: "FORMATO - FIPS FORMATO DE OBSERVACIONES DE TESIS - 01 TESISTA.docx",
  INFORME_SIMILITUD:
    "FORMATO INFORME SIMILITUD 00X-UINVESTIGACION-FIPS-2026 (XX_) - 01 TESISTA.docx",
  INVITACION_PUBLICA: "INVITACIÓN PÚBLICA_TESIS-01 TESISTA.docx",
  OFICIO_OTI_SIMILITUD: "OFICIO N° 322-2026-USE-FIPS A OTI SIMILITUD - 01 TESISTA.docx",
  OFICIO_UGI_REPOSITORIO: "OFICIO N° XXX-2026-USE-FIPS A UGI REPOSITORIO - 01 TESISTA.docx",
  RESOLUCION_DECANAL: "RESOLUCIÓN DECANAL - 01 TESISTA.docx",
};

export const TOTAL_DOCUMENTOS_1_TESISTA = {
  ETAPA_01: DOCUMENTOS_1_TESISTA_ETAPA_01.length, // 6
  ETAPA_02: DOCUMENTOS_1_TESISTA_ETAPA_02.length, // 17
  TOTAL: DOCUMENTOS_1_TESISTA_ETAPA_01.length + DOCUMENTOS_1_TESISTA_ETAPA_02.length, // 23
} as const;

/**
 * Valida si una lista de tipos documentales cubre la totalidad de la etapa para 1 tesista.
 */
export function verificarCompletitud1Tesista(
  etapa: "E1" | "E2" | "ETAPA01" | "ETAPA02",
  tiposPresentes: string[],
): { completo: boolean; totalEsperado: number; faltantes: string[] } {
  const esE1 = etapa === "E1" || etapa === "ETAPA01";
  const esperados = esE1 ? DOCUMENTOS_1_TESISTA_ETAPA_01 : DOCUMENTOS_1_TESISTA_ETAPA_02;
  const setPresentes = new Set(tiposPresentes.map((t) => t.toUpperCase()));
  const faltantes = esperados.filter((tipo) => !setPresentes.has(tipo));

  return {
    completo: faltantes.length === 0,
    totalEsperado: esperados.length,
    faltantes: [...faltantes],
  };
}

/**
 * Catálogo canónico de formatos y documentos para la modalidad de 2 Tesistas.
 */

export const DOCUMENTOS_2_TESISTAS_ETAPA_01 = [
  "ANEXO_17",
  "CARATULA_PLAN",
  "DECRETO_APROBACION",
  "ETIQUETAS",
  "OBSERVACIONES_PLAN",
  "OFICIO_CIRCULAR_TERNA",
] as const;

export type Documento2TesistasEtapa01 = (typeof DOCUMENTOS_2_TESISTAS_ETAPA_01)[number];
export const Documento2TesistasEtapa01Schema = z.enum(DOCUMENTOS_2_TESISTAS_ETAPA_01);

/**
 * Los 17 tipos documentales lógicos requeridos en Etapa 02 para 2 tesistas.
 */
export const DOCUMENTOS_2_TESISTAS_ETAPA_02 = [
  "ACTA_CONFORMIDAD",
  "ACTA_DICTAMEN",
  "ACTA_SUSTENTACION",
  "ANEXO_08",
  "ANEXO_27",
  "ANEXO_01_DJ",
  "ANEXO_02_DJ",
  "ANEXO_32_VERACIDAD",
  "AUTORIZACION_IMPRESION",
  "AUTORIZACION_PUBLICACION",
  "CARATULA_FINAL",
  "OBSERVACIONES_TESIS",
  "INFORME_SIMILITUD",
  "INVITACION_PUBLICA",
  "OFICIO_OTI_SIMILITUD",
  "OFICIO_UGI_REPOSITORIO",
  "RESOLUCION_DECANAL",
] as const;

export type Documento2TesistasEtapa02 = (typeof DOCUMENTOS_2_TESISTAS_ETAPA_02)[number];
export const Documento2TesistasEtapa02Schema = z.enum(DOCUMENTOS_2_TESISTAS_ETAPA_02);

/**
 * Claves documentales para los documentos desglosados individualmente por participante.
 */
export const DOCUMENTOS_INDIVIDUALES_2_TESISTAS = [
  "ANEXO_01_DJ_P1",
  "ANEXO_01_DJ_P2",
  "ANEXO_02_DJ_P1",
  "ANEXO_02_DJ_P2",
] as const;

export type DocumentoIndividual2Tesistas = (typeof DOCUMENTOS_INDIVIDUALES_2_TESISTAS)[number];
export const DocumentoIndividual2TesistasSchema = z.enum(DOCUMENTOS_INDIVIDUALES_2_TESISTAS);

export type AlcanceDocumento = "expediente" | "participante";

export interface MetadataTipoDocumento2Tesistas {
  tipo: Documento2TesistasEtapa02;
  alcance: AlcanceDocumento;
  subdocumentos?: readonly DocumentoIndividual2Tesistas[];
  archivosFisicos: readonly string[];
}

export const METADATA_DOCUMENTOS_2_TESISTAS_E2: Record<
  Documento2TesistasEtapa02,
  MetadataTipoDocumento2Tesistas
> = {
  ACTA_CONFORMIDAD: {
    tipo: "ACTA_CONFORMIDAD",
    alcance: "expediente",
    archivosFisicos: ["ACTA DE CONFORMIDAD_TESIS - 02 TESISTA.docx"],
  },
  ACTA_DICTAMEN: {
    tipo: "ACTA_DICTAMEN",
    alcance: "expediente",
    archivosFisicos: ["ACTA DE DICTAMEN_TESIS 02 TESISTA.docx"],
  },
  ACTA_SUSTENTACION: {
    tipo: "ACTA_SUSTENTACION",
    alcance: "expediente",
    archivosFisicos: ["ACTA DE SUSTENTACIÓN - 02 TESISTA.docx"],
  },
  ANEXO_08: {
    tipo: "ANEXO_08",
    alcance: "expediente",
    archivosFisicos: ["ANEXO N° 08 INFORME DE CONFORMIDAD DE ASESORAMIENTO - 02 TESISTA.docx"],
  },
  ANEXO_27: {
    tipo: "ANEXO_27",
    alcance: "expediente",
    archivosFisicos: [
      "ANEXO N° 27 SOLICITUD (2) PARA OPTAR TITULO 2DA. ESPECIALIDAD - 02 TESISTA.docx",
    ],
  },
  ANEXO_01_DJ: {
    tipo: "ANEXO_01_DJ",
    alcance: "participante",
    subdocumentos: ["ANEXO_01_DJ_P1", "ANEXO_01_DJ_P2"],
    archivosFisicos: [
      "Anexo-1 _ 01 PARTICIPANTE - 02 TESISTA.docx",
      "Anexo-1 _ 02 PARTICIPANTE - 02 TESISTA.docx",
    ],
  },
  ANEXO_02_DJ: {
    tipo: "ANEXO_02_DJ",
    alcance: "participante",
    subdocumentos: ["ANEXO_02_DJ_P1", "ANEXO_02_DJ_P2"],
    archivosFisicos: [
      "ANEXO N°2  _ 01 PARTICPANTE - 02 TESISTA - DECLARACIÓN JURADA.docx",
      "ANEXO N°2  _ 02 PARTICPANTE - 02 TESISTA - DECLARACIÓN JURADA.docx",
    ],
  },
  ANEXO_32_VERACIDAD: {
    tipo: "ANEXO_32_VERACIDAD",
    alcance: "expediente",
    archivosFisicos: [
      "ANEXO N°32 DECLARACIÓN JURADA VERACIDAD DE LA INFORMACIÓN - 02 TESISTA.docx",
    ],
  },
  AUTORIZACION_IMPRESION: {
    tipo: "AUTORIZACION_IMPRESION",
    alcance: "expediente",
    archivosFisicos: ["AUTORIZACIÓN DE IMPRESIÓN_TESIS - 02 TESISTA.docx"],
  },
  AUTORIZACION_PUBLICACION: {
    tipo: "AUTORIZACION_PUBLICACION",
    alcance: "expediente",
    archivosFisicos: ["AUTORIZACIÓN DE PUBLICACIÓN_TESIS - 02 TESISTA.docx"],
  },
  CARATULA_FINAL: {
    tipo: "CARATULA_FINAL",
    alcance: "expediente",
    archivosFisicos: ["CARATULA_PLAN DE TESIS FINAL - 02 TESISTA.docx"],
  },
  OBSERVACIONES_TESIS: {
    tipo: "OBSERVACIONES_TESIS",
    alcance: "expediente",
    archivosFisicos: ["FORMATO - FIPS FORMATO DE OBSERVACIONES DE TESIS - 02 TESISTA.docx"],
  },
  INFORME_SIMILITUD: {
    tipo: "INFORME_SIMILITUD",
    alcance: "expediente",
    archivosFisicos: [
      "FORMATO INFORME SIMILITUD 00X-UINVESTIGACION-FIPS-2026 (XX_) - 02TESISTA.docx",
    ],
  },
  INVITACION_PUBLICA: {
    tipo: "INVITACION_PUBLICA",
    alcance: "expediente",
    archivosFisicos: ["INVITACIÓN PÚBLICA_TESIS - 02 TESISTA.docx"],
  },
  OFICIO_OTI_SIMILITUD: {
    tipo: "OFICIO_OTI_SIMILITUD",
    alcance: "expediente",
    archivosFisicos: ["OFICIO N° 322-2026-USE-FIPS A OTI SIMILITUD - 02 TESISTA.docx"],
  },
  OFICIO_UGI_REPOSITORIO: {
    tipo: "OFICIO_UGI_REPOSITORIO",
    alcance: "expediente",
    archivosFisicos: ["OFICIO N° XXX-2026-USE-FIPS A UGI REPOSITORIO - 02 TESISTA.docx"],
  },
  RESOLUCION_DECANAL: {
    tipo: "RESOLUCION_DECANAL",
    alcance: "expediente",
    archivosFisicos: ["RESOLUCIÓN DECANAL - 02 TESISTA.docx"],
  },
};

export const ARCHIVOS_FISICOS_2_TESISTAS_E1: Record<Documento2TesistasEtapa01, string> = {
  ANEXO_17: "ANEXO 17 - 02 TESISTA.docx",
  CARATULA_PLAN: "CARATULA_PLAN DE TESIS - 02 TESISTA.docx",
  DECRETO_APROBACION: "DECRETO - 02 TESISTA.docx",
  ETIQUETAS: "ETIQUETAS.docx",
  OBSERVACIONES_PLAN: "OBSERVACIONES DE PLAN DE TESIS - 02 TESISTA.docx",
  OFICIO_CIRCULAR_TERNA: "OFICIO CIRCULAR- 02 TESISTA.docx",
};

export const TOTAL_DOCUMENTOS_2_TESISTAS = {
  ETAPA_01: DOCUMENTOS_2_TESISTAS_ETAPA_01.length, // 6
  ETAPA_02: DOCUMENTOS_2_TESISTAS_ETAPA_02.length, // 17
  ETAPA_02_TIPOS: DOCUMENTOS_2_TESISTAS_ETAPA_02.length, // 17
  ETAPA_02_ARCHIVOS: 19,
  ETAPA_02_ARCHIVOS_FISICOS: 19,
  TOTAL_ARCHIVOS: DOCUMENTOS_2_TESISTAS_ETAPA_01.length + 19, // 25 archivos
} as const;

/**
 * Valida si una lista de tipos documentales cubre la totalidad de la etapa para 2 tesistas.
 * Admite tanto tipos lógicos (ej: ANEXO_01_DJ) como subtipos por participante (ANEXO_01_DJ_P1 y P2).
 */
export function verificarCompletitud2Tesistas(
  etapa: "E1" | "E2" | "ETAPA01" | "ETAPA02",
  tiposPresentes: string[],
): {
  completo: boolean;
  totalEsperado: number;
  totalTiposEsperado: number;
  totalArchivosEsperado: number;
  faltantes: string[];
} {
  const esE1 = etapa === "E1" || etapa === "ETAPA01";
  if (esE1) {
    const setPresentes = new Set(tiposPresentes.map((t) => t.toUpperCase()));
    const faltantes = DOCUMENTOS_2_TESISTAS_ETAPA_01.filter((tipo) => !setPresentes.has(tipo));
    return {
      completo: faltantes.length === 0,
      totalEsperado: DOCUMENTOS_2_TESISTAS_ETAPA_01.length,
      totalTiposEsperado: DOCUMENTOS_2_TESISTAS_ETAPA_01.length,
      totalArchivosEsperado: DOCUMENTOS_2_TESISTAS_ETAPA_01.length,
      faltantes: [...faltantes],
    };
  }

  const setPresentes = new Set(tiposPresentes.map((t) => t.toUpperCase()));
  const faltantes: string[] = [];

  for (const tipo of DOCUMENTOS_2_TESISTAS_ETAPA_02) {
    const meta = METADATA_DOCUMENTOS_2_TESISTAS_E2[tipo];
    if (meta.alcance === "participante" && meta.subdocumentos) {
      const tienePadre = setPresentes.has(tipo);
      const tieneSubdocs = meta.subdocumentos.every((s) => setPresentes.has(s));
      if (!tienePadre && !tieneSubdocs) {
        faltantes.push(tipo);
      }
    } else {
      if (!setPresentes.has(tipo)) {
        faltantes.push(tipo);
      }
    }
  }

  return {
    completo: faltantes.length === 0,
    totalEsperado: DOCUMENTOS_2_TESISTAS_ETAPA_02.length,
    totalTiposEsperado: DOCUMENTOS_2_TESISTAS_ETAPA_02.length,
    totalArchivosEsperado: TOTAL_DOCUMENTOS_2_TESISTAS.ETAPA_02_ARCHIVOS,
    faltantes,
  };
}
