import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

export const LoginLocalSchema = z.object({
  identificador: z.string().min(2).max(255).describe("DNI, CUI o correo"),
  password: z.string().min(1).max(128),
});

export const SesionDTOSchema = z.object({
  userId: z.string().uuid(),
  dni: z.string(),
  nombres: z.string(),
  email: z.string().email(),
  rol: z.string(),
});

export type SesionDTO = z.infer<typeof SesionDTOSchema>;

/** Par emitido al autenticar: acceso JWT 15min + refresh HttpOnly 8h (cookie). */
export const ParSesionSchema = z.object({
  usuario: SesionDTOSchema,
  accessToken: z.string(),
  expiraEn: z.number(),
});

/** Política de clave (S-FIPS): mínimo 8 caracteres con letras y números. */
export const ClaveNuevaSchema = z
  .string()
  .min(8, "La clave debe tener al menos 8 caracteres")
  .max(128)
  .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, "La clave debe incluir letras")
  .regex(/\d/, "La clave debe incluir números");

export const ActivarCuentaSchema = z.object({
  token: z.string().min(20).max(200),
  password: ClaveNuevaSchema,
});

export const SolicitarRestablecimientoSchema = z.object({
  identificador: z.string().min(2).max(255).describe("DNI, CUI o correo"),
});

/**
 * Configuración pública del acceso con Google: la web solo muestra el botón
 * si hay `clientId`. `dominio` = único dominio de Workspace admitido.
 */
export const ConfigGoogleSchema = z.object({
  clientId: z.string().nullable(),
  dominio: z.string(),
});
export type ConfigGoogle = z.infer<typeof ConfigGoogleSchema>;

const c = initContract();

export const authContract = c.router({
  loginLocal: {
    method: "POST",
    path: "/api/auth/login",
    body: LoginLocalSchema,
    responses: { 200: ParSesionSchema, 401: ErrorEnvelopeSchema },
    summary: "Login local: DNI/CUI/correo + bcrypt, bloqueo 5×15min",
  },
  configGoogle: {
    method: "GET",
    path: "/api/auth/google/config",
    responses: { 200: ConfigGoogleSchema },
    summary: "Client ID de Google OIDC y dominio institucional admitido (público)",
  },
  loginGoogle: {
    method: "POST",
    path: "/api/auth/google",
    body: z.object({ idToken: z.string().min(10) }),
    responses: { 200: ParSesionSchema, 401: ErrorEnvelopeSchema, 501: ErrorEnvelopeSchema },
    summary:
      "Google OIDC: solo cuentas @unsa.edu.pe de usuarios activos existentes (sin autocreación)",
  },
  refresh: {
    method: "POST",
    path: "/api/auth/refresh",
    body: z.object({}),
    responses: {
      200: z.object({ accessToken: z.string(), expiraEn: z.number() }),
      401: ErrorEnvelopeSchema,
    },
    summary: "Refresh rotativo (cookie HttpOnly)",
  },
  logout: {
    method: "POST",
    path: "/api/auth/logout",
    body: z.object({}),
    responses: { 200: z.object({ ok: z.literal(true) }) },
    summary: "Revoca la sesión actual",
  },
  activar: {
    method: "POST",
    path: "/api/auth/activar",
    body: ActivarCuentaSchema,
    responses: {
      200: z.object({ ok: z.literal(true), dni: z.string() }),
      400: ErrorEnvelopeSchema,
    },
    summary: "Fija la clave con un enlace de un solo uso (activación o restablecimiento)",
  },
  solicitarRestablecimiento: {
    method: "POST",
    path: "/api/auth/restablecer",
    body: SolicitarRestablecimientoSchema,
    responses: { 202: z.object({ ok: z.literal(true) }) },
    summary: "Envía un enlace de restablecimiento (respuesta idéntica exista o no la cuenta)",
  },
  sesion: {
    method: "GET",
    path: "/api/auth/sesion",
    responses: { 200: SesionDTOSchema, 401: ErrorEnvelopeSchema },
    summary: "Sesión actual (Bearer)",
  },
});
