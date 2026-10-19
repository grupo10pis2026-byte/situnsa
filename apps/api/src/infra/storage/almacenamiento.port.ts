/**
 * Puerto de almacenamiento documental (port S-FIPS ADR-0005).
 * Implementación actual: disco local (LocalStorageService).
 * Futura: Drive/S3 sin tocar los use-cases.
 */
export interface AlmacenamientoPort {
  /**
   * Guarda el archivo bajo `<expedienteId>/[subcarpeta/]<filename>` y
   * devuelve la ruta interna + SHA-256 del contenido.
   */
  save(
    expedienteId: string,
    filename: string,
    bytes: Uint8Array,
    subcarpeta?: string,
  ): Promise<{ ruta: string; sha256: string }>;

  /**
   * Elimina un archivo físico del almacenamiento si existe.
   */
  delete?(ruta: string): Promise<void>;
}
