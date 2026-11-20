import PizZip from "pizzip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarFormato } from "../../catalogo-formatos.js";
import type { VersionRow } from "../../formatos.repository.js";

const repo = vi.hoisted(() => ({
  listarVersiones: vi.fn(async (): Promise<VersionRow[]> => []),
  formatoActual: vi.fn(async () => ({ tipo: "DECRETO_APROBACION", origen: "PERSONALIZADO" })),
}));
const subir = vi.hoisted(() => ({
  bloquearFormato: vi.fn(async () => undefined),
  registrarVersionFormato: vi.fn(),
}));

// Catálogo del sistema sin ajustes del área; versiones controladas por el test.
vi.mock("../../formatos.repository.js", async (original) => ({
  ...(await original<typeof import("../../formatos.repository.js")>()),
  buscarFormatoVigente: vi.fn(async (tipo: string, variante: number) =>
    buscarFormato(tipo, variante),
  ),
  listarVersiones: repo.listarVersiones,
  formatoActual: repo.formatoActual,
}));
vi.mock("../subir-formato/subir-formato.use-case.js", async (original) => ({
  ...(await original<typeof import("../subir-formato/subir-formato.use-case.js")>()),
  ...subir,
}));
vi.mock("../../../../infra/db/unit-of-work.js", () => ({
  DrizzleUnitOfWork: class {
    run<T>(fn: (t: unknown) => Promise<T>): Promise<T> {
      return fn({});
    }
  },
}));

const { EditarFormatoUseCase } = await import("./editar-formato.use-case.js");

const actor = { id: "", dni: "00000000" };
const ANIO = { buscar: "-2026-USE-FIPS", reemplazo: "-<<ANIO>>-USE-FIPS" };
const base = { tipo: "DECRETO_APROBACION", variante: 1, actor, versionBase: null };

function storage(archivos: Record<string, Buffer> = {}) {
  return {
    leer: vi.fn(async (ruta: string) => archivos[ruta] ?? null),
    delete: vi.fn(async () => undefined),
  } as unknown as ConstructorParameters<typeof EditarFormatoUseCase>[0];
}

function version(v: number, ruta: string): VersionRow {
  return {
    id: `00000000-0000-0000-0000-00000000000${String(v)}`,
    tipo: "DECRETO_APROBACION",
    variante: 1,
    version: v,
    nombreArchivo: "decreto.docx",
    ruta,
    tamanoBytes: 1,
    etiquetas: [],
    advertencias: [],
    nota: null,
    activa: true,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    creadoPorNombre: null,
  };
}

describe("EditarFormatoUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.listarVersiones.mockResolvedValue([]);
    subir.registrarVersionFormato.mockImplementation(async () => ({
      ok: true,
      value: version(1, "/vol/_plantillas/1/DECRETO_APROBACION_v1.docx"),
    }));
  });

  it("rechaza formatos fuera del catálogo", async () => {
    const r = await new EditarFormatoUseCase(storage()).execute({
      ...base,
      tipo: "NO_EXISTE",
      reemplazos: [ANIO],
      aplicar: false,
    });
    expect(r.ok ? null : r.error.code).toBe("NO_ENCONTRADO");
  });

  it("simula sobre la plantilla base sin crear versiones", async () => {
    const r = await new EditarFormatoUseCase(storage()).execute({
      ...base,
      reemplazos: [ANIO, { buscar: "texto que no existe", reemplazo: "x" }],
      aplicar: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.resultado).toBeNull();
    expect(r.value.coincidencias[0]?.total).toBeGreaterThan(0);
    expect(r.value.coincidencias[0]?.muestras[0]?.texto).toBe("-2026-USE-FIPS");
    expect(r.value.coincidencias[1]?.total).toBe(0);
    expect(subir.registrarVersionFormato).not.toHaveBeenCalled();
  });

  it("responde CONFLICTO_CONCURRENCIA si la versión vigente cambió", async () => {
    const ruta = "/vol/v2.docx";
    const zip = new PizZip();
    zip.file("word/document.xml", "<w:document><w:body/></w:document>");
    repo.listarVersiones.mockResolvedValue([version(2, ruta)]);
    const r = await new EditarFormatoUseCase(
      storage({ [ruta]: zip.generate({ type: "nodebuffer" }) }),
    ).execute({ ...base, versionBase: 1, reemplazos: [ANIO], aplicar: true });
    expect(r.ok ? null : r.error.code).toBe("CONFLICTO_CONCURRENCIA");
    expect(subir.registrarVersionFormato).not.toHaveBeenCalled();
  });

  it("no crea la versión si algún texto no aparece", async () => {
    const r = await new EditarFormatoUseCase(storage()).execute({
      ...base,
      reemplazos: [ANIO, { buscar: "texto que no existe", reemplazo: "x" }],
      aplicar: true,
    });
    expect(r.ok ? null : r.error.code).toBe("VALIDACION_FALLIDA");
    expect(subir.bloquearFormato).toHaveBeenCalledTimes(1);
    expect(subir.registrarVersionFormato).not.toHaveBeenCalled();
  });

  it("aplica los reemplazos y registra una versión nueva con nota automática", async () => {
    const r = await new EditarFormatoUseCase(storage()).execute({
      ...base,
      reemplazos: [ANIO],
      aplicar: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.resultado?.version.version).toBe(1);
    const input = subir.registrarVersionFormato.mock.calls[0]?.[2] as {
      analisis: { buffer: Buffer; etiquetas: string[] };
      nota: string;
    };
    expect(input.analisis.etiquetas).toContain("ANIO");
    expect(input.nota).toBe("Edición en línea: «-2026-USE-FIPS» → «-<<ANIO>>-USE-FIPS»");
    const xml = new PizZip(input.analisis.buffer).file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toContain("-2026-USE-FIPS");
  });
});
