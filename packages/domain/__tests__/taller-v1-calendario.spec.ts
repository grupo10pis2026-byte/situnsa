import { describe, expect, it } from "vitest";
import {
  DIAS_SESION_DEFECTO,
  fechaHito,
  fechaPensionPorDefecto,
  finSugerido,
  hitosProgramados,
  proponerSesiones,
  reportesProgramados,
  sabadoSemana1,
  textoContador,
} from "../src/taller/calendario.js";
import { erroresTaller, validarTaller } from "../src/taller/validar-taller.js";

/** Ejemplo 2026-II de la spec §5: inicio sábado 10/10/2026. */
const INICIO = "2026-10-10";
const FERIADOS = new Map([
  ["2026-11-01", "Día de Todos los Santos"],
  ["2026-12-08", "Inmaculada Concepción"],
  ["2026-12-25", "Navidad"],
]);

describe("calendario del curso (§5)", () => {
  it("fechas de hitos = domingo de su semana", () => {
    const fechas = Object.fromEntries(hitosProgramados(INICIO).map((h) => [h.tipo, h.fechaLimite]));
    expect(fechas).toEqual({
      PLAN: "2026-10-18",
      AVANCE_1: "2026-11-01",
      AVANCE_2: "2026-11-15",
      AVANCE_3: "2026-11-29",
      AVANCE_4: "2026-12-13",
      BORRADOR_INTEGRADO: "2026-12-20",
      BORRADOR_FINAL: "2026-12-27",
    });
  });

  it("pensiones por defecto = sábado de la semana 4 y 8", () => {
    expect(fechaPensionPorDefecto(INICIO, 4)).toBe("2026-10-31");
    expect(fechaPensionPorDefecto(INICIO, 8)).toBe("2026-11-28");
  });

  it("reportes = lunes siguiente al hito", () => {
    expect(reportesProgramados(INICIO).map((r) => r.fecha)).toEqual([
      "2026-10-19",
      "2026-11-02",
      "2026-11-16",
      "2026-11-30",
      "2026-12-14",
      "2026-12-28",
    ]);
  });

  it("fin sugerido = domingo de la semana 12", () => {
    expect(finSugerido(INICIO)).toBe("2026-12-27");
  });

  it("semana 1 se ancla al fin de semana del inicio", () => {
    expect(sabadoSemana1("2026-10-11")).toBe("2026-10-10"); // domingo
    expect(sabadoSemana1("2026-10-07")).toBe("2026-10-10"); // miércoles
    expect(fechaHito("2026-10-11", 2)).toBe("2026-10-18");
  });
});

describe("proponerSesiones (§9 P2)", () => {
  const dias = [...DIAS_SESION_DEFECTO];

  it("curso completo con feriado del 01/11: 23 de 24 · falta 1 (mockup P2)", () => {
    const r = proponerSesiones({
      inicio: INICIO,
      fin: "2026-12-27",
      dias,
      feriados: FERIADOS,
      objetivo: 24,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sesiones).toHaveLength(23);
    expect(r.value.omitidas).toEqual([
      { fecha: "2026-11-01", dia: "Domingo", nota: "Feriado, omitida" },
    ]);
    expect(r.value.contador).toBe("23 de 24 · falta 1");
    expect(r.value.coincide).toBe(false);
    expect(r.value.sesiones[0]).toEqual({
      nro: 1,
      fecha: "2026-10-10",
      dia: "Sábado",
      horaInicio: "15:00",
      horaFin: "20:00",
    });
    expect(r.value.sesiones[1]?.horaInicio).toBe("08:00");
    expect(r.value.sesiones.at(-1)?.fecha).toBe("2026-12-27");
  });

  it("aceptación #2: 10/10 a 28/11 omite el feriado y avisa que no suman 24", () => {
    const r = proponerSesiones({
      inicio: INICIO,
      fin: "2026-11-28",
      dias,
      feriados: FERIADOS,
      objetivo: 24,
    });
    expect(r.ok && r.value.sesiones.length).toBe(14);
    expect(r.ok && r.value.contador).toBe("14 de 24 · faltan 10");
  });

  it("sin feriados coincide con 24", () => {
    const r = proponerSesiones({
      inicio: INICIO,
      fin: "2026-12-27",
      dias,
      feriados: new Map(),
      objetivo: 24,
    });
    expect(r.ok && r.value.coincide).toBe(true);
  });

  it("rechaza fin anterior al inicio y sin días", () => {
    expect(
      proponerSesiones({ inicio: INICIO, fin: INICIO, dias, feriados: FERIADOS, objetivo: 24 }).ok,
    ).toBe(false);
    expect(
      proponerSesiones({
        inicio: INICIO,
        fin: "2026-12-27",
        dias: [],
        feriados: FERIADOS,
        objetivo: 24,
      }).ok,
    ).toBe(false);
  });

  it("contador con sobrantes", () => {
    expect(textoContador(26, 24)).toBe("26 de 24 · sobran 2");
  });
});

describe("erroresTaller (§9 P2)", () => {
  const valido = {
    nombre: "TALLER 06",
    periodo: "2026-II",
    inicio: INICIO,
    fin: "2026-12-27",
    numeroSesiones: 24,
    dias: [...DIAS_SESION_DEFECTO],
    cupoProyectos: 15,
    enlaceSabado: "https://meet.google.com/abc",
    enlaceDomingo: null,
    pensiones: {
      montos: [1000, 1000, 1000] as [number, number, number],
      fecha2: "2026-10-31",
      fecha3: "2026-11-28",
    },
  };

  it("acepta un taller válido", () => {
    expect(erroresTaller(valido)).toEqual([]);
    expect(validarTaller(valido).ok).toBe(true);
  });

  it("reporta cada error junto a su campo", () => {
    const campos = erroresTaller({
      ...valido,
      fin: "2026-10-01",
      dias: [{ dia: 6, horaInicio: "20:00", horaFin: "15:00" }],
      cupoProyectos: 0,
      numeroSesiones: 0,
      enlaceDomingo: "http://meet.google.com/x",
      pensiones: { ...valido.pensiones, fecha3: "2026-10-30" },
    }).map((e) => e.campo);
    expect(campos).toEqual([
      "fin",
      "numeroSesiones",
      "horario.6",
      "cupoProyectos",
      "enlaceDomingo",
      "pension.3.fecha",
    ]);
  });

  it("al editar, el cupo no baja de los proyectos asignados", () => {
    const e = erroresTaller({ ...valido, cupoProyectos: 10, proyectosAsignados: 11 });
    expect(e[0]?.campo).toBe("cupoProyectos");
  });

  it("ningún día marcado", () => {
    expect(erroresTaller({ ...valido, dias: [] }).map((e) => e.campo)).toContain("dias");
  });
});
