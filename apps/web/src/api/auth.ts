import {
  type ConfigGoogle,
  ConfigGoogleSchema,
  ParSesionSchema,
  type SesionDTO,
} from "@pis/contracts";
import { apiBaseUrl } from "./client.js";

export type { SesionDTO };

export interface ParSesion {
  usuario: SesionDTO;
  accessToken: string;
  expiraEn: number;
}

/** Login local: DNI/CUI/correo + clave (el refresh viaja en cookie HttpOnly). */
export async function loginRequest(identificador: string, password: string): Promise<ParSesion> {
  const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { codigo?: string; mensaje?: string };
    } | null;
    const codigo = body?.error?.codigo;
    if (codigo === "CUENTA_BLOQUEADA") {
      throw new Error(body?.error?.mensaje ?? "Cuenta bloqueada temporalmente");
    }
    if (codigo === "SIN_CLAVE") {
      throw new Error(
        "Tu cuenta aún no tiene clave: usa el enlace del correo de activación o solicita uno nuevo en «¿Primera vez u olvidaste tu clave?».",
      );
    }
    throw new Error("Credenciales inválidas o usuario inactivo");
  }
  return ParSesionSchema.parse(await res.json());
}

/** Client ID de Google y dominio admitido; sin `clientId` no se muestra el botón. */
export async function configGoogleRequest(): Promise<ConfigGoogle> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/google/config`, { credentials: "include" });
    if (!res.ok) return { clientId: null, dominio: "unsa.edu.pe" };
    return ConfigGoogleSchema.parse(await res.json());
  } catch {
    return { clientId: null, dominio: "unsa.edu.pe" };
  }
}

/**
 * Login con el ID token de Google Identity Services. El servidor exige cuenta
 * del Workspace institucional y un usuario activo ya registrado.
 */
export async function loginGoogleRequest(idToken: string): Promise<ParSesion> {
  const res = await fetch(`${apiBaseUrl}/api/auth/google`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { codigo?: string; mensaje?: string };
    } | null;
    const codigo = body?.error?.codigo;
    if (codigo === "DOMINIO_NO_PERMITIDO") {
      throw new Error(body?.error?.mensaje ?? "Usa tu cuenta institucional @unsa.edu.pe");
    }
    if (codigo === "SIN_CUENTA") {
      throw new Error(
        "Tu correo institucional no tiene una cuenta activa en el sistema. Si enviaste una solicitud, espera el correo del área de titulación.",
      );
    }
    throw new Error("No se pudo iniciar sesión con Google. Intenta nuevamente.");
  }
  return ParSesionSchema.parse(await res.json());
}

/** Fija la clave con el enlace de un solo uso (activación o restablecimiento). */
export async function activarCuentaRequest(
  token: string,
  password: string,
): Promise<{ dni: string }> {
  const res = await fetch(`${apiBaseUrl}/api/auth/activar`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const body = (await res.json().catch(() => null)) as {
    dni?: string;
    error?: { mensaje?: string };
  } | null;
  if (!res.ok) throw new Error(body?.error?.mensaje ?? "No se pudo activar la cuenta");
  return { dni: body?.dni ?? "" };
}

/** Solicita un enlace de restablecimiento (respuesta idéntica exista o no la cuenta). */
export async function solicitarRestablecimientoRequest(identificador: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/auth/restablecer`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador }),
  });
  if (!res.ok && res.status !== 202) throw new Error("No se pudo procesar la solicitud");
}

/** Refresh rotativo con la cookie; null si no hay sesión. */
export async function refreshRequest(): Promise<{ accessToken: string; expiraEn: number } | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) return null;
    return (await res.json()) as { accessToken: string; expiraEn: number };
  } catch {
    return null;
  }
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${apiBaseUrl}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    /* best effort */
  }
}

/** Sesión actual con el token vigente (post-refresh de arranque). */
export async function sesionRequest(accessToken: string): Promise<SesionDTO | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/sesion`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as SesionDTO;
  } catch {
    return null;
  }
}

/** Destino post-login por rol (§3 Navegación). */
export function destinoPorRol(rol: string): string {
  if (rol === "TESISTA") return "/mi-tramite";
  if (rol === "ASESOR" || rol === "JURADO") return "/asesor";
  return "/admin";
}
