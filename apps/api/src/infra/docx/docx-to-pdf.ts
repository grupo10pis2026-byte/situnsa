import { Buffer } from "node:buffer";

const GOTENBERG_URL = process.env.GOTENBERG_URL || "http://localhost:3002";

/**
 * Convierte un Buffer DOCX a PDF usando el microservicio Gotenberg (LibreOffice headless).
 * Preserva 100% de la fidelidad visual de OpenXML: tablas, escudos, tipografías y saltos de página.
 */
export async function convertirDocxAPdf(
  docxBuffer: Buffer,
  nombreArchivo = "documento.docx",
): Promise<Buffer> {
  const formData = new FormData();
  const blob = new Blob([docxBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  formData.append(
    "files",
    blob,
    nombreArchivo.endsWith(".docx") ? nombreArchivo : `${nombreArchivo}.docx`,
  );

  const url = `${GOTENBERG_URL.replace(/\/$/, "")}/forms/libreoffice/convert`;

  const respuesta = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!respuesta.ok) {
    const errorText = await respuesta.text().catch(() => "");
    throw new Error(
      `Error al convertir DOCX a PDF con Gotenberg (${respuesta.status}): ${errorText || respuesta.statusText}`,
    );
  }

  const arrayBuffer = await respuesta.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Verifica si el servicio Gotenberg está disponible y saludable.
 */
export async function verificarSaludGotenberg(): Promise<boolean> {
  try {
    const url = `${GOTENBERG_URL.replace(/\/$/, "")}/health`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
