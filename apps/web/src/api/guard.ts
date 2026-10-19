import { destinoPorRol } from "./auth.js";

/**
 * Guards de rol en frontend (A3): solo ocultan/navegan — el servidor
 * revalida todo (S-FIPS: "el cliente usa los permisos solo para ocultar").
 * Lee el rol de la meta de sesión guardada (`pis-sesion`, misma clave que session.tsx).
 */

const CLAVE = "pis-sesion";

const STAFF = new Set(["ADMIN_FIPS", "SECRETARIA", "DECANO"]);

/** Rutas sin sesión: login, enlaces de acceso y mesa de partes pública / subsanación. */
const PUBLICAS = new Set(["/", "/login", "/activar", "/restablecer", "/mesa-de-partes"]);

/** Ruta → roles legacy permitidos (`*` = cualquier autenticado). */
const REGLAS: Array<{ prefijo: string; roles: Set<string> | "*" }> = [
  { prefijo: "/configuracion", roles: new Set(["ADMIN_FIPS"]) },
  { prefijo: "/admin", roles: STAFF },
  { prefijo: "/solicitudes", roles: STAFF },
  { prefijo: "/inscripciones", roles: STAFF },
  { prefijo: "/talleres", roles: STAFF },
  { prefijo: "/taller", roles: new Set(["ASESOR", "JURADO", ...STAFF]) },
  { prefijo: "/asesores", roles: STAFF },
  { prefijo: "/pagos-taller", roles: STAFF },
  { prefijo: "/expedientes/nuevo", roles: STAFF },
  { prefijo: "/asesor", roles: new Set(["ASESOR", "JURADO", ...STAFF]) },
  { prefijo: "/mis-talleres", roles: new Set(["ASESOR", "JURADO", ...STAFF]) },
  { prefijo: "/agenda", roles: new Set(["ASESOR", "JURADO", ...STAFF]) },
  { prefijo: "/mi-tramite", roles: new Set(["TESISTA", ...STAFF]) },
  { prefijo: "/mi-taller", roles: new Set(["TESISTA", ...STAFF]) },
  { prefijo: "/mis-pagos", roles: new Set(["TESISTA", ...STAFF]) },
  { prefijo: "/expedientes/", roles: "*" },
];

export function rolGuardado(): string | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const rol = (JSON.parse(raw) as { rol?: unknown }).rol;
    return typeof rol === "string" ? rol : null;
  } catch {
    return null;
  }
}

/**
 * Destino de redirección si el rol no puede visitar `path`, o null si puede.
 * Pura y testeable: recibe el rol en vez de leer storage.
 */
export function redirigirSiNoPuede(rol: string | null, path: string): string | null {
  if (PUBLICAS.has(path) || path.startsWith("/subsanar")) return null;
  if (!rol) return "/login";
  for (const r of REGLAS) {
    const base = r.prefijo.endsWith("/") ? r.prefijo.slice(0, -1) : r.prefijo;
    const coincide = path === base || path.startsWith(`${base}/`);
    if (coincide) {
      if (r.roles === "*") return null;
      if (r.roles.has(rol)) return null;
      return destinoPorRol(rol);
    }
  }
  return null;
}

/** El rol de staff ve menús de administración (misma fuente que navPorRol). */
export function esStaff(rol: string | null | undefined): boolean {
  return !!rol && STAFF.has(rol);
}
