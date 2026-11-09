import { db } from "@pis/db";
import { esPersonal, type Perfil, permite, ROL_ADMIN } from "../../infra/auth/autorizacion.js";
import { alumnoEnTaller, type ProyectoBase, proyectoPorId, tallerPorId } from "./taller-http.js";

/**
 * Qué puede hacer cada actor sobre un proyecto o un taller (spec v1.0 §4).
 * - Asesor del taller (y Administrador en la Fase A): habilita, revisa,
 *   aprueba el plan, registra la ficha y cierra la asesoría.
 * - Secretaría del Taller (`taller.crear`): consulta, valida pagos, retiros.
 * - Alumno: solo lo suyo (sube entregas y comprobantes).
 */

export interface CapacidadesProyectoActor {
  proyecto: ProyectoBase;
  ver: boolean;
  gestionar: boolean;
  subir: boolean;
  secretaria: boolean;
}

export async function capacidadesProyecto(
  perfil: Perfil,
  actorId: string,
  proyectoId: string,
): Promise<CapacidadesProyectoActor | null> {
  const p = await proyectoPorId(db, proyectoId);
  if (!p) return null;
  const admin = perfil.roles.includes(ROL_ADMIN);
  const asesor = perfil.roles.includes("ASESOR") && p.asesorId === actorId;
  const alumno = p.alumnos.includes(actorId);
  return {
    proyecto: p,
    ver: esPersonal(perfil.roles) || asesor || alumno,
    gestionar: admin || asesor,
    subir: alumno,
    secretaria: admin || permite(perfil, "taller", "crear"),
  };
}

export interface CapacidadesTallerActor {
  ver: boolean;
  verComoAlumno: boolean;
  gestionar: boolean;
  secretaria: boolean;
  asesorId: string | null;
}

export async function capacidadesTallerActor(
  perfil: Perfil,
  actorId: string,
  tallerId: string,
): Promise<CapacidadesTallerActor | null> {
  const t = await tallerPorId(db, tallerId);
  if (!t) return null;
  const admin = perfil.roles.includes(ROL_ADMIN);
  const asesor = perfil.roles.includes("ASESOR") && t.asesorId === actorId;
  const personal = esPersonal(perfil.roles);
  const alumno = !personal && !asesor ? await alumnoEnTaller(db, tallerId, actorId) : false;
  return {
    ver: personal || asesor,
    verComoAlumno: alumno,
    gestionar: admin || asesor,
    secretaria: admin || permite(perfil, "taller", "crear"),
    asesorId: t.asesorId,
  };
}
