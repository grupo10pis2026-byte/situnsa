import { describe, expect, it } from "vitest";
import type { TipoHito } from "../src/taller/calendario.js";
import {
  assertTransicionEntrega,
  assertTransicionHito,
  assertTransicionSesion,
  type EstadoHito,
  puedeTransitarPension,
  puedeTransitarTaller,
} from "../src/taller/estados.js";
import {
  PARAMETROS_TALLER_DEFECTO as P,
  resolverParametrosTaller,
} from "../src/taller/parametros.js";
import {
  alcanzaFaltasParaRetiro,
  avisoAsistenciaAlumno,
  codigoProyecto,
  diasAtraso,
  estadoHitoTrasRevision,
  estadoPorCupo,
  evaluarAprobacionPlan,
  faltasConsecutivasActuales,
  hitoVencido,
  porcentajeAsistenciaCurso,
  puedeAjustarFechaHito,
  puedeAsignarProyecto,
  puedeCancelarTaller,
  puedeEmitirConformidad,
  puedeHabilitarHito,
  puedeReabrirHito,
  puedeRegistrarAsistencia,
  puedeRevisarEntrega,
  puedeSubirComprobante,
  puedeSubirEntrega,
  type RegistroAsistenciaCurso,
  resultadosVisibles,
  resumenFicha,
  sesionCompleta,
  tocaAvisoPension,
  validarArchivo,
  validarCambioAsistencia,
  validarGrupoHorario,
  validarObservacionComprobante,
  validarPuntajes,
  validarRegistroFicha,
  validarSesionNueva,
} from "../src/taller/reglas.js";

const R = (
  marca: RegistroAsistenciaCurso["marca"],
  sesion: RegistroAsistenciaCurso["sesion"] = "REALIZADA",
) => ({ sesion, marca });

describe("asistencia (§5)", () => {
  it("porcentaje sobre realizadas; canceladas no cuentan", () => {
    const regs = [
      R("PRESENTE"),
      R("JUSTIFICADA"),
      R("FALTA"),
      R("FALTA"),
      R(null, "CANCELADA"),
      R(null, "PROGRAMADA"),
    ];
    expect(porcentajeAsistenciaCurso(regs, P)).toBe(50);
    expect(porcentajeAsistenciaCurso(regs, { justificadaCuentaComoAsistencia: false })).toBe(25);
    expect(porcentajeAsistenciaCurso([], P)).toBeNull();
  });

  it("aceptación #9: dos faltas realizadas seguidas alcanzan el retiro", () => {
    const regs = [R("PRESENTE"), R("FALTA"), R(null, "CANCELADA"), R("FALTA")];
    expect(faltasConsecutivasActuales(regs, P)).toBe(2);
    expect(alcanzaFaltasParaRetiro(regs, P)).toBe(true);
    expect(avisoAsistenciaAlumno(regs, P)).toBe("Comunícate con la Unidad");
  });

  it("la justificada corta la racha según el parámetro", () => {
    const regs = [R("FALTA"), R("JUSTIFICADA"), R("FALTA")];
    expect(faltasConsecutivasActuales(regs, P)).toBe(1);
    expect(faltasConsecutivasActuales(regs, { justificadaInterrumpeRacha: false })).toBe(2);
    expect(avisoAsistenciaAlumno(regs, P)).toBe("Otra falta consecutiva puede implicar tu retiro");
  });

  it("aceptación #10: corregir sin motivo no se guarda", () => {
    expect(validarCambioAsistencia("PRESENTE", "FALTA", "").ok).toBe(false);
    expect(validarCambioAsistencia("PRESENTE", "FALTA", "Error de registro").ok).toBe(true);
    expect(validarCambioAsistencia("PENDIENTE", "FALTA", null).ok).toBe(true);
  });

  it("no se registra asistencia futura ni en canceladas", () => {
    expect(
      puedeRegistrarAsistencia({ estado: "PROGRAMADA", fecha: "2026-10-11" }, "2026-10-10").ok,
    ).toBe(false);
    expect(
      puedeRegistrarAsistencia({ estado: "CANCELADA", fecha: "2026-10-10" }, "2026-10-10").ok,
    ).toBe(false);
    expect(
      puedeRegistrarAsistencia({ estado: "REPROGRAMADA", fecha: "2026-10-10" }, "2026-10-10").ok,
    ).toBe(true);
  });

  it("aceptación #8: REALIZADA al guardar todos los grupos (o sin grupos)", () => {
    expect(sesionCompleta(["a", "b"], new Set(["a"]))).toBe(false);
    expect(sesionCompleta(["a", "b"], new Set(["a", "b"]))).toBe(true);
    expect(sesionCompleta([], new Set())).toBe(true);
  });
});

describe("taller y asignación (§3, D1)", () => {
  const base = {
    estadoTaller: "ABIERTO_INSCRIPCIONES" as const,
    proyectosAsignados: 11,
    cupoProyectos: 15,
    inscripcionValidada: true,
    tieneTallerActivo: false,
  };
  it("aceptación #4/#5: cupo lleno u otro taller no asigna", () => {
    expect(puedeAsignarProyecto(base).ok).toBe(true);
    expect(puedeAsignarProyecto({ ...base, proyectosAsignados: 15 }).ok).toBe(false);
    expect(puedeAsignarProyecto({ ...base, tieneTallerActivo: true }).ok).toBe(false);
    expect(puedeAsignarProyecto({ ...base, inscripcionValidada: false }).ok).toBe(false);
  });
  it("aceptación #6: el proyecto 15 cierra el taller", () => {
    expect(estadoPorCupo("ABIERTO_INSCRIPCIONES", 15, 15)).toBe("COMPLETO");
    expect(estadoPorCupo("COMPLETO", 14, 15)).toBe("ABIERTO_INSCRIPCIONES");
    expect(estadoPorCupo("EN_CURSO", 15, 15)).toBe("EN_CURSO");
  });
  it("cancelar solo sin sesiones realizadas y con motivo", () => {
    expect(puedeCancelarTaller("ABIERTO_INSCRIPCIONES", 0, "Sin asesor").ok).toBe(true);
    expect(puedeCancelarTaller("EN_CURSO", 1, "x").ok).toBe(false);
    expect(puedeCancelarTaller("ABIERTO_INSCRIPCIONES", 0, " ").ok).toBe(false);
  });
  it("transiciones del taller", () => {
    expect(puedeTransitarTaller("EN_CURSO", "FINALIZADO")).toBe(true);
    expect(puedeTransitarTaller("FINALIZADO", "EN_CURSO")).toBe(false);
  });
  it("código de proyecto", () => {
    expect(codigoProyecto(1)).toBe("P-01");
    expect(codigoProyecto(15)).toBe("P-15");
  });
});

describe("hitos y entregas (§9 P6, P6b, P7)", () => {
  const estados = (e: Partial<Record<TipoHito, EstadoHito>>) =>
    new Map<TipoHito, EstadoHito>(
      Object.entries({ PLAN: "NO_HABILITADO", AVANCE_1: "NO_HABILITADO", ...e }) as [
        TipoHito,
        EstadoHito,
      ][],
    );

  it("no se habilita un hito si el anterior no está aprobado", () => {
    expect(puedeHabilitarHito("PLAN", estados({})).ok).toBe(true);
    expect(puedeHabilitarHito("AVANCE_1", estados({ PLAN: "ENTREGADO" })).ok).toBe(false);
    expect(puedeHabilitarHito("AVANCE_1", estados({ PLAN: "APROBADO" })).ok).toBe(true);
  });

  it("aceptación #13: semanas 2 y 12 no se ajustan", () => {
    expect(puedeAjustarFechaHito("PLAN").ok).toBe(false);
    expect(puedeAjustarFechaHito("BORRADOR_FINAL").ok).toBe(false);
    expect(puedeAjustarFechaHito("AVANCE_2").ok).toBe(true);
  });

  it("aceptación #18: borrador final sin ficha completa", () => {
    const c = {
      tipo: "BORRADOR_FINAL" as const,
      estado: "HABILITADO" as const,
      fechaLimite: "2026-12-27",
      hoy: "2026-12-26",
      fichaCompletaYFirmada: false,
      tesistaRetirado: false,
    };
    const r = puedeSubirEntrega(c, P);
    expect(!r.ok && r.error.message).toBe("Tu asesor debe completar y firmar la ficha");
    expect(puedeSubirEntrega({ ...c, fichaCompletaYFirmada: true }, P).ok).toBe(true);
    expect(puedeSubirEntrega({ ...c, fichaCompletaYFirmada: true, hoy: "2026-12-28" }, P).ok).toBe(
      false,
    );
    expect(
      puedeSubirEntrega(
        { ...c, fichaCompletaYFirmada: true, hoy: "2026-12-28" },
        { aceptarEntregaFueraDePlazo: true },
      ).ok,
    ).toBe(true);
  });

  it("aceptación #15: observar sin observaciones no se guarda; solo última versión", () => {
    expect(puedeRevisarEntrega({ estado: "ENTREGADA", esUltima: true }, "OBSERVADA", "").ok).toBe(
      false,
    );
    expect(
      puedeRevisarEntrega({ estado: "ENTREGADA", esUltima: true }, "OBSERVADA", "Falta marco").ok,
    ).toBe(true);
    expect(puedeRevisarEntrega({ estado: "ENTREGADA", esUltima: false }, "CONFORME", null).ok).toBe(
      false,
    );
    expect(puedeRevisarEntrega({ estado: "CONFORME", esUltima: true }, "CONFORME", null).ok).toBe(
      false,
    );
  });

  it("una versión revisada no vuelve a cambiar", () => {
    expect(assertTransicionEntrega("CONFORME", "OBSERVADA").ok).toBe(false);
  });

  it("el plan conforme queda ENTREGADO hasta D3; los avances se aprueban", () => {
    expect(estadoHitoTrasRevision("PLAN", "CONFORME")).toBe("ENTREGADO");
    expect(estadoHitoTrasRevision("AVANCE_1", "CONFORME")).toBe("APROBADO");
    expect(estadoHitoTrasRevision("AVANCE_1", "OBSERVADA")).toBe("OBSERVADO");
  });

  it("vencimiento de hitos", () => {
    expect(hitoVencido("HABILITADO", "2026-10-18", "2026-10-19")).toBe(true);
    expect(hitoVencido("ENTREGADO", "2026-10-18", "2026-10-19")).toBe(false);
    expect(assertTransicionHito("OBSERVADO", "NO_ENTREGADO").ok).toBe(true);
  });

  it("habilitar nueva entrega: solo no entregado, no fijo y con fecha futura", () => {
    expect(puedeReabrirHito("AVANCE_1", "NO_ENTREGADO", "2026-11-01", "2026-10-20").ok).toBe(true);
    expect(puedeReabrirHito("PLAN", "NO_ENTREGADO", "2026-11-01", "2026-10-20").ok).toBe(false);
    expect(puedeReabrirHito("AVANCE_1", "OBSERVADO", "2026-11-01", "2026-10-20").ok).toBe(false);
    expect(puedeReabrirHito("AVANCE_1", "NO_ENTREGADO", "2026-10-20", "2026-10-20").ok).toBe(false);
    expect(assertTransicionHito("NO_ENTREGADO", "HABILITADO").ok).toBe(true);
  });

  it("archivos: formato y tamaño", () => {
    expect(
      validarArchivo({ mime: "application/pdf", bytes: 1024 }, ["application/pdf"], 5).ok,
    ).toBe(true);
    expect(validarArchivo({ mime: "image/gif", bytes: 1024 }, ["application/pdf"], 5).ok).toBe(
      false,
    );
    expect(
      validarArchivo({ mime: "application/pdf", bytes: 6 * 1024 * 1024 }, ["application/pdf"], 5)
        .ok,
    ).toBe(false);
  });
});

describe("aprobar plan (D3)", () => {
  const base = {
    estadoHitoPlan: "ENTREGADO" as const,
    ultimaVersion: "ENTREGADA" as const,
    tieneExpediente: false,
    faltasConsecutivas: false,
    asistenciaBaja: false,
    pensionVencida: false,
  };
  it("aceptación #17: plan no entregado no se aprueba", () => {
    expect(
      evaluarAprobacionPlan({ ...base, estadoHitoPlan: "HABILITADO", ultimaVersion: null }, P).ok,
    ).toBe(false);
  });
  it("advertencias avisan sin bloquear por defecto", () => {
    const r = evaluarAprobacionPlan({ ...base, asistenciaBaja: true }, P);
    expect(r.ok && r.value.advertencias).toEqual(["Tiene asistencia baja"]);
    expect(
      evaluarAprobacionPlan({ ...base, asistenciaBaja: true }, { advertenciasPlanBloquean: true })
        .ok,
    ).toBe(false);
  });
  it("no se aprueba dos veces ni con la última versión observada", () => {
    expect(evaluarAprobacionPlan({ ...base, tieneExpediente: true }, P).ok).toBe(false);
    expect(evaluarAprobacionPlan({ ...base, ultimaVersion: "OBSERVADA" }, P).ok).toBe(false);
  });
});

describe("ficha y cierre (P11, P13)", () => {
  it("la ficha está completa con las 6 filas firmadas", () => {
    const seis = [2, 4, 6, 8, 10, 12].map((semana) => ({ semana, estado: "FIRMADO" as const }));
    expect(resumenFicha(seis).completa).toBe(true);
    const r = resumenFicha([
      { semana: 2, estado: "REVISADO" },
      { semana: 4, estado: "FIRMADO" },
    ]);
    expect(r).toEqual({ registros: 2, firmados: 1, completa: false, contador: "2 de 6 registros" });
  });
  it("registro de ficha", () => {
    expect(validarRegistroFicha(3, "x", "SIN_REVISION").ok).toBe(false);
    expect(validarRegistroFicha(2, "", "SIN_REVISION").ok).toBe(false);
    expect(validarRegistroFicha(2, "Acuerdos", "FIRMADO").ok).toBe(false);
    expect(validarRegistroFicha(2, "Acuerdos", "FIRMADO", "Corrección").ok).toBe(true);
  });
  it("aceptación #19: conformidad con observaciones sin levantar", () => {
    expect(
      puedeEmitirConformidad({
        tieneBorradorFinal: true,
        fichaCompletaYFirmada: true,
        observacionesLevantadas: false,
      }).ok,
    ).toBe(false);
    expect(
      puedeEmitirConformidad({
        tieneBorradorFinal: true,
        fichaCompletaYFirmada: true,
        observacionesLevantadas: true,
      }).ok,
    ).toBe(true);
  });
});

describe("pensiones (P8, P9)", () => {
  it("aceptación #20: no se sube comprobante en pensión VALIDADA", () => {
    expect(puedeSubirComprobante("VALIDADA").ok).toBe(false);
    expect(puedeSubirComprobante("EN_REVISION").ok).toBe(false);
    expect(puedeSubirComprobante("VENCIDA").ok).toBe(true);
    expect(puedeSubirComprobante("OBSERVADA").ok).toBe(true);
  });
  it("aceptación #21: observar sin motivo no se guarda", () => {
    expect(validarObservacionComprobante(" ").ok).toBe(false);
  });
  it("atraso y aviso", () => {
    expect(diasAtraso({ estado: "VENCIDA", fecha: "2026-10-31" }, "2026-11-05")).toBe(5);
    expect(diasAtraso({ estado: "VALIDADA", fecha: "2026-10-31" }, "2026-11-05")).toBe(0);
    expect(tocaAvisoPension({ estado: "PENDIENTE", fecha: "2026-10-31" }, "2026-10-28", P)).toBe(
      true,
    );
    expect(puedeTransitarPension("VALIDADA", "EN_REVISION")).toBe(false);
  });
});

describe("encuestas y parámetros", () => {
  it("puntajes 1–5 y mínimo de respuestas", () => {
    expect(validarPuntajes([1, 5, 3]).ok).toBe(true);
    expect(validarPuntajes([0]).ok).toBe(false);
    expect(resultadosVisibles(4, P)).toBe(false);
    expect(resultadosVisibles(5, P)).toBe(true);
  });
  it("resuelve parámetros guardados ignorando basura", () => {
    const p = resolverParametrosTaller([
      { clave: "cupoProyectos", valor: 12 },
      { clave: "umbralAsistenciaBaja", valor: "80" },
      { clave: "desconocida", valor: 1 },
    ]);
    expect(p.cupoProyectos).toBe(12);
    expect(p.umbralAsistenciaBaja).toBe(70);
  });
  it("sesión: REPROGRAMADA conserva el camino a REALIZADA", () => {
    expect(assertTransicionSesion("REPROGRAMADA", "REALIZADA").ok).toBe(true);
    expect(assertTransicionSesion("CANCELADA", "REALIZADA").ok).toBe(false);
  });
});

describe("grupos de horario y sesiones (P5, D2)", () => {
  const dias = [
    { horaInicio: "15:00", horaFin: "20:00" },
    { horaInicio: "08:00", horaFin: "13:00" },
  ];
  it("el horario del grupo cae dentro del bloque de un día", () => {
    expect(
      validarGrupoHorario({ nombre: "Grupo 1", horaInicio: "15:00", horaFin: "17:30" }, dias).ok,
    ).toBe(true);
    const r = validarGrupoHorario(
      { nombre: "Grupo 1", horaInicio: "14:00", horaFin: "16:00" },
      dias,
    );
    expect(!r.ok && r.error.errores[0]?.campo).toBe("horario");
    expect(
      validarGrupoHorario({ nombre: " ", horaInicio: "15:00", horaFin: "16:00" }, dias).ok,
    ).toBe(false);
  });
  it("reprogramar o agregar exige fecha, horario y motivo", () => {
    expect(
      validarSesionNueva({
        fecha: "2026-11-21",
        horaInicio: "15:00",
        horaFin: "20:00",
        motivo: "Feriado regional",
      }).ok,
    ).toBe(true);
    const r = validarSesionNueva({
      fecha: "2026-11-21",
      horaInicio: "15:00",
      horaFin: "20:00",
      motivo: "",
    });
    expect(!r.ok && r.error.errores.map((e) => e.campo)).toEqual(["motivo"]);
  });
});
