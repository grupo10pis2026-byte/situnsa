import { sumarDiasHabiles } from "../expediente/dias-habiles.js";

/*
 * EN SUSPENSO (2026-11-26): por decisión del cliente la observación de una
 * solicitud no tiene fecha límite; la API y la web no usan estas funciones.
 * Se conservan (puras y probadas) por si el plazo se reactiva.
 */

/** Días hábiles por defecto otorgados al postulante para subsanar observaciones (RF-02xx[009]). */
export const DIAS_HABILES_SUBSANACION_DEFAULT = 10;

/**
 * Calcula la fecha límite de subsanación de una solicitud observada
 * aplicando el calendario de días hábiles de la UNSA (excluyendo sábados,
 * domingos y feriados oficiales peruanos).
 */
export function calcularLimiteSubsanacion(
  fechaDesde: Date = new Date(),
  diasHabiles: number = DIAS_HABILES_SUBSANACION_DEFAULT,
  feriadosExtra?: ReadonlySet<string>,
): Date {
  return sumarDiasHabiles(fechaDesde, diasHabiles, feriadosExtra);
}

/**
 * Determina si una solicitud observada ha sobrepasado su fecha límite de subsanación.
 * La solicitud se mantiene en estado OBSERVADA, pero activa advertencia visual (RF-02xx[009]).
 */
export function estaSubsanacionVencida(
  fechaLimite: Date,
  fechaReferencia: Date = new Date(),
): boolean {
  return fechaReferencia.getTime() > fechaLimite.getTime();
}
