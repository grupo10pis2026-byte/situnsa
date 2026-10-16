import { db, expedientes } from "@pis/db";
import { eq } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type PgBoss from "pg-boss";
import { RegistrarDocumentoService } from "../../modules/documentos/services/registrar-documento.service.js";

const REGEX_CODIGO_SET = /\[?(SET[-_\s]?\d{3,5})\]?/i;

export class InboundEmailService {
  private readonly registrarService: RegistrarDocumentoService;

  constructor(boss?: PgBoss) {
    this.registrarService = new RegistrarDocumentoService(boss);
  }

  async procesarBandejaEntrada(): Promise<void> {
    if (process.env.INBOUND_EMAIL_ENABLED !== "true") return;
    if (!process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
      console.warn(
        "[InboundEmailService] IMAP habilitado pero faltan credenciales (IMAP_USER o IMAP_PASSWORD)",
      );
      return;
    }

    const client = new ImapFlow({
      host: process.env.IMAP_HOST ?? "imap.gmail.com",
      port: Number(process.env.IMAP_PORT ?? 993),
      secure: true,
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASSWORD,
      },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        // Buscar únicamente mensajes no leídos
        for await (const message of client.fetch({ seen: false }, { source: true, uid: true })) {
          if (!message.source) continue;
          const parsed = await simpleParser(message.source);
          const asunto = parsed.subject ?? "";
          const cuerpo = typeof parsed.text === "string" ? parsed.text : "";

          // Intentar extraer el código SET del asunto o del cuerpo
          const match = asunto.match(REGEX_CODIGO_SET) ?? cuerpo.match(REGEX_CODIGO_SET);
          if (!match || !match[1]) continue; // Si no contiene código de trámite, no intervenir

          const codigoNormalizado = match[1].replace(/[-_\s]/g, "").toUpperCase();

          // Buscar el expediente correspondiente en la base de datos
          const [exp] = await db
            .select({ id: expedientes.id })
            .from(expedientes)
            .where(eq(expedientes.codigo, codigoNormalizado))
            .limit(1);

          if (!exp) continue;

          // Procesar los adjuntos que sean PDFs auténticos
          let procesadoConExito = false;
          if (parsed.attachments && Array.isArray(parsed.attachments)) {
            for (const attachment of parsed.attachments) {
              if (attachment.contentType === "application/pdf" && attachment.content) {
                const resultado = await this.registrarService.procesar({
                  expedienteId: exp.id,
                  tipo: "ADJUNTO_CORREO_INSTITUCIONAL",
                  filenameOriginal: attachment.filename ?? "documento_adjunto.pdf",
                  bytes: new Uint8Array(attachment.content),
                  origen: "CORREO",
                  origenMetadata: JSON.stringify({
                    de: parsed.from?.text,
                    asunto,
                    messageId: parsed.messageId,
                    fecha: parsed.date?.toISOString(),
                  }),
                  actor: { id: "inbound-email-worker", dni: "00000000" },
                });

                if (resultado.ok) {
                  procesadoConExito = true;
                }
              }
            }
          }

          // Marcar el correo como leído en el servidor IMAP
          if (procesadoConExito) {
            await client.messageFlagsAdd({ uid: message.uid }, ["\\Seen"]);
          }
        }
      } finally {
        lock.release();
        await client.logout();
      }
    } catch (error) {
      console.error("[InboundEmailService] Error procesando bandeja de entrada:", error);
    }
  }
}
