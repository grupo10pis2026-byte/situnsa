/**
 * Infraestructura de POST /api/documentos/:id/analisis.
 * Coordina apertura segura, cola-sandbox.ts y extractor-worker.ts; no decide reglas académicas.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { extraerEnSandbox } from "./cola-sandbox.js";

const ResultadoExtraccionSchema = z.object({
  paginas: z
    .array(z.object({ numero: z.number().int().min(1).max(6), texto: z.string().max(100_000) }))
    .max(6),
  totalPaginas: z.number().int().positive(),
  rss: z.number().positive(),
  peakCgroupBytes: z.number().positive().optional(),
});
export type TextoPdf = z.infer<typeof ResultadoExtraccionSchema>;

/** No acepta rutas del cliente. Comprueba cada componente y abre sin seguir symlinks. */
export async function abrirPdfSeguro(ruta: string, base: string) {
  const raiz = await realpath(base);
  const candidato = resolve(ruta);
  const rel = relative(raiz, candidato);
  if (!rel || rel.startsWith("..") || resolve(rel) === rel) throw new Error("PDF_NO_EVALUABLE");
  let componente = raiz;
  for (const parte of rel.split(sep)) {
    componente = resolve(componente, parte);
    if ((await lstat(componente)).isSymbolicLink()) throw new Error("PDF_NO_EVALUABLE");
  }
  const fisica = await realpath(candidato);
  if (fisica !== candidato) throw new Error("PDF_NO_EVALUABLE");
  const archivo = await open(fisica, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const stat = await archivo.stat();
  if (!stat.isFile() || stat.size < 8 || stat.size > 50 * 1024 * 1024) {
    await archivo.close();
    throw new Error("PDF_NO_EVALUABLE");
  }
  return archivo;
}

/**
 * Abre el documento del servidor, comprueba su hash y valida el JSON del extractor.
 * Producción exige la cola Docker; el proceso directo se reserva a desarrollo y fixtures.
 * Cierra siempre el descriptor y convierte fallos de proceso en PDF_NO_EVALUABLE.
 */
export async function extraerPrimerasPaginas(
  ruta: string,
  base: string,
  sha256?: string,
): Promise<TextoPdf> {
  const archivo = await abrirPdfSeguro(ruta, base);
  const worker = fileURLToPath(
    new URL("../../../dist/infra/pdf/extractor-worker.js", import.meta.url),
  );
  try {
    if (sha256) {
      const hash = createHash("sha256");
      const bloque = Buffer.alloc(64 * 1024);
      let offset = 0;
      for (;;) {
        const { bytesRead } = await archivo.read(bloque, 0, bloque.length, offset);
        if (!bytesRead) break;
        hash.update(bloque.subarray(0, bytesRead));
        offset += bytesRead;
      }
      if (hash.digest("hex") !== sha256) throw new Error("PDF_NO_EVALUABLE");
    }
    if (process.env.PDF_EXTRACTOR_MODE === "docker-queue") {
      const cola = process.env.PDF_SANDBOX_QUEUE;
      if (!cola) throw new Error("PDF_NO_EVALUABLE");
      return ResultadoExtraccionSchema.parse(await extraerEnSandbox(archivo, cola, sha256));
    }
    // La ejecución directa se permite si se solicita explícitamente en PDF_EXTRACTOR_MODE=direct o en no-prod.
    if (process.env.NODE_ENV === "production" && process.env.PDF_EXTRACTOR_MODE !== "direct") {
      throw new Error("PDF_NO_EVALUABLE");
    }
    return await new Promise<TextoPdf>((resolveResultado, rechazar) => {
      const apiRoot = resolve(dirname(worker), "../../..");
      const repoRoot = resolve(apiRoot, "../..");
      const hijo = spawn(
        process.execPath,
        [
          "--max-old-space-size=128",
          "--permission",
          "--allow-worker",
          "--allow-addons",
          `--allow-fs-read=${dirname(worker)}`,
          `--allow-fs-read=${resolve(apiRoot, "node_modules")}`,
          `--allow-fs-read=${resolve(repoRoot, "node_modules")}`,
          worker,
        ],
        {
          env: { NODE_ENV: "production", PATH: process.env.PATH ?? "" },
          stdio: ["ignore", "pipe", "ignore", archivo.fd],
          windowsHide: true,
          cwd: dirname(worker),
        },
      );
      let salida = "";
      let terminado = false;
      // Resolver una sola vez evita que timeout, monitor y evento close compitan.
      const terminar = (error?: Error, resultado?: TextoPdf) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(timeout);
        clearInterval(monitor);
        if (error) {
          hijo.kill("SIGKILL");
          rechazar(error);
        } else if (resultado) resolveResultado(resultado);
      };
      const timeout = setTimeout(() => terminar(new Error("PDF_NO_EVALUABLE")), 20_000);
      const monitor = setInterval(() => {
        if (process.platform !== "linux" || !hijo.pid) return;
        void readFile(`/proc/${hijo.pid}/status`, "utf8")
          .then((status) => {
            const kb = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0);
            if (kb > 256 * 1024) terminar(new Error("PDF_NO_EVALUABLE"));
          })
          .catch(() => {});
      }, 100);
      hijo.stdout?.setEncoding("utf8");
      hijo.stdout?.on("data", (chunk: string) => {
        salida += chunk;
        if (salida.length > 600_000) terminar(new Error("PDF_NO_EVALUABLE"));
      });
      hijo.on("error", () => terminar(new Error("PDF_NO_EVALUABLE")));
      hijo.on("close", (codigo) => {
        if (codigo !== 0) return terminar(new Error("PDF_NO_EVALUABLE"));
        try {
          terminar(undefined, ResultadoExtraccionSchema.parse(JSON.parse(salida)));
        } catch {
          terminar(new Error("PDF_NO_EVALUABLE"));
        }
      });
    });
  } finally {
    await archivo.close();
  }
}
