import { beforeEach, describe, expect, it } from "vitest";
import { PresenciaExpedienteManager } from "./presencia-expediente.service.js";

describe("PresenciaExpedienteManager", () => {
  let manager: PresenciaExpedienteManager;

  beforeEach(() => {
    manager = new PresenciaExpedienteManager();
  });

  it("registra un único usuario y reporta 0 concurrentes", () => {
    const concurrentes = manager.registrarPresencia("exp-1", {
      id: "usr-1",
      nombre: "Ana Gomez",
      rol: "ADMINISTRATIVO",
    });

    expect(concurrentes).toEqual([]);
  });

  it("detecta a un segundo usuario trabajando en el mismo expediente", () => {
    manager.registrarPresencia("exp-1", {
      id: "usr-1",
      nombre: "Ana Gomez",
      rol: "ADMINISTRATIVO",
    });

    const concurrentesB = manager.registrarPresencia("exp-1", {
      id: "usr-2",
      nombre: "Carlos Ruiz",
      rol: "SECRETARIA",
    });

    expect(concurrentesB).toHaveLength(1);
    expect(concurrentesB[0]?.id).toBe("usr-1");
    expect(concurrentesB[0]?.nombre).toBe("Ana Gomez");
    expect(concurrentesB[0]?.rol).toBe("ADMINISTRATIVO");

    const concurrentesA = manager.registrarPresencia("exp-1", {
      id: "usr-1",
      nombre: "Ana Gomez",
      rol: "ADMINISTRATIVO",
    });

    expect(concurrentesA).toHaveLength(1);
    expect(concurrentesA[0]?.id).toBe("usr-2");
    expect(concurrentesA[0]?.nombre).toBe("Carlos Ruiz");
  });

  it("no mezcla usuarios de diferentes expedientes", () => {
    manager.registrarPresencia("exp-1", {
      id: "usr-1",
      nombre: "Ana Gomez",
    });

    const concurrentesExp2 = manager.registrarPresencia("exp-2", {
      id: "usr-2",
      nombre: "Carlos Ruiz",
    });

    expect(concurrentesExp2).toEqual([]);
  });
});
