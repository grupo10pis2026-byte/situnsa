import { describe, expect, it } from "vitest";
import {
  erroresTaller,
  horarioDeSesion,
  normalizarCalendario,
  normalizarCodigoComprobante,
  proponerSesiones,
  siguienteNombreGrupo,
  textoHorario,
  tieneHorario,
  validarCodigoComprobante,
  validarCorreccionCodigo,
  validarGrupoHorario,
  validarSesionNueva,
} from "../src/index.js";

/** Adenda 1.2: A1 enlace único, A2 horario opcional y Grupo A, N1 código del comprobante. */

const base = {
  nombre: "TALLER 09",
  periodo: "2027-I",
  inicio: "2027-04-03",
  fin: "2027-06-20",
  numeroSesiones: 24,
  cupoProyectos: 15,
  pensiones: {
    montos: [1000, 1000, 1000] as [number, number, number],
    fecha2: "2027-04-24",
    fecha3: "2027-05-22",
  },
};

describe("A1 enlace único", () => {
  it("valida https en el enlace de reunión", () => {
    const dias = [{ dia: 6, horaInicio: null, horaFin: null }];
    expect(erroresTaller({ ...base, dias, enlaceReunion: "https://meet.google.com/a" })).toEqual(
      [],
    );
    expect(erroresTaller({ ...base, dias, enlaceReunion: "meet.google.com/a" })[0]?.campo).toBe(
      "enlaceReunion",
    );
  });
});

describe("A2 horario opcional", () => {
  const sinHora = [
    { dia: 6, horaInicio: null, horaFin: null },
    { dia: 7, horaInicio: null, horaFin: null },
  ];
  it("un taller sin horario es válido; a medias no", () => {
    expect(erroresTaller({ ...base, dias: sinHora })).toEqual([]);
    const medias = [
      { dia: 6, horaInicio: "15:00", horaFin: "20:00" },
      { dia: 7, horaInicio: null, horaFin: null },
    ];
    expect(erroresTaller({ ...base, dias: medias }).map((e) => e.campo)).toContain("horario");
    expect(tieneHorario(sinHora)).toBe(false);
    expect(tieneHorario([{ dia: 6, horaInicio: "15:00", horaFin: "20:00" }])).toBe(true);
  });

  it("las sesiones propuestas sin horario quedan «por definir»", () => {
    const r = proponerSesiones({
      inicio: "2027-04-03",
      fin: "2027-04-11",
      dias: sinHora,
      feriados: new Map(),
      objetivo: 4,
    });
    expect(r.ok && r.value.sesiones.every((s) => s.horaInicio === null)).toBe(true);
    const n = normalizarCalendario([{ fecha: "2027-04-03", horaInicio: null, horaFin: null }]);
    expect(n.ok).toBe(true);
    expect(
      normalizarCalendario([{ fecha: "2027-04-03", horaInicio: "15:00", horaFin: null }]).ok,
    ).toBe(false);
  });

  it("el grupo sin bloque del taller acepta cualquier horario válido por día", () => {
    const r = validarGrupoHorario(
      {
        nombre: "Grupo A",
        horarios: [
          { dia: 6, horaInicio: "09:00", horaFin: "11:00" },
          { dia: 7, horaInicio: "16:00", horaFin: "18:00" },
        ],
      },
      sinHora,
    );
    expect(r.ok).toBe(true);
  });

  it("nombres por defecto: Grupo A, B, C…", () => {
    expect(siguienteNombreGrupo([])).toBe("Grupo A");
    expect(siguienteNombreGrupo(["Grupo A"])).toBe("Grupo B");
    expect(siguienteNombreGrupo(["grupo a", "Grupo B", "Tarde"])).toBe("Grupo C");
  });

  it("horario efectivo de la sesión: el del grupo por día, salvo reprogramada", () => {
    const grupo = [
      { dia: 6, horaInicio: "15:00", horaFin: "17:30" },
      { dia: 7, horaInicio: "08:00", horaFin: "10:30" },
    ];
    // 2027-04-04 es domingo
    expect(
      horarioDeSesion(
        { fecha: "2027-04-04", horaInicio: "08:00", horaFin: "13:00", reprogramada: false },
        grupo,
      ),
    ).toEqual({ horaInicio: "08:00", horaFin: "10:30" });
    expect(
      horarioDeSesion(
        { fecha: "2027-04-04", horaInicio: "09:00", horaFin: "12:00", reprogramada: true },
        grupo,
      ),
    ).toEqual({ horaInicio: "09:00", horaFin: "12:00" });
    expect(
      horarioDeSesion(
        { fecha: "2027-04-04", horaInicio: null, horaFin: null, reprogramada: false },
        null,
      ),
    ).toBeNull();
    expect(textoHorario(grupo)).toBe("Sáb 15:00–17:30 · Dom 08:00–10:30");
    expect(textoHorario([])).toBe("Horario por definir");
  });

  it("una sesión extra o reprogramada puede quedar sin horario", () => {
    expect(
      validarSesionNueva({
        fecha: "2027-04-10",
        horaInicio: null,
        horaFin: null,
        motivo: "Recuperación",
      }).ok,
    ).toBe(true);
    expect(
      validarSesionNueva({
        fecha: "2027-04-10",
        horaInicio: "15:00",
        horaFin: null,
        motivo: "Recuperación",
      }).ok,
    ).toBe(false);
  });
});

describe("N1 código del comprobante", () => {
  it("«ab 123» y «AB123» son el mismo código", () => {
    expect(normalizarCodigoComprobante("ab 123")).toBe("AB123");
    expect(normalizarCodigoComprobante(" Ab\t1 2 3 ")).toBe("AB123");
  });
  it("es obligatorio y con caracteres válidos", () => {
    expect(validarCodigoComprobante("").ok).toBe(false);
    expect(validarCodigoComprobante("   ").ok).toBe(false);
    expect(validarCodigoComprobante("ab").ok).toBe(false);
    expect(validarCodigoComprobante("OP<123>").ok).toBe(false);
    const v = validarCodigoComprobante("op-0045 1289");
    expect(v.ok && v.value).toBe("OP-00451289");
  });
  it("corregir un código exige motivo", () => {
    expect(validarCorreccionCodigo("AB123", "").ok).toBe(false);
    expect(validarCorreccionCodigo("AB123", "Error de tipeo").ok).toBe(true);
  });
});
