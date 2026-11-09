import { describe, expect, it } from "vitest";
import {
  CambiarAsesorUseCase,
  CrearTallerUseCase,
  type ErrorTaller,
} from "./talleres.use-cases.js";

/**
 * P2/P3 sin BD: los errores de formulario y de calendario se resuelven
 * antes de leer parámetros o abrir la transacción. Los caminos con BD los
 * cubre `e2e/tests/talleres.api.spec.ts`.
 */

const actor = { id: "", dni: "00000001" };
const ID = "00000000-0000-4000-8000-000000000001";

const base = {
  nombre: "TALLER 90",
  periodo: "2026-II",
  asesorId: ID,
  inicio: "2026-10-10",
  fin: "2026-12-27",
  numeroSesiones: 24,
  dias: [
    { dia: 6, horaInicio: "15:00", horaFin: "20:00" },
    { dia: 7, horaInicio: "08:00", horaFin: "13:00" },
  ],
  cupoProyectos: 15,
  enlaceSabado: "https://meet.google.com/abc",
  enlaceDomingo: null,
  pensiones: {
    montos: [1000, 1000, 1000] as [number, number, number],
    fecha2: "2026-10-31",
    fecha3: "2026-11-28",
  },
  sesiones: [{ fecha: "2026-10-10", horaInicio: "15:00", horaFin: "20:00" }],
};

function campos(r: { ok: boolean; error?: ErrorTaller }): string[] {
  return r.ok ? [] : (r.error?.errores ?? []).map((e) => e.campo);
}

describe("CrearTallerUseCase (P2)", () => {
  it("devuelve cada error de formulario con su campo, sin tocar la BD", async () => {
    const r = await new CrearTallerUseCase().execute(
      {
        ...base,
        fin: "2026-10-01",
        enlaceDomingo: "http://meet.local/x",
        pensiones: { ...base.pensiones, fecha3: "2026-10-30" },
      },
      actor,
    );
    expect(r.ok).toBe(false);
    expect(campos(r)).toEqual(["fin", "enlaceDomingo", "pension.3.fecha"]);
  });

  it("rechaza dos sesiones el mismo día (campo calendario)", async () => {
    const r = await new CrearTallerUseCase().execute(
      {
        ...base,
        sesiones: [
          { fecha: "2026-10-10", horaInicio: "15:00", horaFin: "20:00" },
          { fecha: "2026-10-10", horaInicio: "08:00", horaFin: "13:00" },
        ],
      },
      actor,
    );
    expect(campos(r)).toEqual(["calendario"]);
  });

  it("rechaza un calendario vacío", async () => {
    const r = await new CrearTallerUseCase().execute({ ...base, sesiones: [] }, actor);
    expect(campos(r)).toEqual(["calendario"]);
  });
});

describe("CambiarAsesorUseCase (P3)", () => {
  it("exige el motivo del cambio", async () => {
    const r = await new CambiarAsesorUseCase().execute(ID, { asesorId: ID, motivo: " " }, actor);
    expect(campos(r)).toEqual(["motivo"]);
  });
});
