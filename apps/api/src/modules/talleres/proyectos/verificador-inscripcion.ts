import { type DbExecutor, usuarios } from "@pis/db";
import { eq } from "drizzle-orm";

/**
 * ¿El alumno tiene su inscripción al Taller validada? (spec v1.0 §10 D1).
 *
 * La inscripción y su validación son de otro módulo (formulario público y
 * bandeja de validación). Mientras no exista en `main`, la regla por defecto
 * es: hay un usuario TESISTA activo con ese DNI (la validación crea su
 * cuenta). Cuando llegue el módulo de solicitudes, se reemplaza esta
 * implementación por una que lea la solicitud VALIDADA de la vía Taller.
 */
export interface VerificadorInscripcion {
  alumnoPorDni(
    tx: DbExecutor,
    dni: string,
  ): Promise<{ id: string; nombre: string; email: string; validada: boolean } | null>;
}

export const verificadorPorCuentaTesista: VerificadorInscripcion = {
  async alumnoPorDni(tx, dni) {
    const [u] = await tx
      .select({
        id: usuarios.id,
        nombres: usuarios.nombres,
        apellidos: usuarios.apellidos,
        email: usuarios.email,
        rol: usuarios.rol,
        activo: usuarios.activo,
      })
      .from(usuarios)
      .where(eq(usuarios.dni, dni))
      .limit(1);
    if (!u) return null;
    return {
      id: u.id,
      nombre: `${u.nombres} ${u.apellidos}`,
      email: u.email,
      validada: u.rol === "TESISTA" && u.activo,
    };
  },
};
