import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorageService } from "../../infra/storage/local-storage.service.js";
import { buscarFormato } from "./catalogo-formatos.js";
import type { VersionRow } from "./formatos.repository.js";
import { claveVistaPrevia, vistaPreviaBase, vistaPreviaVersion } from "./vista-previa.js";

const PDF = Buffer.from("%PDF-1.7 vista previa");

let dir: string;
let storage: LocalStorageService;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pis-vista-previa-"));
  storage = new LocalStorageService(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const formato = () => {
  const f = buscarFormato("DECRETO_APROBACION", 1);
  if (!f) throw new Error("catálogo sin DECRETO_APROBACION");
  return f;
};

describe("vista previa de formatos", () => {
  it("usa claves distintas para versión y base", () => {
    expect(claveVistaPrevia(formato(), { id: "abc" }, null)).toBe("v_abc");
    expect(claveVistaPrevia(formato(), null, "0123456789abcdef9999")).toBe(
      "base_1_DECRETO_APROBACION_0123456789abcdef",
    );
  });

  it("convierte la plantilla base una sola vez y luego usa la caché", async () => {
    const convertir = vi.fn(async () => PDF);
    const r1 = await vistaPreviaBase(storage, formato(), convertir);
    const r2 = await vistaPreviaBase(storage, formato(), convertir);
    expect(r1).toEqual(r2);
    expect(r1.ok && r1.ruta.startsWith(dir)).toBe(true);
    expect(convertir).toHaveBeenCalledTimes(1);
  });

  it("convierte la versión subida desde el volumen", async () => {
    const { ruta } = await storage.savePlantilla(
      1,
      "DECRETO_APROBACION_v1.docx",
      Buffer.from("docx"),
    );
    const version = {
      id: "v1",
      tipo: "DECRETO_APROBACION",
      variante: 1,
      version: 1,
      ruta,
    } as VersionRow;
    const convertir = vi.fn(async (bytes: Buffer) => {
      expect(bytes.toString()).toBe("docx");
      return PDF;
    });
    const r = await vistaPreviaVersion(storage, version, convertir);
    expect(r.ok).toBe(true);
  });

  it("informa la falta de archivo y los fallos de conversión sin cachear", async () => {
    const perdida = { id: "x", tipo: "T", variante: 1, version: 1, ruta: join(dir, "no.docx") };
    expect(await vistaPreviaVersion(storage, perdida as VersionRow, vi.fn())).toEqual({
      ok: false,
      motivo: "SIN_PLANTILLA",
    });
    const caido = vi.fn(async () => {
      throw new Error("Gotenberg caído");
    });
    const r = await vistaPreviaBase(storage, formato(), caido);
    expect(r).toMatchObject({
      ok: false,
      motivo: "CONVERSION_FALLIDA",
      detalle: "Gotenberg caído",
    });
    const ok = await vistaPreviaBase(
      storage,
      formato(),
      vi.fn(async () => PDF),
    );
    expect(ok.ok).toBe(true);
  });
});
