import { createHash, randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as esperar } from "node:timers/promises";

/** Cola local: no transporta rutas originales ni secretos. */
export async function extraerEnSandbox(
  archivo: FileHandle,
  cola: string,
  sha256?: string,
): Promise<unknown> {
  const latido = await stat(join(cola, "heartbeat"));
  if (Date.now() - latido.mtimeMs > 5_000) throw new Error("PDF_NO_EVALUABLE");
  const id = randomUUID();
  const directorio = join(cola, id);
  await mkdir(directorio, { mode: 0o700 });
  try {
    const copia = await open(join(directorio, "document.pdf"), "wx", 0o644);
    const hash = createHash("sha256");
    try {
      const bloque = Buffer.alloc(64 * 1024);
      let offset = 0;
      for (;;) {
        const { bytesRead } = await archivo.read(bloque, 0, bloque.length, offset);
        if (!bytesRead) break;
        if (offset + bytesRead > 50 * 1024 * 1024) throw new Error("PDF_NO_EVALUABLE");
        hash.update(bloque.subarray(0, bytesRead));
        await copia.write(bloque.subarray(0, bytesRead));
        offset += bytesRead;
      }
    } finally {
      await copia.close();
    }
    if (sha256 && hash.digest("hex") !== sha256) throw new Error("PDF_NO_EVALUABLE");
    await writeFile(join(directorio, "request.tmp"), JSON.stringify({ id, createdAt: Date.now() }));
    await rename(join(directorio, "request.tmp"), join(directorio, "request.json"));
    const limite = Date.now() + 25_000;
    while (Date.now() < limite) {
      try {
        const resultado = await open(join(directorio, "result.json"), "r");
        try {
          if ((await resultado.stat()).size > 600_000) throw new Error("PDF_NO_EVALUABLE");
          return JSON.parse(await resultado.readFile("utf8")) as unknown;
        } finally {
          await resultado.close();
        }
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      await esperar(100);
    }
    throw new Error("PDF_NO_EVALUABLE");
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
}
