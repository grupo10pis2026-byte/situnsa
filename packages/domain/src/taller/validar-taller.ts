import { DomainError } from "../shared/domain-error.base.js";
import { fail, ok, type Result } from "../shared/result.js";
import type { DiaSesion } from "./calendario.js";
import { esFechaCivilValida } from "./fechas-civiles.js";

/**
 * §9 P2 "Errores que impiden guardar", con el campo al que pertenece cada
 * mensaje (§15: el error aparece junto al campo, en lenguaje simple).
 * El nombre repetido y el asesor no disponible dependen de la BD y los
 * verifica el use-case.
 */

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

export interface DatosTaller {
  nombre: string;
  periodo: string;
  inicio: string;
  fin: string;
  numeroSesiones: number;
  dias: DiaSesion[];
  cupoProyectos: number;
  enlaceSabado?: string | null;
  enlaceDomingo?: string | null;
  /** Montos de las 3 pensiones (soles) y fechas de la 2.ª y 3.ª. */
  pensiones: {
    montos: [number, number, number];
    fecha2: string;
    fecha3: string;
  };
  /** Al editar: proyectos ya asignados (el cupo no puede quedar por debajo). */
  proyectosAsignados?: number;
}

function enlaceInvalido(e: string | null | undefined): boolean {
  return e !== undefined && e !== null && e.trim() !== "" && !e.startsWith("https://");
}

export function erroresTaller(t: DatosTaller): ErrorCampo[] {
  const errores: ErrorCampo[] = [];
  const add = (campo: string, mensaje: string) => errores.push({ campo, mensaje });

  if (t.nombre.trim() === "") add("nombre", "Escribe el nombre del taller");
  if (t.periodo.trim() === "") add("periodo", "Escribe el período (por ejemplo 2026-II)");

  const inicioOk = esFechaCivilValida(t.inicio);
  const finOk = esFechaCivilValida(t.fin);
  if (!inicioOk) add("inicio", "Elige la fecha de inicio del curso");
  if (!finOk) add("fin", "Elige la fecha de fin del curso");
  if (inicioOk && finOk && t.fin <= t.inicio)
    add("fin", "El fin del curso debe ser posterior al inicio");

  if (!Number.isInteger(t.numeroSesiones) || t.numeroSesiones < 1)
    add("numeroSesiones", "El número de sesiones debe ser al menos 1");

  if (t.dias.length === 0) add("dias", "Marca al menos un día de sesión");
  const vistos = new Set<number>();
  for (const d of t.dias) {
    const campo = `horario.${d.dia}`;
    if (!Number.isInteger(d.dia) || d.dia < 1 || d.dia > 7) {
      add("dias", "Día de sesión inválido");
      continue;
    }
    if (vistos.has(d.dia)) add("dias", "Un día está marcado dos veces");
    vistos.add(d.dia);
    if (!HORA_RE.test(d.horaInicio) || !HORA_RE.test(d.horaFin))
      add(campo, "Escribe la hora con el formato HH:MM");
    else if (d.horaFin <= d.horaInicio)
      add(campo, "La hora de fin debe ser posterior a la de inicio");
  }

  if (!Number.isInteger(t.cupoProyectos) || t.cupoProyectos < 1)
    add("cupoProyectos", "El cupo debe ser al menos 1");
  else if (t.proyectosAsignados !== undefined && t.cupoProyectos < t.proyectosAsignados)
    add(
      "cupoProyectos",
      `El cupo no puede ser menor que los proyectos ya asignados (${t.proyectosAsignados})`,
    );

  if (enlaceInvalido(t.enlaceSabado)) add("enlaceSabado", "El enlace debe empezar con https://");
  if (enlaceInvalido(t.enlaceDomingo)) add("enlaceDomingo", "El enlace debe empezar con https://");

  t.pensiones.montos.forEach((m, i) => {
    if (!Number.isFinite(m) || m <= 0)
      add(`pension.${i + 1}.monto`, "El monto debe ser mayor que cero");
  });
  const f2 = esFechaCivilValida(t.pensiones.fecha2);
  const f3 = esFechaCivilValida(t.pensiones.fecha3);
  if (!f2) add("pension.2.fecha", "Elige la fecha de la 2.ª pensión");
  if (!f3) add("pension.3.fecha", "Elige la fecha de la 3.ª pensión");
  if (f2 && f3 && t.pensiones.fecha3 <= t.pensiones.fecha2)
    add("pension.3.fecha", "La 3.ª pensión debe ser posterior a la 2.ª");

  return errores;
}

/** Variante Result: falla con el primer error (los demás van en `errores`). */
export function validarTaller(
  t: DatosTaller,
): Result<true, DomainError & { errores: ErrorCampo[] }> {
  const errores = erroresTaller(t);
  if (errores.length === 0) return ok(true);
  const e = Object.assign(new DomainError("VALIDACION_FALLIDA", errores[0]?.mensaje ?? ""), {
    errores,
  });
  return fail(e);
}
