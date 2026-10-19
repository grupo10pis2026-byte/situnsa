import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

export interface ResultadoDocx {
  readonly buffer: Buffer;
  readonly pendientes: string[];
}

export function escapeXmlValue(str: string): string {
  const sanitized = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // En OpenXML, saltos de línea se expresan cerrando y reabriendo el run de texto con un <w:br/>
  return sanitized.split("\n").join('</w:t><w:br/><w:t xml:space="preserve">');
}

/**
 * Motor OpenXML DOCX: Reemplaza las etiquetas canónicas <<CAMPO>> y &lt;&lt;CAMPO&gt;&gt;
 * en el archivo .docx preservando estilos, fuentes, tablas y las imágenes internas (word/media/).
 * Aplica la regla del piloto Google Script: etiquetas sin valor se conservan con resaltado amarillo (#FFF59D).
 */
export function procesarDocxBuffer(
  plantillaBuffer: Buffer,
  datos: Readonly<Record<string, string>>,
): ResultadoDocx {
  const zip = new PizZip(plantillaBuffer);
  const pendientes = new Set<string>();

  const PATRON_TAG = /(?:<<|&lt;&lt;)([^<>&]+)(?:>>|&gt;&gt;)/g;

  // Archivos XML a procesar dentro del paquete .docx
  const archivosXml = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
  ];

  const tieneCoasesor = Boolean(
    (datos["COASESOR"] ?? datos["CO ASESOR"] ?? "").trim(),
  );

  for (const rutaXml of archivosXml) {
    const file = zip.file(rutaXml);
    if (!file) continue;

    let xml = file.asText();

    // Si no hay coasesor registrado, omitir el bloque de Coasesor en carátulas
    if (!tieneCoasesor) {
      // 1. Elimina la dupla de párrafos "Coasesor:" seguido de "<<COASESOR>>" en líneas separadas (misma estructura que Asesor)
      xml = xml.replace(
        /<w:p\b[^>]*>(?:(?!<w:p\b).)*?Coasesor:(?:(?!<w:p\b).)*?<\/w:p>\s*<w:p\b[^>]*>(?:(?!<w:p\b).)*?(?:COASESOR|CO ASESOR).*?<\/w:p>/gs,
        "",
      );
      // 2. Elimina si viniera en un solo párrafo "Coasesor: <<COASESOR>>"
      xml = xml.replace(
        /<w:p\b[^>]*>(?:(?!<w:p\b).)*?Coasesor:(?:(?!<w:p\b).)*?(?:COASESOR|CO ASESOR).*?<\/w:p>/gs,
        "",
      );
      // 3. Fallback defensivo: párrafo suelto de "Coasesor:"
      xml = xml.replace(
        /<w:p\b[^>]*>(?:(?!<w:p\b).)*?Coasesor:\s*<\/w:t>.*?<\/w:p>/gs,
        "",
      );
    } else {
      // Si tiene coasesor y alguna plantilla viniera con "Coasesor: <<COASESOR>>" en un solo párrafo,
      // asegurar que el nombre quede en la siguiente línea, de la misma forma que Asesor.
      xml = xml.replace(
        /<w:p\b([^>]*)>((?:(?!<w:p\b).)*?Coasesor:\s*<\/w:t><\/w:r>)\s*(<w:r\b[^>]*>(?:(?!<w:r\b).)*?(?:<<|&lt;&lt;)\s*(?:COASESOR|CO ASESOR)\s*(?:>>|&gt;&gt;).*?<\/w:p>)/gs,
        `<w:p$1>$2</w:p><w:p w:rsidR="00000000" w:rsidRDefault="00000000"><w:pPr><w:ind w:left="3686" w:firstLine="0"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Calibri" w:cs="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>$3`,
      );
    }

    xml = xml.replace(PATRON_TAG, (_match, tag) => {
      const clave = tag.trim().replace(/\s+/g, " ").toUpperCase();
      const valor = (datos[clave] ?? "").trim();
      if (valor) {
        return escapeXmlValue(valor);
      }
      if (clave === "COASESOR" || clave === "CO ASESOR") {
        return "";
      }
      pendientes.add(clave);
      return `</w:t></w:r><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">&lt;&lt;${clave}&gt;&gt;</w:t></w:r><w:r><w:t xml:space="preserve">`;
    });

    zip.file(rutaXml, xml);
  }

  const buffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  return {
    buffer,
    pendientes: [...pendientes].sort(),
  };
}

const DIR_MAESTRAS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/domain/plantillas/maestras",
);

const MAPA_ARCHIVOS: Record<string, { 1: string; 2: string }> = {
  // Etapa 01
  SOLICITUD_INSCRIPCION: { 1: "ANEXO 17 - 01 TESISTA.docx", 2: "ANEXO 17 - 02 TESISTA.docx" },
  ANEXO_17: { 1: "ANEXO 17 - 01 TESISTA.docx", 2: "ANEXO 17 - 02 TESISTA.docx" },
  CARATULA_PLAN: {
    1: "CARATULA_PLAN DE TESIS.docx",
    2: "CARATULA_PLAN DE TESIS - 02 TESISTA.docx",
  },
  DECRETO_APROBACION: { 1: "DECRETO - 01 TESISTA.docx", 2: "DECRETO - 02 TESISTA.docx" },
  OFICIO_CIRCULAR_TERNA: {
    1: "OFICIO CIRCULAR- 01 TESISTA.docx",
    2: "OFICIO CIRCULAR- 02 TESISTA.docx",
  },
  OFICIO_CIRCULAR: { 1: "OFICIO CIRCULAR- 01 TESISTA.docx", 2: "OFICIO CIRCULAR- 02 TESISTA.docx" },
  OBSERVACIONES_PLAN: {
    1: "OBSERVACIONES DE PLAN DE TESIS - 01 TESISTA.docx",
    2: "OBSERVACIONES DE PLAN DE TESIS - 02 TESISTA.docx",
  },
  OBSERVACIONES_PLAN_TESIS: {
    1: "OBSERVACIONES DE PLAN DE TESIS - 01 TESISTA.docx",
    2: "OBSERVACIONES DE PLAN DE TESIS - 02 TESISTA.docx",
  },
  ETIQUETAS: {
    1: "ETIQUETAS.docx",
    2: "ETIQUETAS.docx",
  },

  // Etapa 02
  ACTA_CONFORMIDAD: {
    1: "ACTA DE CONFORMIDAD_TESIS - 01 TESISTA.docx",
    2: "ACTA DE CONFORMIDAD_TESIS - 02 TESISTA.docx",
  },
  ACTA_DICTAMEN: {
    1: "ACTA DE DICTAMEN_TESIS - 01 TESISTA.docx",
    2: "ACTA DE DICTAMEN_TESIS 02 TESISTA.docx",
  },
  ACTA_SUSTENTACION: {
    1: "ACTA DE SUSTENTACIÓN - 01 TESISTA.docx",
    2: "ACTA DE SUSTENTACIÓN - 02 TESISTA.docx",
  },
  ANEXO_08: {
    1: "ANEXO N° 08 INFORME DE CONFORMIDAD DE ASESORAMIENTO - 01 TESISTA.docx",
    2: "ANEXO N° 08 INFORME DE CONFORMIDAD DE ASESORAMIENTO - 02 TESISTA.docx",
  },
  INFORME_ASESORAMIENTO: {
    1: "ANEXO N° 08 INFORME DE CONFORMIDAD DE ASESORAMIENTO - 01 TESISTA.docx",
    2: "ANEXO N° 08 INFORME DE CONFORMIDAD DE ASESORAMIENTO - 02 TESISTA.docx",
  },
  ANEXO_18: {
    1: "ANEXO N° 08 INFORME DE CONFORMIDAD DE ASESORAMIENTO - 01 TESISTA.docx",
    2: "ANEXO N° 08 INFORME DE CONFORMIDAD DE ASESORAMIENTO - 02 TESISTA.docx",
  },
  ANEXO_27: {
    1: "ANEXO N° 27 SOLICITUD (2) PARA OPTAR TITULO 2DA. ESPECIALIDAD - 01 TESISTA.docx",
    2: "ANEXO N° 27 SOLICITUD (2) PARA OPTAR TITULO 2DA. ESPECIALIDAD - 02 TESISTA.docx",
  },
  ANEXO_02_DJ: {
    1: "ANEXO N°2 - 01 TESISTA - DECLARACIÓN JURADA.docx",
    2: "ANEXO N°2  _ 01 PARTICPANTE - 02 TESISTA - DECLARACIÓN JURADA.docx",
  },
  ANEXO_02_DJ_P1: {
    1: "ANEXO N°2 - 01 TESISTA - DECLARACIÓN JURADA.docx",
    2: "ANEXO N°2  _ 01 PARTICPANTE - 02 TESISTA - DECLARACIÓN JURADA.docx",
  },
  ANEXO_02_DJ_P2: {
    1: "ANEXO N°2 - 01 TESISTA - DECLARACIÓN JURADA.docx",
    2: "ANEXO N°2  _ 02 PARTICPANTE - 02 TESISTA - DECLARACIÓN JURADA.docx",
  },
  ANEXO_32_VERACIDAD: {
    1: "ANEXO N°32 DECLARACIÓN JURADA VERACIDAD DE LA INFORMACIÓN - 02 TESISTA.docx",
    2: "ANEXO N°32 DECLARACIÓN JURADA VERACIDAD DE LA INFORMACIÓN 01 TESISTA.docx",
  },
  AUTORIZACION_IMPRESION: {
    1: "AUTORIZACIÓN DE IMPRESIÓN_TESIS - 01 TESISTA.docx",
    2: "AUTORIZACIÓN DE PUBLICACIÓN_TESIS - 02 TESISTA.docx",
  },
  AUTORIZACION_PUBLICACION: {
    1: "AUTORIZACIÓN DE PUBLICACIÓN_TESIS - 01 TESISTA.docx",
    2: "AUTORIZACIÓN DE PUBLICACIÓN_TESIS - 02 TESISTA.docx",
  },
  ANEXO_01_DJ: { 1: "Anexo-1 - 01 TESISTA.docx", 2: "Anexo-1 _ 01 PARTICIPANTE - 02 TESISTA.docx" },
  ANEXO_01_DJ_P1: {
    1: "Anexo-1 - 01 TESISTA.docx",
    2: "Anexo-1 _ 01 PARTICIPANTE - 02 TESISTA.docx",
  },
  ANEXO_01_DJ_P2: {
    1: "Anexo-1 - 01 TESISTA.docx",
    2: "Anexo-1 _ 02 PARTICIPANTE - 02 TESISTA.docx",
  },
  CARATULA_FINAL: {
    1: "CARATULA_PLAN DE TESIS FINAL - 01 TESISTA.docx",
    2: "CARATULA_PLAN DE TESIS FINAL - 02 TESISTA.docx",
  },
  OBSERVACIONES_TESIS: {
    1: "FORMATO - FIPS FORMATO DE OBSERVACIONES DE TESIS - 01 TESISTA.docx",
    2: "FORMATO - FIPS FORMATO DE OBSERVACIONES DE TESIS - 02 TESISTA.docx",
  },
  INFORME_SIMILITUD: {
    1: "FORMATO INFORME SIMILITUD 00X-UINVESTIGACION-FIPS-2026 (XX_) - 01 TESISTA.docx",
    2: "FORMATO INFORME SIMILITUD 00X-UINVESTIGACION-FIPS-2026 (XX_) - 02TESISTA.docx",
  },
  INVITACION_PUBLICA: {
    1: "INVITACIÓN PÚBLICA_TESIS-01 TESISTA.docx",
    2: "NVITACIÓN PÚBLICA_TESIS - 02 TESISTA.docx",
  },
  OFICIO_OTI_SIMILITUD: {
    1: "OFICIO N° 322-2026-USE-FIPS A OTI SIMILITUD - 01 TESISTA.docx",
    2: "OFICIO N° 322-2026-USE-FIPS A OTI SIMILITUD - 02 TESISTA.docx",
  },
  OFICIO_UGI_REPOSITORIO: {
    1: "OFICIO N° XXX-2026-USE-FIPS A UGI REPOSITORIO - 01 TESISTA.docx",
    2: "OFICIO N° XXX-2026-USE-FIPS A UGI REPOSITORIO - 02 TESISTA.docx",
  },
  RESOLUCION_DECANAL: {
    1: "RESOLUCIÓN DECANAL - 01 TESISTA.docx",
    2: "RESOLUCIÓN DECANAL - 02 TESISTA.docx",
  },
  ANEXO_33: {
    1: "RESOLUCIÓN DECANAL - 01 TESISTA.docx",
    2: "RESOLUCIÓN DECANAL - 02 TESISTA.docx",
  },
};

const ETAPAS_E1 = new Set([
  "SOLICITUD_INSCRIPCION",
  "ANEXO_17",
  "CARATULA_PLAN",
  "DECRETO_APROBACION",
  "OFICIO_CIRCULAR_TERNA",
  "OFICIO_CIRCULAR",
  "OBSERVACIONES_PLAN",
  "OBSERVACIONES_PLAN_TESIS",
  "ETIQUETAS",
]);

/**
 * Obtiene el buffer de la plantilla maestra oficial correspondiente según tipo y cantidad de participantes.
 */
export function obtenerPlantillaDocx(tipo: string, etapa: string, numTesistas = 1): Buffer | null {
  const config = MAPA_ARCHIVOS[tipo];
  if (!config) return null;

  const archivo = numTesistas > 1 ? config[2] : config[1];
  const subcarpeta = numTesistas > 1 ? "2tesistas" : "1tesista";
  const etapaDir = ETAPAS_E1.has(tipo) || etapa === "E1" ? "ETAPA01" : "ETAPA02";

  const rutaCompleta = join(DIR_MAESTRAS, subcarpeta, etapaDir, archivo);
  if (!existsSync(rutaCompleta)) {
    console.error(`[obtenerPlantillaDocx] No se encontró plantilla en: ${rutaCompleta}`);
    return null;
  }

  return readFileSync(rutaCompleta);
}
