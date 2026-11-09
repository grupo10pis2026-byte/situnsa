import { db, tokensAcceso, usuarios } from "@pis/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import { urlPortal } from "../../../../infra/mail/correo.service.js";
import { nuevoTokenAcceso, type PropositoToken } from "./tokens-acceso.js";

export interface AccesoEmitido {
  usuarioId: string;
  email: string;
}

/**
 * Emite enlaces de un solo uso (activación del portal o restablecimiento de
 * clave) y los envía por correo. Invalida los enlaces anteriores sin usar del
 * mismo propósito. Solo usuarios activos.
 */
/** Texto de bienvenida de la activación según a quién se le crea la cuenta. */
export type PerfilAcceso = "TESISTA" | "ASESOR";

function textoActivacion(perfil: PerfilAcceso, nombres: string): string {
  return perfil === "ASESOR"
    ? `Hola ${nombres}: la Secretaría del Taller de Tesis te registró como asesor. Crea tu clave para gestionar tu taller, registrar la asistencia y revisar los avances de tus tesistas. El enlace vence en 72 horas y solo puede usarse una vez.`
    : `Hola ${nombres}: tu expediente fue validado. Crea tu clave para consultar tu trámite, cargar tus documentos y recibir notificaciones. El enlace vence en 72 horas y solo puede usarse una vez.`;
}

export class EmitirAccesoUseCase {
  async execute(
    usuarioIds: readonly string[],
    proposito: PropositoToken,
    ahora: Date = new Date(),
    perfil: PerfilAcceso = "TESISTA",
  ): Promise<AccesoEmitido[]> {
    if (usuarioIds.length === 0) return [];
    const uow = new DrizzleUnitOfWork(db);
    const emitidos = await uow.run(async (tx) => {
      const gente = await tx
        .select({ id: usuarios.id, email: usuarios.email, nombres: usuarios.nombres })
        .from(usuarios)
        .where(and(inArray(usuarios.id, [...usuarioIds]), eq(usuarios.activo, true)));
      const out: Array<AccesoEmitido & { token: string; nombres: string }> = [];
      for (const u of gente) {
        await tx
          .update(tokensAcceso)
          .set({ usadoAt: ahora })
          .where(
            and(
              eq(tokensAcceso.usuarioId, u.id),
              eq(tokensAcceso.proposito, proposito),
              isNull(tokensAcceso.usadoAt),
            ),
          );
        const t = nuevoTokenAcceso(ahora);
        await tx
          .insert(tokensAcceso)
          .values({ usuarioId: u.id, hash: t.hash, proposito, expiraAt: t.expiraAt });
        out.push({ usuarioId: u.id, email: u.email, token: t.token, nombres: u.nombres });
      }
      return out;
    });
    for (const e of emitidos) {
      const activacion = proposito === "ACTIVACION";
      await enqueueCorreo({
        para: [e.email],
        aParticipantes: false,
        asunto: activacion
          ? "Activa tu acceso al Sistema de Titulación FIPS"
          : "Restablece tu clave del Sistema de Titulación FIPS",
        titulo: activacion
          ? perfil === "ASESOR"
            ? "Tu acceso como asesor está listo"
            : "Tu portal de titulación está listo"
          : "Restablecimiento de clave",
        texto: activacion
          ? textoActivacion(perfil, e.nombres)
          : `Hola ${e.nombres}: recibimos una solicitud para restablecer tu clave. Si no la hiciste, ignora este mensaje. El enlace vence en 72 horas y solo puede usarse una vez.`,
        enlace: urlPortal(`/activar?token=${encodeURIComponent(e.token)}`),
        textoEnlace: activacion ? "Crear mi clave" : "Restablecer mi clave",
      });
    }
    return emitidos.map(({ usuarioId, email }) => ({ usuarioId, email }));
  }
}
