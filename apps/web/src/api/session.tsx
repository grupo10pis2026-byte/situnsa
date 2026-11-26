import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SesionDTO } from "../api/auth.js";
import {
  loginGoogleRequest,
  loginRequest,
  logoutRequest,
  type ParSesion,
  refreshRequest,
  sesionRequest,
} from "../api/auth.js";

interface Sesion extends SesionDTO {
  identificador: string;
}

interface ValorSesion {
  sesion: Sesion | null;
  entrar: (identificador: string, password: string) => Promise<Sesion>;
  /** Login con el ID token de Google (cuenta institucional). */
  entrarConGoogle: (idToken: string) => Promise<Sesion>;
  salir: () => void;
}

/** Token de acceso solo en memoria (nunca localStorage); el refresh vive en cookie HttpOnly. */
let tokenAcceso: string | null = null;
let refreshEnCurso: Promise<string | null> | null = null;

async function obtenerToken(): Promise<string | null> {
  if (tokenAcceso) return tokenAcceso;
  if (!refreshEnCurso) {
    refreshEnCurso = (async () => {
      const r = await refreshRequest();
      tokenAcceso = r?.accessToken ?? null;
      refreshEnCurso = null;
      return tokenAcceso;
    })();
  }
  return refreshEnCurso;
}

const CLAVE = "pis-sesion";

const Ctx = createContext<ValorSesion>({
  sesion: null,
  entrar: () => Promise.reject(new Error("SessionProvider ausente")),
  entrarConGoogle: () => Promise.reject(new Error("SessionProvider ausente")),
  salir: () => {},
});

function leer(): Sesion | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    return raw ? (JSON.parse(raw) as Sesion) : null;
  } catch {
    return null;
  }
}

/** Sesión con JWT (A2): acceso en memoria + refresh automático ante 401. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(leer);

  // Arranque: si hay meta guardada y no hay token en memoria, restaura vía
  // refresh silencioso (single-flight: comparte la promesa con apiFetch para
  // no emitir dos refresh concurrentes que se invaliden por rotación).
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!leer() || tokenAcceso) return;
      const token = await obtenerToken();
      if (!vivo) return;
      if (!token) {
        localStorage.removeItem(CLAVE);
        setSesion(null);
        return;
      }
      const dto = await sesionRequest(token);
      if (!vivo) return;
      if (!dto) {
        localStorage.removeItem(CLAVE);
        setSesion(null);
        return;
      }
      const s: Sesion = { ...dto, identificador: dto.dni };
      localStorage.setItem(CLAVE, JSON.stringify(s));
      setSesion(s);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const aplicarPar = useCallback((par: ParSesion): Sesion => {
    tokenAcceso = par.accessToken;
    const s: Sesion = { ...par.usuario, identificador: par.usuario.dni };
    localStorage.setItem(CLAVE, JSON.stringify(s));
    setSesion(s);
    return s;
  }, []);

  const entrar = useCallback(
    async (identificador: string, password: string): Promise<Sesion> =>
      aplicarPar(await loginRequest(identificador, password)),
    [aplicarPar],
  );

  const entrarConGoogle = useCallback(
    async (idToken: string): Promise<Sesion> => aplicarPar(await loginGoogleRequest(idToken)),
    [aplicarPar],
  );

  const salir = useCallback(() => {
    tokenAcceso = null;
    localStorage.removeItem(CLAVE);
    setSesion(null);
    void logoutRequest();
  }, []);

  const valor = useMemo(
    () => ({ sesion, entrar, entrarConGoogle, salir }),
    [sesion, entrar, entrarConGoogle, salir],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSession(): ValorSesion {
  return useContext(Ctx);
}

function esAuth(path: string): boolean {
  return path.includes("/api/auth/");
}

/**
 * fetch autenticado: Bearer en memoria + `credentials: include` (cookie refresh).
 * Ante 401 (no-auth) intenta un refresh y reintenta una vez.
 */
export async function apiFetch(path: string, init?: RequestInit, dni?: string): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  // Compatibilidad transitoria: callers legacy aún pueden pasar dni (stub).
  if (dni) headers["x-user-dni"] = dni;
  const token = await obtenerToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, credentials: "include", headers });
  if (res.status !== 401 || esAuth(path)) return res;
  // Posible acceso expirado: refresca y reintenta una vez.
  refreshEnCurso = null;
  tokenAcceso = null;
  const renovado = await obtenerToken();
  if (!renovado) return res;
  return fetch(path, {
    ...init,
    credentials: "include",
    headers: { ...headers, Authorization: `Bearer ${renovado}` },
  });
}
