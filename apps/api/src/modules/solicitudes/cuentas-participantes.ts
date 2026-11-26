import { type DbExecutor, solicitudParticipantes, usuarios } from "@pis/db";
import { DomainError, fail, ok, type Result } from "@pis/domain";
import { eq } from "drizzle-orm";
import { asignarRol } from "../seguridad/roles.repository.js";

/** Cuenta del portal vinculada a un participante de la solicitud. */
export interface CuentaParticipante {
  orden: number;
  dni: string;
  usuarioId: string;
  email: string;
  nombres: string;
  /** Sin clave: necesita el enlace de activación (o entrar con Google). */
  requiereActivacion: boolean;
  activo: boolean;
}

/**
 * Crea o sincroniza la cuenta TESISTA de cada participante y la vincula a la
 * solicitud (`solicitud_participantes.usuario_id`). Idempotente: se usa al
 * observar (para que el tesista corrija desde el portal) y al aceptar.
 *
 * Las cuentas nuevas nacen SIN clave: nunca se envían contraseñas por correo
 * (CR-MOD-OBT-001, D-2). Debe correr dentro de la transacción del caso de uso.
 */
export async function sincronizarCuentasParticipantes(
  tx: DbExecutor,
  solicitudId: string,
): Promise<Result<CuentaParticipante[], DomainError>> {
  const parts = await tx
    .select()
    .from(solicitudParticipantes)
    .where(eq(solicitudParticipantes.solicitudId, solicitudId));

  const cuentas: CuentaParticipante[] = [];
  for (const part of parts.sort((a, b) => a.orden - b.orden)) {
    const [existente] = await tx.select().from(usuarios).where(eq(usuarios.dni, part.dni)).limit(1);

    let usuarioId: string;
    let requiereActivacion: boolean;
    let activo: boolean;
    if (existente) {
      // Sincronizar datos de contacto actualizados
      await tx
        .update(usuarios)
        .set({
          telefono: part.telefono ?? existente.telefono,
          ciudad: part.ciudad ?? existente.ciudad,
          direccion: part.direccion ?? existente.direccion,
        })
        .where(eq(usuarios.id, existente.id));
      usuarioId = existente.id;
      requiereActivacion = !existente.passwordHash;
      activo = existente.activo ?? true;
    } else {
      const [creado] = await tx
        .insert(usuarios)
        .values({
          dni: part.dni,
          cui: part.cui ?? null,
          email: part.email.trim().toLowerCase(),
          nombres: part.nombres,
          apellidos: part.apellidos,
          telefono: part.telefono ?? null,
          ciudad: part.ciudad ?? null,
          direccion: part.direccion ?? null,
          rol: "TESISTA",
          passwordHash: null,
        })
        .returning({ id: usuarios.id });
      if (!creado) {
        return fail(
          new DomainError("VALIDACION_FALLIDA", `No se pudo crear usuario para DNI ${part.dni}`),
        );
      }
      usuarioId = creado.id;
      requiereActivacion = true;
      activo = true;
    }

    await asignarRol(tx, usuarioId, "TESISTA");
    if (part.usuarioId !== usuarioId) {
      await tx
        .update(solicitudParticipantes)
        .set({ usuarioId })
        .where(eq(solicitudParticipantes.id, part.id));
    }
    cuentas.push({
      orden: part.orden,
      dni: part.dni,
      usuarioId,
      email: part.email.trim().toLowerCase(),
      nombres: part.nombres,
      requiereActivacion,
      activo,
    });
  }
  return ok(cuentas);
}
