import { DomainError } from "../shared/domain-error.base.js";
import { fail, ok, type Result } from "../shared/result.js";
import { normalizarTexto } from "./configuracion.js";

/**
 * Asesores del taller (spec v1.0 §9 P15 y P10): datos personales, correo
 * institucional, disponibilidad y archivos del perfil.
 */

export const DOMINIO_CORREO_INSTITUCIONAL = "unsa.edu.pe";

/** Grados que ofrece el formulario (spec P15: "Grado (Dr./Mg.)"). */
export const GRADOS_ASESOR = ["Dr.", "Mg."] as const;

/** Archivos del perfil (CV y otros): solo PDF. */
export const FORMATOS_ARCHIVO_ASESOR = ["application/pdf"] as const;
export const MAX_MB_ARCHIVO_ASESOR = 10;

export interface ErrorCampoAsesor {
  campo: "dni" | "nombres" | "apellidos" | "email" | "telefono" | "grado";
  mensaje: string;
}

export interface DatosAsesor {
  dni: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  grado: string | null;
}

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_RE = /^\+?[0-9 ]{6,20}$/;

/** Normaliza y valida los datos de P15. Devuelve todos los errores, cada uno con su campo. */
export function validarDatosAsesor(
  input: DatosAsesor,
): Result<DatosAsesor, DomainError & { errores: ErrorCampoAsesor[] }> {
  const errores: ErrorCampoAsesor[] = [];
  const dni = input.dni.trim();
  const nombres = normalizarTexto(input.nombres);
  const apellidos = normalizarTexto(input.apellidos);
  const email = input.email.trim().toLowerCase();
  const telefono = input.telefono === null ? "" : normalizarTexto(input.telefono);
  const grado = input.grado === null ? "" : normalizarTexto(input.grado);

  if (!/^\d{8}$/.test(dni)) errores.push({ campo: "dni", mensaje: "El DNI tiene 8 dígitos" });
  if (nombres.length < 2) errores.push({ campo: "nombres", mensaje: "Escribe los nombres" });
  if (apellidos.length < 2) errores.push({ campo: "apellidos", mensaje: "Escribe los apellidos" });
  if (nombres.length > 160 || apellidos.length > 160)
    errores.push({ campo: "nombres", mensaje: "El nombre es demasiado largo" });
  if (!CORREO_RE.test(email)) errores.push({ campo: "email", mensaje: "Escribe un correo válido" });
  else if (!email.endsWith(`@${DOMINIO_CORREO_INSTITUCIONAL}`))
    errores.push({
      campo: "email",
      mensaje: `Usa el correo institucional (@${DOMINIO_CORREO_INSTITUCIONAL})`,
    });
  if (telefono !== "" && !TELEFONO_RE.test(telefono))
    errores.push({ campo: "telefono", mensaje: "Escribe solo números (6 a 20)" });
  if (grado.length > 16) errores.push({ campo: "grado", mensaje: "El grado es demasiado largo" });

  if (errores.length > 0) {
    const e = Object.assign(new DomainError("VALIDACION_FALLIDA", errores[0]?.mensaje ?? ""), {
      errores,
    });
    return fail(e);
  }
  return ok({
    dni,
    nombres,
    apellidos,
    email,
    telefono: telefono === "" ? null : telefono,
    grado: grado === "" ? null : grado,
  });
}

export type DisponibilidadAsesor = "DISPONIBLE" | "CON_TALLER_ACTIVO";

/** §6 Asesor: disponibilidad calculada (un asesor, un taller vigente). */
export function disponibilidadAsesor(tallerVigente: object | null): DisponibilidadAsesor {
  return tallerVigente === null ? "DISPONIBLE" : "CON_TALLER_ACTIVO";
}

/** §9 P2: solo se ofrecen asesores activos y sin taller vigente. */
export function puedeRecibirTaller(asesor: {
  activo: boolean;
  tallerVigente: object | null;
}): Result<true, DomainError> {
  if (!asesor.activo)
    return fail(new DomainError("REQUISITO_PENDIENTE", "El asesor está inactivo"));
  if (asesor.tallerVigente !== null)
    return fail(new DomainError("REQUISITO_PENDIENTE", "El asesor ya tiene un taller activo"));
  return ok(true);
}
