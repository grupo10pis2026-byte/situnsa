import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transporte de correo (pendiente P2 del README, ahora real): SMTP vía
 * nodemailer. En dev apunta a Mailpit (SMTP_HOST=localhost, SMTP_PORT=1025)
 * y en prod al relay institucional. Sin SMTP_HOST el envío se registra en
 * el log (modo degradado), nunca se pierde en silencio.
 */

export interface MensajeCorreo {
  para: string[];
  asunto: string;
  html: string;
  texto: string;
}

export interface ResultadoEnvio {
  enviado: boolean;
  modo: "smtp" | "log";
}

let transporte: Transporter | null = null;

/** Configura SMTP sin acceso a archivos/URLs del host desde el contenido del mensaje. */
function crearTransporte(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const puerto = Number(process.env.SMTP_PORT || 587);
  const usuario = process.env.SMTP_USER;
  return nodemailer.createTransport({
    disableFileAccess: true,
    disableUrlAccess: true,
    host,
    port: puerto,
    secure: process.env.SMTP_SECURE === "true" || puerto === 465,
    ...(usuario ? { auth: { user: usuario, pass: process.env.SMTP_PASS ?? "" } } : {}),
  });
}

/** Resuelve el remitente institucional configurado sin exponer credenciales SMTP. */
function remitente(): string {
  return process.env.MAIL_FROM || "no-reply@fips.unsa.edu.pe";
}

/** Envía mensajes de los casos de uso tras el commit; no es un endpoint HTTP ni revisión editorial. */
export async function enviarCorreo(m: MensajeCorreo): Promise<ResultadoEnvio> {
  const para = [...new Set(m.para.map((p) => p.trim()).filter(Boolean))];
  if (para.length === 0) return { enviado: false, modo: "log" };
  transporte ??= crearTransporte();
  if (!transporte) {
    console.log(JSON.stringify({ canal: "correo", modo: "log", para, asunto: m.asunto }));
    return { enviado: false, modo: "log" };
  }
  await transporte.sendMail({
    from: `"Titulación FIPS UNSA" <${remitente()}>`,
    to: para.join(", "),
    subject: m.asunto,
    text: m.texto,
    html: m.html,
  });
  return { enviado: true, modo: "smtp" };
}

/**
 * URL pública de la web (enlaces de los correos). APP_URL manda; en Render,
 * sin APP_URL, se usa la URL pública que la plataforma inyecta.
 */
export function urlPortal(ruta = "/"): string {
  const base = (
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");
  return `${base}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
}
