/**
 * Errores de la API en el cliente: conservan el estado HTTP y el código del
 * sobre `{ error: { codigo, mensaje } }` para que la UI distinga "sin acceso"
 * (403), "no existe" (404) y conflictos (409) — y para no reintentar 4xx.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string | null;
  /** Errores por campo (`error.detalles[].campo`), para mostrarlos junto a cada control. */
  readonly campos: Record<string, string>;
  constructor(
    status: number,
    mensaje: string,
    codigo: string | null = null,
    campos: Record<string, string> = {},
  ) {
    super(mensaje);
    this.name = "ApiError";
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

/** `error.detalles` del sobre → { campo: mensaje } (el primer mensaje de cada campo). */
function camposDeCuerpo(body: unknown): Record<string, string> {
  const detalles =
    typeof body === "object" && body !== null
      ? (body as { error?: { detalles?: unknown } }).error?.detalles
      : undefined;
  const out: Record<string, string> = {};
  if (!Array.isArray(detalles)) return out;
  for (const d of detalles) {
    if (typeof d !== "object" || d === null) continue;
    const { campo, mensaje } = d as { campo?: unknown; mensaje?: unknown };
    if (typeof campo === "string" && typeof mensaje === "string" && !(campo in out))
      out[campo] = mensaje;
  }
  return out;
}

/** Mensaje legible de un cuerpo de error (sobre nuevo o legacy `{message}`). */
export function mensajeDeCuerpo(body: unknown, respaldo: string): string {
  if (typeof body !== "object" || body === null) return respaldo;
  const env = (body as { error?: { mensaje?: unknown } }).error;
  if (typeof env?.mensaje === "string" && env.mensaje) return env.mensaje;
  const legacy = (body as { message?: unknown }).message;
  if (typeof legacy === "string" && legacy) return legacy;
  return respaldo;
}

/** Convierte una respuesta no-ok en ApiError (lee el sobre si existe). */
export async function errorDeRespuesta(res: Response, respaldo: string): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as unknown;
  const codigo =
    typeof body === "object" && body !== null
      ? ((body as { error?: { codigo?: unknown } }).error?.codigo ?? null)
      : null;
  return new ApiError(
    res.status,
    mensajeDeCuerpo(body, respaldo),
    typeof codigo === "string" ? codigo : null,
    camposDeCuerpo(body),
  );
}

/** React Query: no reintentar errores del cliente (4xx); sí fallos de red/5xx (máx. 2). */
export function reintentarConsulta(intentos: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return intentos < 2;
}
