import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, type ReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import type { AlmacenamientoPort } from "./almacenamiento.port.js";

/** Solo nombres planos y seguros (sin rutas, sin `..`). */
export function nombreSeguro(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "";
  const limpio = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  if (!limpio) throw new Error("Nombre de archivo inválido");
  return limpio;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Almacenamiento local Lean: /var/data/titulacion-docs (volumen Docker en prod). */
export class LocalStorageService implements AlmacenamientoPort {
  private readonly baseDir: string;

  /** La base se resuelve a ruta absoluta: lo guardado en DB no depende del cwd. */
  constructor(baseDir = process.env.DOCS_VOLUME_PATH ?? "./var/data/titulacion-docs") {
    this.baseDir = resolve(baseDir);
  }

  /** Cuarentena hermana al volumen servido: nunca es accesible por X-Accel. */
  async prepararPdf(stream: Readable) {
    const cuarentena = `${this.baseDir}-cuarentena`;
    await mkdir(cuarentena, { recursive: true, mode: 0o700 });
    const dir = await mkdtemp(join(cuarentena, "upload-"));
    const temporal = join(dir, "documento.pdf");
    const archivo = await open(temporal, "wx", 0o600);
    let bytes = 0;
    let cabecera = new Uint8Array(0);
    const hash = createHash("sha256");
    let guardado: string | null = null;
    try {
      for await (const chunk of stream) {
        const datos = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += datos.length;
        if (bytes > 50 * 1024 * 1024) throw new Error("DOCUMENTO_EXCEDIDO");
        if (cabecera.length < 5)
          cabecera = new Uint8Array(
            Buffer.concat([cabecera, datos.subarray(0, 5 - cabecera.length)]),
          );
        hash.update(datos);
        let escritos = 0;
        while (escritos < datos.length)
          escritos += (await archivo.write(datos, escritos)).bytesWritten;
      }
      await archivo.sync();
    } catch (error) {
      await archivo.close();
      await rm(dir, { recursive: true, force: true });
      throw error;
    }
    await archivo.close();
    const sha256 = hash.digest("hex");
    return {
      bytes,
      cabecera,
      guardar: async (expedienteId: string, nombre: string) => {
        if (!UUID.test(expedienteId)) throw new Error("Identificador inválido");
        const destino = join(this.baseDir, expedienteId);
        await mkdir(destino, { recursive: true });
        guardado = join(
          destino,
          `${nombreSeguro(nombre).replace(/\.pdf$/u, "")}_${randomUUID()}.pdf`,
        );
        // La cuarentena y el bind mount pueden pertenecer a distintos filesystems.
        // Copia del SO sin buffer Node y sin sobrescritura; la API lo publica tras commit.
        await copyFile(temporal, guardado, constants.COPYFILE_EXCL);
        return { ruta: guardado, sha256 };
      },
      limpiar: async (conservar = false) => {
        await rm(dir, { recursive: true, force: true });
        if (guardado && !conservar) await rm(guardado, { force: true });
      },
    };
  }

  async save(
    expedienteId: string,
    filename: string,
    bytes: Uint8Array,
    subcarpeta?: string,
  ): Promise<{ ruta: string; sha256: string }> {
    if (!UUID.test(expedienteId)) throw new Error("Identificador de expediente inválido");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const dir = subcarpeta
      ? join(this.baseDir, expedienteId, nombreSeguro(subcarpeta))
      : join(this.baseDir, expedienteId);
    await mkdir(dir, { recursive: true });
    const ruta = join(dir, nombreSeguro(filename));
    await writeFile(ruta, bytes);
    return { ruta, sha256 };
  }

  /** Ruta interna Nginx para X-Accel-Redirect: /protected-files/<exp>/<…> */
  accelPath(ruta: string): string | null {
    const rel = this.relativa(ruta);
    return rel ? `/protected-files/${rel.split(sep).join("/")}` : null;
  }

  /**
   * Stream de lectura (entrega sin Nginx, p. ej. en desarrollo): nunca
   * bufferiza el PDF completo en memoria. `null` si la ruta sale del volumen.
   */
  async abrir(ruta: string): Promise<{ stream: ReadStream; bytes: number } | null> {
    if (!this.relativa(ruta)) return null;
    try {
      const info = await stat(ruta);
      if (!info.isFile()) return null;
      return { stream: createReadStream(ruta), bytes: info.size };
    } catch {
      return null;
    }
  }

  /** Ruta relativa al volumen, o null si apunta fuera de él. */
  private relativa(ruta: string): string | null {
    const rel = relative(resolve(this.baseDir), resolve(ruta));
    if (!rel || rel.startsWith("..") || resolve(rel) === rel) return null;
    return rel;
  }
}
