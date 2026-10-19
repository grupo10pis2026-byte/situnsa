import { describe, expect, it } from "vitest";
import { CHECKLIST_COMPLETO, CHECKLIST_E1 } from "../src/expediente/checklist-catalogo.js";
import type { EstadoExpediente } from "../src/expediente/fsm.js";
import {
  esFechaCivil,
  fechaEnRango,
  validarRangoPropuesto,
} from "../src/expediente/propuesta-fechas.js";
import {
  type ContextoAvance,
  type EstadoDocumento,
  evaluarCierreSubetapa,
  type Pronunciamiento,
  similitudConforme,
} from "../src/expediente/reglas-avance.js";
import { CLAVES_SUBETAPA, FLUJO_TITULACION } from "../src/expediente/seguimiento-catalogo.js";

const HOY = new Date("2026-10-05T15:00:00Z");

function ctx(parcial: Partial<ContextoAvance> & { claveSubetapa: string }): ContextoAvance {
  return {
    estado: "EN_PLAN",
    observadoDesde: null,
    checklist: CHECKLIST_COMPLETO,
    documentos: new Map(),
    terna: [],
    jurados: [],
    sustentacion: null,
    propuestaFechas: null,
    validaciones: new Map(),
    datosAdmin: { nroDecreto: null, decanal: null },
    hoy: HOY,
    ...parcial,
  };
}

const conformes = (n = 3): Pronunciamiento[] =>
  Array.from({ length: n }, (_, i) => ({
    rol: ["PRESIDENTE", "SECRETARIO", "VOCAL"][i] ?? "VOCAL",
    dictamen: "FAVORABLE",
  }));

function docsE1(estado: EstadoDocumento): Map<string, EstadoDocumento> {
  return new Map(CHECKLIST_E1.map((d) => [d.tipo, estado]));
}

describe("catálogo con claves estables", () => {
  it("las 38 subetapas tienen clave única", () => {
    const claves = FLUJO_TITULACION.flatMap((e) => e.subetapas.map((s) => s.clave));
    expect(claves).toHaveLength(38);
    expect(new Set(claves).size).toBe(38);
    expect([...claves].sort()).toEqual([...CLAVES_SUBETAPA].sort());
  });
});

describe("E1 · verificación inicial", () => {
  it("no cierra la presentación del plan sin los documentos obligatorios", () => {
    const r = evaluarCierreSubetapa(ctx({ claveSubetapa: "E1_PRESENTACION_PLAN" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("REQUISITO_PENDIENTE");
      expect(r.error.message).toContain("Plan estructurado de tesis");
    }
  });

  it("cierra la presentación con los documentos requeridos cargados, sin mover el estado", () => {
    const r = evaluarCierreSubetapa(
      ctx({ claveSubetapa: "E1_PRESENTACION_PLAN", documentos: docsE1("CARGADO") }),
    );
    expect(r).toEqual({ ok: true, value: { transicion: null } });
  });

  it("un documento observado bloquea la validación administrativa", () => {
    const docs = docsE1("APROBADO");
    docs.set("SOLICITUD_INSCRIPCION", "OBSERVADO");
    const r = evaluarCierreSubetapa(
      ctx({ claveSubetapa: "E1_VALIDACION_DOCUMENTOS", documentos: docs }),
    );
    expect(r.ok).toBe(false);
  });

  it("la terna requiere 3 titulares (el suplente no cuenta)", () => {
    const terna: Pronunciamiento[] = [
      { rol: "PRESIDENTE", dictamen: "PENDIENTE" },
      { rol: "SECRETARIO", dictamen: "PENDIENTE" },
      { rol: "SUPLENTE", dictamen: "PENDIENTE" },
    ];
    const r = evaluarCierreSubetapa(ctx({ claveSubetapa: "E1_ASIGNACION_TERNA", terna }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("JURADO_NO_ASIGNADO");
  });

  it("revisión con una observación de la terna → OBSERVADO", () => {
    const terna = conformes();
    terna[1] = { rol: "SECRETARIO", dictamen: "OBSERVADO" };
    const r = evaluarCierreSubetapa(ctx({ claveSubetapa: "E1_REVISION_TERNA", terna }));
    expect(r).toEqual({ ok: true, value: { transicion: "OBSERVADO" } });
  });

  it("levantamiento vuelve al estado de origen cuando la terna ya está conforme", () => {
    const r = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E1_LEVANTAMIENTO",
        estado: "OBSERVADO",
        observadoDesde: "EN_PLAN",
        terna: conformes(),
      }),
    );
    expect(r).toEqual({ ok: true, value: { transicion: "EN_PLAN" } });
  });

  it("decreto exige 3 conformidades y N° de decreto → PLAN_APROBADO", () => {
    const sinDecreto = evaluarCierreSubetapa(
      ctx({ claveSubetapa: "E1_DECRETO", terna: conformes() }),
    );
    expect(sinDecreto.ok).toBe(false);
    const r = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E1_DECRETO",
        terna: conformes(),
        datosAdmin: { nroDecreto: "015-2026", decanal: null },
      }),
    );
    expect(r).toEqual({ ok: true, value: { transicion: "PLAN_APROBADO" } });
  });
});

describe("estados que bloquean el avance", () => {
  it.each<EstadoExpediente>(["ANULADO", "DESAPROBADO_TRUNCO", "TITULO_EMITIDO"])(
    "%s no admite finalizar subetapas",
    (estado) => {
      const r = evaluarCierreSubetapa(ctx({ claveSubetapa: "E3_RECEPCION", estado }));
      expect(r.ok).toBe(false);
    },
  );

  it("OBSERVADO solo permite las subetapas de levantamiento", () => {
    const r = evaluarCierreSubetapa(ctx({ claveSubetapa: "E3_RECEPCION", estado: "OBSERVADO" }));
    expect(r.ok).toBe(false);
  });

  it("una subetapa personalizada (sin clave) no tiene guardas", () => {
    expect(evaluarCierreSubetapa(ctx({ claveSubetapa: "" })).ok).toBe(true);
  });
});

describe("E3 · dictamen de jurados", () => {
  it("sorteo exige 3 jurados y resolución decanal → EN_DICTAMEN", () => {
    const base = { claveSubetapa: "E3_SORTEO_JURADOS", estado: "EN_BORRADOR" as const };
    expect(evaluarCierreSubetapa(ctx({ ...base, jurados: conformes() })).ok).toBe(false);
    const r = evaluarCierreSubetapa(
      ctx({
        ...base,
        jurados: conformes(),
        datosAdmin: { nroDecreto: "1", decanal: "RD 042-2026" },
      }),
    );
    expect(r).toEqual({ ok: true, value: { transicion: "EN_DICTAMEN" } });
  });

  it("conformidad final exige todos FAVORABLE y el acta de dictamen → APTO_SUSTENTACION", () => {
    const jurados = conformes();
    const sinActa = evaluarCierreSubetapa(
      ctx({ claveSubetapa: "E3_CONFORMIDAD_FINAL", estado: "EN_DICTAMEN", jurados }),
    );
    expect(sinActa.ok).toBe(false);
    const r = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E3_CONFORMIDAD_FINAL",
        estado: "EN_DICTAMEN",
        jurados,
        documentos: new Map([["ACTA_DICTAMEN", "CARGADO"]]),
      }),
    );
    expect(r).toEqual({ ok: true, value: { transicion: "APTO_SUSTENTACION" } });
  });
});

describe("E4 · sustentación", () => {
  it("la propuesta de fechas del alumno es requisito para cerrar E4.1 (HU-0038)", () => {
    const sin = evaluarCierreSubetapa(
      ctx({ claveSubetapa: "E4_PROPUESTA_FECHAS", estado: "APTO_SUSTENTACION" }),
    );
    expect(sin.ok).toBe(false);
    if (!sin.ok) expect(sin.error.code).toBe("REQUISITO_PENDIENTE");
    const con = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E4_PROPUESTA_FECHAS",
        estado: "APTO_SUSTENTACION",
        propuestaFechas: { desde: "2026-10-19", hasta: "2026-10-30" },
      }),
    );
    expect(con.ok && con.value.transicion).toBe(null);
  });

  it("la publicación exige 7 días de anticipación (RN-PLZ-04)", () => {
    const pronto = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E4_PUBLICACION",
        estado: "APTO_SUSTENTACION",
        sustentacion: { fecha: "2026-10-09", actaVeredicto: null },
      }),
    );
    expect(pronto.ok).toBe(false);
    if (!pronto.ok) expect(pronto.error.code).toBe("PLAZO_VENCIDO");
    const ok = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E4_PUBLICACION",
        estado: "APTO_SUSTENTACION",
        sustentacion: { fecha: "2026-10-20", actaVeredicto: null },
      }),
    );
    expect(ok.ok).toBe(true);
  });

  it("sin acta no se cierra la sustentación; con acta y documento → EN_VALIDACION", () => {
    const sinActa = evaluarCierreSubetapa(
      ctx({ claveSubetapa: "E4_SUSTENTACION", estado: "APTO_SUSTENTACION" }),
    );
    expect(sinActa.ok).toBe(false);
    const r = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E4_SUSTENTACION",
        estado: "SUSTENTADO",
        documentos: new Map([["ACTA_SUSTENTACION", "CARGADO"]]),
      }),
    );
    expect(r).toEqual({ ok: true, value: { transicion: "EN_VALIDACION" } });
  });
});

describe("E5–E7 · validaciones institucionales", () => {
  it("regla de similitud: < 20 % conforme (HU-0042)", () => {
    expect(similitudConforme(19)).toBe(true);
    expect(similitudConforme(20)).toBe(false);
  });

  it("revisión de similitud rechaza un 25 %", () => {
    const r = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E5_REVISION_SIMILITUD",
        estado: "EN_VALIDACION",
        validaciones: new Map([
          ["OTI_SIMILITUD", { estado: "OBSERVADO", porcentaje: 25, detalle: null }],
        ]),
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TURNITIN_NO_CONFORME");
  });

  it("URL del repositorio → EN_APROBACION", () => {
    const r = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E5_URL_REPOSITORIO",
        estado: "EN_VALIDACION",
        validaciones: new Map([
          [
            "REPOSITORIO",
            { estado: "APROBADO", porcentaje: null, detalle: "https://repositorio.unsa.edu.pe/x" },
          ],
        ]),
      }),
    );
    expect(r).toEqual({ ok: true, value: { transicion: "EN_APROBACION" } });
  });

  it("cada aprobación institucional exige su instancia APROBADA", () => {
    const r = evaluarCierreSubetapa(ctx({ claveSubetapa: "E6_SISGRAD", estado: "EN_APROBACION" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("SISGRAD");
  });

  it("registro SUNEDU → TITULO_EMITIDO", () => {
    const r = evaluarCierreSubetapa(
      ctx({
        claveSubetapa: "E7_SUNEDU",
        estado: "EN_APROBACION",
        validaciones: new Map([
          ["SUNEDU", { estado: "APROBADO", porcentaje: null, detalle: null }],
        ]),
      }),
    );
    expect(r).toEqual({ ok: true, value: { transicion: "TITULO_EMITIDO" } });
  });
});

describe("propuesta de rango de fechas (RN-05.1)", () => {
  const HOY_CIVIL = "2026-10-05";

  it("rechaza una fecha única: exige un rango", () => {
    const r = validarRangoPropuesto({ desde: "2026-10-20", hasta: "2026-10-20" }, HOY_CIVIL);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("VALIDACION_FALLIDA");
      expect(r.error.message).toContain("no una fecha única");
    }
  });

  it("rechaza fechas pasadas, inexistentes o un rango sin margen para la citación", () => {
    expect(validarRangoPropuesto({ desde: "2026-10-05", hasta: "2026-10-20" }, HOY_CIVIL).ok).toBe(
      false,
    );
    expect(validarRangoPropuesto({ desde: "2026-02-28", hasta: "2026-02-30" }, HOY_CIVIL).ok).toBe(
      false,
    );
    const corto = validarRangoPropuesto({ desde: "2026-10-07", hasta: "2026-10-10" }, HOY_CIVIL);
    expect(corto.ok).toBe(false);
    if (!corto.ok) expect(corto.error.code).toBe("PLAZO_VENCIDO");
  });

  it("acepta un rango futuro que alcanza la anticipación mínima", () => {
    const r = validarRangoPropuesto({ desde: "2026-10-08", hasta: "2026-10-12" }, HOY_CIVIL);
    expect(r.ok).toBe(true);
    expect(fechaEnRango("2026-10-12", { desde: "2026-10-08", hasta: "2026-10-12" })).toBe(true);
    expect(fechaEnRango("2026-10-13", { desde: "2026-10-08", hasta: "2026-10-12" })).toBe(false);
    expect(esFechaCivil("2026-13-01")).toBe(false);
  });
});
