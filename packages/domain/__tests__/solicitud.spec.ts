import { describe, expect, it } from "vitest";
import {
  assertTransitionSolicitud,
  calcularLimiteSubsanacion,
  canTransitionSolicitud,
  DIAS_HABILES_SUBSANACION_DEFAULT,
  estaSubsanacionVencida,
  SolicitudAggregate,
  validarParticipantesSolicitud,
} from "../src/index.js";

describe("Solicitud FSM", () => {
  it("permite el flujo legal normal: NUEVA -> EN_REVISION -> ACEPTADA", () => {
    expect(canTransitionSolicitud("NUEVA", "EN_REVISION")).toBe(true);
    expect(canTransitionSolicitud("EN_REVISION", "ACEPTADA")).toBe(true);
    expect(assertTransitionSolicitud("NUEVA", "EN_REVISION").ok).toBe(true);
  });

  it("permite ciclo de observación: EN_REVISION -> OBSERVADA -> EN_REVISION", () => {
    expect(canTransitionSolicitud("EN_REVISION", "OBSERVADA")).toBe(true);
    expect(canTransitionSolicitud("OBSERVADA", "EN_REVISION")).toBe(true);
  });

  it("permite rechazo desde EN_REVISION u OBSERVADA", () => {
    expect(canTransitionSolicitud("EN_REVISION", "RECHAZADA")).toBe(true);
    expect(canTransitionSolicitud("OBSERVADA", "RECHAZADA")).toBe(true);
  });

  it("bloquea saltos ilegales (ej. NUEVA -> ACEPTADA sin revisión previa)", () => {
    expect(canTransitionSolicitud("NUEVA", "ACEPTADA")).toBe(false);
    expect(assertTransitionSolicitud("NUEVA", "ACEPTADA").ok).toBe(false);
    expect(canTransitionSolicitud("ACEPTADA", "OBSERVADA")).toBe(false);
  });
});

describe("Validación de participantes en Solicitud", () => {
  it("acepta participante titular válido con DNI de 8 dígitos", () => {
    const res = validarParticipantesSolicitud({
      nombres: "Juan Carlos",
      apellidos: "Pérez Quispe",
      dni: "71234567",
      email: "jperez@unsa.edu.pe",
    });
    expect(res.ok).toBe(true);
  });

  it("rechaza DNI con longitud inválida", () => {
    const res = validarParticipantesSolicitud({
      nombres: "Juan Carlos",
      apellidos: "Pérez Quispe",
      dni: "12345",
      email: "jperez@unsa.edu.pe",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDACION_FALLIDA");
    }
  });

  it("rechaza correo no institucional en participante", () => {
    const res = validarParticipantesSolicitud({
      nombres: "Juan Carlos",
      apellidos: "Pérez Quispe",
      dni: "71234567",
      email: "jperez@gmail.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain("institucional (@unsa.edu.pe)");
    }
  });

  it("rechaza dos participantes con el mismo DNI", () => {
    const p1 = {
      nombres: "Juan Carlos",
      apellidos: "Pérez Quispe",
      dni: "71234567",
      email: "jperez@unsa.edu.pe",
    };
    const p2 = {
      nombres: "Maria Elena",
      apellidos: "Torres Flores",
      dni: "71234567",
      email: "mtorres@unsa.edu.pe",
    };
    const res = validarParticipantesSolicitud(p1, p2);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain("no pueden tener el mismo DNI");
    }
  });

  it("rechaza dos participantes con el mismo correo electrónico", () => {
    const p1 = {
      nombres: "Juan Carlos",
      apellidos: "Pérez Quispe",
      dni: "71234567",
      email: "compartido@unsa.edu.pe",
    };
    const p2 = {
      nombres: "Maria Elena",
      apellidos: "Torres Flores",
      dni: "87654321",
      email: "COMPARTIDO@unsa.edu.pe",
    };
    const res = validarParticipantesSolicitud(p1, p2);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain("distinto");
    }
  });
});

describe("SolicitudAggregate", () => {
  it("avanza de estados y emite eventos de dominio", () => {
    const agg = new SolicitudAggregate("uuid-1", "SOL-2026-0001", "REGULAR", "NUEVA");
    expect(agg.getEstado()).toBe("NUEVA");

    const r1 = agg.abrirRevision();
    expect(r1.ok).toBe(true);
    expect(agg.getEstado()).toBe("EN_REVISION");

    const fechaLimite = calcularLimiteSubsanacion(new Date("2026-10-16T10:00:00Z"), 10);
    const r2 = agg.observar(fechaLimite);
    expect(r2.ok).toBe(true);
    expect(agg.getEstado()).toBe("OBSERVADA");

    const events1 = agg.pullEvents();
    expect(events1.length).toBe(1);
    expect(events1[0]?.type).toBe("SolicitudObservada");

    const r3 = agg.subsanar();
    expect(r3.ok).toBe(true);
    expect(agg.getEstado()).toBe("EN_REVISION");

    const r4 = agg.aceptar("exp-uuid-99", "SET008");
    expect(r4.ok).toBe(true);
    expect(agg.getEstado()).toBe("ACEPTADA");
    expect(agg.getExpedienteId()).toBe("exp-uuid-99");

    const events2 = agg.pullEvents();
    expect(events2.length).toBe(1);
    expect(events2[0]?.type).toBe("SolicitudAceptada");
  });
});

describe("Cálculo de plazos de subsanación", () => {
  it("calcula 10 días hábiles respetando fines de semana", () => {
    // Viernes 16 de octubre de 2026
    const viernes = new Date("2026-10-16T00:00:00Z");
    const limite = calcularLimiteSubsanacion(viernes, DIAS_HABILES_SUBSANACION_DEFAULT);
    // 10 días hábiles a partir del viernes salta 2 fines de semana
    expect(limite.toISOString().slice(0, 10)).toBe("2026-10-30");
  });

  it("determina si la subsanación está vencida", () => {
    const limite = new Date("2026-10-30T23:59:59Z");
    const antes = new Date("2026-10-25T12:00:00Z");
    const despues = new Date("2026-10-31T08:00:00Z");

    expect(estaSubsanacionVencida(limite, antes)).toBe(false);
    expect(estaSubsanacionVencida(limite, despues)).toBe(true);
  });
});
