import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { alertasTallerContract } from "./alertas-taller.contract.js";
import { asesoresContract } from "./asesores.contract.js";
import { authContract } from "./auth.contract.js";
import { cierreContract } from "./cierre.contract.js";
import { configuracionContract } from "./configuracion.contract.js";
import { documentosContract } from "./documentos.contract.js";
import { encuestasTallerContract } from "./encuestas-taller.contract.js";
import { expedientesContract } from "./expedientes.contract.js";
import { fichaCierreContract } from "./ficha-cierre.contract.js";
import { hitosContract } from "./hitos.contract.js";
import { miTallerContract } from "./mi-taller.contract.js";
import { pagosTallerContract } from "./pagos-taller.contract.js";
import { programasContract } from "./programas.contract.js";
import { proyectosContract } from "./proyectos.contract.js";
import { seguimientoContract } from "./seguimiento.contract.js";
import { seguridadContract } from "./seguridad.contract.js";
import { sesionesContract } from "./sesiones.contract.js";
import { tallerConfiguracionContract } from "./taller-configuracion.contract.js";
import { talleresContract } from "./talleres.contract.js";

const c = initContract();

export const appContract = c.router({
  expedientes: expedientesContract,
  auth: authContract,
  documentos: documentosContract,
  talleres: talleresContract,
  proyectos: proyectosContract,
  sesiones: sesionesContract,
  hitos: hitosContract,
  miTaller: miTallerContract,
  encuestasTaller: encuestasTallerContract,
  alertasTaller: alertasTallerContract,
  fichaCierre: fichaCierreContract,
  pagosTaller: pagosTallerContract,
  asesores: asesoresContract,
  seguridad: seguridadContract,
  seguimiento: seguimientoContract,
  cierre: cierreContract,
  configuracion: configuracionContract,
  tallerConfiguracion: tallerConfiguracionContract,
  programas: programasContract,
  health: {
    method: "GET",
    path: "/api/health",
    responses: { 200: z.object({ ok: z.literal(true), version: z.string() }) },
    summary: "Healthcheck",
  },
});

export * from "./alertas-taller.contract.js";
export * from "./api-conventions.js";
export * from "./asesores.contract.js";
export * from "./auth.contract.js";
export * from "./cierre.contract.js";
export * from "./configuracion.contract.js";
export * from "./documentos.contract.js";
export * from "./encuestas-taller.contract.js";
export * from "./enums.js";
export * from "./expedientes.contract.js";
export * from "./ficha-cierre.contract.js";
export * from "./hitos.contract.js";
export * from "./mi-taller.contract.js";
export * from "./pagos-taller.contract.js";
export * from "./programas.contract.js";
export * from "./proyectos.contract.js";
export * from "./reportes.contract.js";
export * from "./seguimiento.contract.js";
export * from "./seguridad.contract.js";
export * from "./sesiones.contract.js";
export * from "./taller-configuracion.contract.js";
export * from "./talleres.contract.js";
