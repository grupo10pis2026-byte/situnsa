import type { ErrorEnvelope } from "@pis/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { errorEnvelope, nuevaCorrelacion } from "./errores.js";

/**
 * Manejo centralizado de errores no controlados (INC-02): ninguna respuesta
 * expone SQL, trazas ni parámetros. Los errores de Postgres conocidos se
 * traducen a códigos de negocio; el resto es 500 con correlación (el
 * detalle completo solo va al log del servidor).
 */

export interface ErrorClasificado {
  status: number;
  codigo: string;
  mensaje: string;
}

/** Mensajes por restricción única (sin revelar valores). */
const MENSAJES_UNICIDAD: Readonly<Record<string, string>> = {
  usuarios_email_unique: "El correo electrónico ya está registrado para otra persona",
  usuarios_dni_unique: "El DNI ya está registrado",
  expedientes_codigo_unique: "Conflicto al generar el código del expediente; vuelva a intentarlo",
  solicitudes_codigo_unique: "Conflicto al generar el código de la solicitud; vuelva a intentarlo",
  jurados_dni_unique: "El jurado ya está registrado",
  catalogo_docs_requeridos_tipo_unique: "Ya existe un documento con ese tipo",
};

interface ErrorConCodigo {
  code?: unknown;
  constraint?: unknown;
  statusCode?: unknown;
  validation?: unknown;
  cause?: unknown;
  message?: unknown;
}

/** Busca el error de Postgres (drizzle lo envuelve en `cause`). */
function errorPostgres(err: unknown): { code: string; constraint: string | null } | null {
  let actual: unknown = err;
  for (let i = 0; i < 4 && actual && typeof actual === "object"; i++) {
    const e = actual as ErrorConCodigo;
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, constraint: typeof e.constraint === "string" ? e.constraint : null };
    }
    actual = e.cause;
  }
  return null;
}

const MENSAJE_500 =
  "Ocurrió un error inesperado. Si persiste, comunique el código de correlación al área de sistemas.";

export function clasificarError(err: unknown): ErrorClasificado {
  const pg = errorPostgres(err);
  if (pg) {
    switch (pg.code) {
      case "23505":
        return {
          status: 409,
          codigo: "DATOS_DUPLICADOS",
          mensaje:
            (pg.constraint && MENSAJES_UNICIDAD[pg.constraint]) ??
            "Ya existe un registro con esos datos",
        };
      case "23503":
        return {
          status: 409,
          codigo: "REFERENCIA_INVALIDA",
          mensaje: "La operación referencia un registro inexistente o en uso",
        };
      case "22P02":
      case "22007":
      case "22008":
      case "23502":
      case "23514":
      case "22001":
        return {
          status: 400,
          codigo: "VALIDACION_FALLIDA",
          mensaje: "Algún dato tiene un formato inválido o excede la longitud permitida",
        };
      default:
        return { status: 500, codigo: "ERROR_INTERNO", mensaje: MENSAJE_500 };
    }
  }
  const e = (err ?? {}) as ErrorConCodigo;
  if (e.validation) {
    return { status: 400, codigo: "VALIDACION_FALLIDA", mensaje: "Solicitud con datos inválidos" };
  }
  const status = typeof e.statusCode === "number" ? e.statusCode : 500;
  if (status >= 400 && status < 500) {
    // Errores de Fastify/plugins (cuerpo grande, multipart, JSON mal formado):
    // sus mensajes son genéricos y seguros.
    return {
      status,
      codigo: typeof e.code === "string" ? e.code : "SOLICITUD_INVALIDA",
      mensaje: typeof e.message === "string" && e.message ? e.message : "Solicitud inválida",
    };
  }
  return { status: 500, codigo: "ERROR_INTERNO", mensaje: MENSAJE_500 };
}

export function manejarError(err: unknown, req: FastifyRequest, reply: FastifyReply): void {
  const correlacion = nuevaCorrelacion();
  const c = clasificarError(err);
  if (c.status >= 500) {
    req.log.error({ err, correlacion }, "Error no controlado");
  } else {
    req.log.warn({ codigo: c.codigo, correlacion, url: req.url }, c.mensaje);
  }
  const body: ErrorEnvelope = errorEnvelope(c.codigo, c.mensaje, undefined, correlacion);
  void reply.status(c.status).send(body);
}

/**
 * Validación de contratos ts-rest con el sobre de errores homogéneo
 * (sustituye el formato `{ bodyErrors, queryParameterErrors… }` por defecto).
 */
export function manejarValidacionContrato(
  err: { body?: unknown; query?: unknown; pathParams?: unknown; headers?: unknown },
  _req: FastifyRequest,
  reply: FastifyReply,
): void {
  const detalles: Array<{ campo?: string; mensaje?: string }> = [];
  for (const [origen, zodError] of Object.entries({
    body: err.body,
    query: err.query,
    params: err.pathParams,
    headers: err.headers,
  })) {
    const issues = (zodError as { issues?: Array<{ path?: unknown[]; message?: string }> } | null)
      ?.issues;
    for (const issue of issues ?? []) {
      const campo = [origen, ...(issue.path ?? []).map(String)].join(".");
      detalles.push(issue.message ? { campo, mensaje: issue.message } : { campo });
    }
  }
  const primero = detalles[0];
  const mensaje = primero
    ? `Datos inválidos en ${primero.campo}${primero.mensaje ? `: ${primero.mensaje}` : ""}`
    : "Solicitud con datos inválidos";
  void reply.status(400).send(errorEnvelope("VALIDACION_FALLIDA", mensaje, detalles));
}

/** Opciones comunes al registrar un router ts-rest (`scoped.register(s.plugin(r), …)`). */
export const OPCIONES_TS_REST = {
  requestValidationErrorHandler: manejarValidacionContrato,
  logInitialization: false,
  jsonQuery: false,
  responseValidation: false,
} as const;

/** 404 homogéneo para rutas inexistentes. */
export function manejarNoEncontrado(req: FastifyRequest, reply: FastifyReply): void {
  void reply
    .status(404)
    .send(
      errorEnvelope(
        "RUTA_NO_ENCONTRADA",
        `Ruta no encontrada: ${req.method} ${req.url.split("?")[0]}`,
      ),
    );
}
