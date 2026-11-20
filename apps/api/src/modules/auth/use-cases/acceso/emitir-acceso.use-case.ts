import { db, TOKEN_ACCESO_HORAS, tokensAcceso, usuarios } from "@pis/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { type CorreoPayload, enqueueCorreo } from "../../../../infra/jobs/colas.js";
import { urlPortal } from "../../../../infra/mail/correo.service.js";
import { nuevoTokenAcceso, type PropositoToken } from "./tokens-acceso.js";

export interface AccesoEmitido {
  usuarioId: string;
  email: string;
}

/** Contexto opcional del correo: alta de cuenta al aprobar una solicitud. */
export interface ContextoAcceso {
  codigoExpediente?: string;
}

/**
 * Emite enlaces de un solo uso (activación del portal o restablecimiento de
 * clave) y los envía por correo. Invalida los enlaces anteriores sin usar del
 * mismo propósito. Solo usuarios activos.
 */
export class EmitirAccesoUseCase {
  async execute(
    usuarioIds: readonly string[],
    proposito: PropositoToken,
    ahora: Date = new Date(),
    contexto: ContextoAcceso = {},
  ): Promise<AccesoEmitido[]> {
    if (usuarioIds.length === 0) return [];
    const uow = new DrizzleUnitOfWork(db);
    const emitidos = await uow.run(async (tx) => {
      const gente = await tx
        .select({
          id: usuarios.id,
          email: usuarios.email,
          nombres: usuarios.nombres,
          dni: usuarios.dni,
        })
        .from(usuarios)
        .where(and(inArray(usuarios.id, [...usuarioIds]), eq(usuarios.activo, true)));
      const out: Array<AccesoEmitido & { token: string; nombres: string; dni: string }> = [];
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
        out.push({
          usuarioId: u.id,
          email: u.email,
          token: t.token,
          nombres: u.nombres,
          dni: u.dni,
        });
      }
      return out;
    });
    for (const e of emitidos) {
      await enqueueCorreo(correoAcceso(proposito, e, contexto));
    }
    return emitidos.map(({ usuarioId, email }) => ({ usuarioId, email }));
  }
}

/** Correo de activación / restablecimiento (bloques estructurados, sin HTML). */
export function correoAcceso(
  proposito: PropositoToken,
  e: { email: string; token: string; nombres: string; dni: string },
  contexto: ContextoAcceso = {},
): CorreoPayload {
  const enlace = urlPortal(`/activar?token=${encodeURIComponent(e.token)}`);
  const vigencia = `El enlace es personal, vence en ${TOKEN_ACCESO_HORAS} horas y solo puede usarse una vez. Si vence, solicita uno nuevo con la opción "¿Primera vez u olvidaste tu clave?" del inicio de sesión.`;
  if (proposito === "RESTABLECER") {
    return {
      para: [e.email],
      aParticipantes: false,
      asunto: "Restablece tu clave del Sistema de Titulación FIPS",
      titulo: "Restablecimiento de clave",
      etiqueta: "Seguridad de la cuenta",
      variante: "informativo",
      saludo: `Hola, ${e.nombres}:`,
      texto:
        "Recibimos una solicitud para restablecer tu clave. Si no la hiciste, ignora este mensaje: tu clave actual sigue vigente.",
      enlace,
      textoEnlace: "Restablecer mi clave",
      nota: vigencia,
    };
  }
  const { codigoExpediente } = contexto;
  return {
    para: [e.email],
    aParticipantes: false,
    asunto: codigoExpediente
      ? `¡Solicitud aprobada! Activa tu acceso – Expediente ${codigoExpediente}`
      : "Activa tu acceso al Sistema de Titulación FIPS",
    titulo: codigoExpediente
      ? "Bienvenido(a) al Sistema de Titulación"
      : "Tu portal de titulación está listo",
    etiqueta: codigoExpediente ? "Cuenta creada" : "Activación de cuenta",
    variante: "exito",
    saludo: `Hola, ${e.nombres}:`,
    texto: codigoExpediente
      ? `Tu solicitud fue aprobada y se registró tu expediente de titulación con el código **${codigoExpediente}**. También creamos tu cuenta en el portal.\n\nPara ingresar, crea tu clave con el botón de abajo. Desde el portal podrás seguir tu trámite, cargar documentos y recibir notificaciones.`
      : "Tu cuenta en el portal de titulación está lista. Crea tu clave para consultar tu trámite, cargar tus documentos y recibir notificaciones.",
    datos: [
      ...(codigoExpediente ? [{ etiqueta: "Expediente", valor: codigoExpediente }] : []),
      { etiqueta: "Usuario (DNI)", valor: e.dni },
    ],
    enlace,
    textoEnlace: "Crear mi clave",
    nota: vigencia,
  };
}
