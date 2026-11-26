import { createHash } from "node:crypto";

/**
 * Reglas de archivo de la Mesa de Partes (compartidas por el registro de la
 * solicitud y su subsanación desde el portal).
 *
 * Según «Procedimientos para titulación en la Segunda Especialidad FIPS»
 * (1ra etapa, req. 8) la fotografía es **siempre JPG**; el resto de requisitos
 * se presenta en PDF. El tipo se decide por los magic bytes, nunca por el
 * MIME o la extensión que declara el navegador.
 */

export type MimeSolicitud = "application/pdf" | "image/jpeg";

/** Requisito de fotografía (FOTO_ESTUDIANTE, FOTO_PARTICIPANTE_2 y alias legados). */
export function esTipoFoto(tipo: string): boolean {
  return tipo.toUpperCase().includes("FOTO");
}

function esPdf(bytes: Uint8Array): boolean {
  // %PDF-
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function esJpeg(bytes: Uint8Array): boolean {
  // FF D8 FF (SOI + primer marcador)
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * MIME real del archivo si cumple el formato exigido por su requisito, o un
 * mensaje de error listo para el usuario.
 */
export function validarArchivoSolicitud(
  tipo: string,
  filename: string,
  bytes: Uint8Array,
): { ok: true; mime: MimeSolicitud } | { ok: false; mensaje: string } {
  if (esTipoFoto(tipo)) {
    return esJpeg(bytes)
      ? { ok: true, mime: "image/jpeg" }
      : { ok: false, mensaje: `La fotografía "${filename}" debe ser una imagen JPG` };
  }
  return esPdf(bytes)
    ? { ok: true, mime: "application/pdf" }
    : { ok: false, mensaje: `El archivo "${filename}" no es un PDF válido` };
}

/**
 * Nombre en disco: prefijo del requisito (dos participantes pueden subir
 * "foto.jpg") + versión, para no pisar el archivo anterior al subsanar.
 */
export function nombreEnDisco(tipo: string, filename: string, version = 1): string {
  const base = (filename.split(/[\\/]/).pop() ?? "documento")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "");
  const prefijo = tipo.replace(/[^A-Za-z0-9_-]/g, "_");
  return version > 1 ? `${prefijo}-v${version}-${base}` : `${prefijo}-${base}`;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
