/**
 * Pruebas de cola-sandbox.ts para POST /api/documentos/:id/analisis.
 * El supervisor se simula con archivos temporales: no necesitan Docker ni servicios externos.
 */
import { mkdir, mkdtemp, open, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extraerEnSandbox } from "./cola-sandbox.js";

let root = "";
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pis-queue-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Simula un supervisor de archivos: publica JSON sin iniciar Docker y comprueba limpieza. */
async function withQueue(response: string) {
  const queue = join(root, "queue");
  await mkdir(queue);
  await writeFile(join(queue, "heartbeat"), "ready");
  const source = join(root, "source.pdf");
  await writeFile(source, "%PDF-1.7\nfixture");
  const file = await open(source, "r");
  const result = extraerEnSandbox(file, queue);
  const simulate = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = (await readdir(queue)).find((entry) => entry !== "heartbeat");
      if (id) {
        try {
          const request = JSON.parse(await readFile(join(queue, id, "request.json"), "utf8"));
          expect(request.id).toBe(id);
          expect(Object.keys(request)).toEqual(["id", "createdAt"]);
          expect(await readFile(join(queue, id, "document.pdf"), "utf8")).toBe("%PDF-1.7\nfixture");
          await writeFile(join(queue, id, "result.json"), response);
          return;
        } catch (err) {
          if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) throw err;
        }
      }
      await delay(10);
    }
    throw new Error("Fixture sin trabajo");
  };
  // Adjuntar observador antes de provocar una respuesta inválida.
  const observed = result.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  try {
    await simulate();
    const output = await observed;
    expect(await readdir(queue)).toEqual(["heartbeat"]);
    if ("error" in output) throw output.error;
    return output.value;
  } finally {
    await file.close();
  }
}

describe("cola de sandbox sin acceso a Docker", () => {
  it("publica copia y metadatos mínimos, consume JSON y limpia", async () => {
    expect(await withQueue('{"paginas":[]}')).toEqual({ paginas: [] });
  });
  it("rechaza JSON inválido y limpia el trabajo", async () => {
    await expect(withQueue("respuesta inválida")).rejects.toThrow();
  });
  it("rechaza salida excesiva y limpia el trabajo", async () => {
    await expect(withQueue("x".repeat(600_001))).rejects.toThrow("PDF_NO_EVALUABLE");
  });
  it("no publica PDFs si no hay supervisor disponible", async () => {
    const file = await open(join(root, "input.pdf"), "w+");
    try {
      await expect(extraerEnSandbox(file, root)).rejects.toThrow();
    } finally {
      await file.close();
    }
    expect(await readdir(root)).toEqual(["input.pdf"]);
  });
  it("rechaza latido antiguo sin publicar el PDF", async () => {
    await writeFile(join(root, "heartbeat"), "ready");
    await utimes(join(root, "heartbeat"), new Date(0), new Date(0));
    const file = await open(join(root, "input.pdf"), "w+");
    try {
      await expect(extraerEnSandbox(file, root)).rejects.toThrow("PDF_NO_EVALUABLE");
    } finally {
      await file.close();
    }
    expect((await readdir(root)).sort()).toEqual(["heartbeat", "input.pdf"]);
  });
  it("verifica el hash de la copia y no publica contenido alterado", async () => {
    await writeFile(join(root, "heartbeat"), "ready");
    await writeFile(join(root, "input.pdf"), "%PDF-1.7\nfixture");
    const file = await open(join(root, "input.pdf"), "r");
    try {
      await expect(extraerEnSandbox(file, root, "a".repeat(64))).rejects.toThrow(
        "PDF_NO_EVALUABLE",
      );
    } finally {
      await file.close();
    }
    expect((await readdir(root)).sort()).toEqual(["heartbeat", "input.pdf"]);
  });
});
