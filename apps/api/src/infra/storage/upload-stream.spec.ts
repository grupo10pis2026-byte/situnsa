/**
 * Pruebas de LocalStorageService.prepararPdf, utilizado por POST /api/documentos/upload.
 * Verifican hash, publicación y limpieza del contenido en cuarentena.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorageService } from "./local-storage.service.js";

let raiz = "";
beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), "pis-stream-"));
});
afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});
describe("upload por stream", () => {
  it("escribe chunks, calcula hash y promueve fuera de cuarentena", async () => {
    const base = join(raiz, "docs");
    const contenido = await new LocalStorageService(base).prepararPdf(
      Readable.from([Buffer.from("%P"), Buffer.from("DF-1.4\ncontenido")]),
    );
    expect(new TextDecoder().decode(contenido.cabecera)).toBe("%PDF-");
    const guardado = await contenido.guardar("33333333-3333-4333-8333-333333333333", "plan_v1.pdf");
    expect(guardado.sha256).toBe(createHash("sha256").update("%PDF-1.4\ncontenido").digest("hex"));
    expect(await readFile(guardado.ruta, "utf8")).toBe("%PDF-1.4\ncontenido");
    await contenido.limpiar(true);
    expect(await readdir(`${base}-cuarentena`)).toEqual([]);
    expect(await readFile(guardado.ruta, "utf8")).toContain("contenido");
  });
  it("compensa archivo promovido si falla el commit", async () => {
    const contenido = await new LocalStorageService(join(raiz, "docs")).prepararPdf(
      Readable.from([Buffer.from("%PDF-1.4")]),
    );
    const guardado = await contenido.guardar("33333333-3333-4333-8333-333333333333", "plan.pdf");
    await contenido.limpiar(false);
    await expect(readFile(guardado.ruta)).rejects.toThrow();
  });
  it("aborto del stream elimina cuarentena", async () => {
    const stream = Readable.from(
      (async function* () {
        yield Buffer.from("%PDF-");
        throw new Error("aborto");
      })(),
    );
    const base = join(raiz, "docs");
    await expect(new LocalStorageService(base).prepararPdf(stream)).rejects.toThrow("aborto");
    expect(await readdir(`${base}-cuarentena`)).toEqual([]);
  });
});
