import rateLimit from "@fastify/rate-limit";
import { authContract } from "@pis/contracts";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance } from "fastify";
import { errorEnvelope } from "../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../infra/http/manejador-errores.js";
import { NOMBRE_COOKIE_REFRESH, opcionesCookieRefresh, verificarAcceso } from "./sesiones.js";
import {
  ActivarCuentaUseCase,
  SolicitarRestablecimientoUseCase,
} from "./use-cases/acceso/activar-cuenta.use-case.js";
import {
  dominioGooglePermitido,
  LoginGoogleUseCase,
} from "./use-cases/login-google/login-google.use-case.js";
import { LoginLocalUseCase } from "./use-cases/login-local/login-local.use-case.js";
import {
  LogoutUseCase,
  RefreshSesionUseCase,
} from "./use-cases/refresh-sesion/refresh-sesion.use-case.js";
import { repositorioCuentasDb } from "./use-cases/repositorios.js";

const s = initServer();

function contexto(req: { ip: string; headers: Record<string, string | string[] | undefined> }): {
  ip: string | null;
  agente: string | null;
} {
  const agente = req.headers["user-agent"];
  return {
    ip: req.ip ?? null,
    agente: Array.isArray(agente) ? (agente[0] ?? null) : (agente ?? null),
  };
}

/** Auth real (A2): login local + Google OIDC + refresh rotativo + logout. */
export function registerAuthRoutes(app: FastifyInstance): void {
  const router = s.router(authContract, {
    loginLocal: async ({ body, request, reply }) => {
      const uc = new LoginLocalUseCase();
      const r = await uc.execute({ ...body, ...contexto(request) });
      if (!r.ok)
        return { status: 401 as const, body: errorEnvelope(r.error.code, r.error.message) };
      reply.setCookie(NOMBRE_COOKIE_REFRESH, r.value.refreshToken, opcionesCookieRefresh());
      return {
        status: 200 as const,
        body: {
          usuario: r.value.usuario,
          accessToken: r.value.accessToken,
          expiraEn: r.value.expiraEn,
        },
      };
    },
    configGoogle: async () => ({
      status: 200 as const,
      body: {
        clientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
        dominio: dominioGooglePermitido(),
      },
    }),
    loginGoogle: async ({ body, request, reply }) => {
      if (!process.env.GOOGLE_CLIENT_ID) {
        return {
          status: 501 as const,
          body: errorEnvelope("SIN_CONFIGURACION", "Login con Google no configurado"),
        };
      }
      const uc = new LoginGoogleUseCase();
      const r = await uc.execute(body.idToken, contexto(request));
      if (!r.ok)
        return { status: 401 as const, body: errorEnvelope(r.error.code, r.error.message) };
      reply.setCookie(NOMBRE_COOKIE_REFRESH, r.value.refreshToken, opcionesCookieRefresh());
      return {
        status: 200 as const,
        body: {
          usuario: r.value.usuario,
          accessToken: r.value.accessToken,
          expiraEn: r.value.expiraEn,
        },
      };
    },
    refresh: async ({ request, reply }) => {
      const token = request.cookies?.[NOMBRE_COOKIE_REFRESH];
      if (!token) {
        return { status: 401 as const, body: errorEnvelope("SESION_INVALIDA", "Sin sesión") };
      }
      const uc = new RefreshSesionUseCase();
      const r = await uc.execute(token, contexto(request));
      if (!r.ok)
        return { status: 401 as const, body: errorEnvelope(r.error.code, r.error.message) };
      reply.setCookie(NOMBRE_COOKIE_REFRESH, r.value.refreshToken, opcionesCookieRefresh());
      return {
        status: 200 as const,
        body: { accessToken: r.value.accessToken, expiraEn: r.value.expiraEn },
      };
    },
    logout: async ({ request, reply }) => {
      const token = request.cookies?.[NOMBRE_COOKIE_REFRESH] ?? null;
      await new LogoutUseCase().execute(token);
      reply.clearCookie(NOMBRE_COOKIE_REFRESH, { path: "/api/auth" });
      return { status: 200 as const, body: { ok: true as const } };
    },
    activar: async ({ body }) => {
      const r = await new ActivarCuentaUseCase().execute(body.token, body.password);
      if (!r.ok) {
        return { status: 400 as const, body: errorEnvelope(r.error.code, r.error.message) };
      }
      return { status: 200 as const, body: { ok: true as const, dni: r.value.dni } };
    },
    solicitarRestablecimiento: async ({ body }) => {
      // Respuesta idéntica exista o no la cuenta (anti-enumeración); el
      // trabajo real (token + correo) no altera el tiempo de respuesta visible.
      void new SolicitarRestablecimientoUseCase()
        .execute(body.identificador)
        .catch((err: unknown) => console.error("[auth] restablecimiento falló", err));
      return { status: 202 as const, body: { ok: true as const } };
    },
    sesion: async ({ request }) => {
      const auth = request.headers.authorization;
      const token =
        typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
      if (!token) return { status: 401 as const, body: errorEnvelope("SIN_SESION", "Sin sesión") };
      const p = verificarAcceso(token);
      if (!p)
        return {
          status: 401 as const,
          body: errorEnvelope("SESION_INVALIDA", "Sesión expirada o inválida"),
        };
      const cuenta = await repositorioCuentasDb.buscarPorId(p.sub);
      if (!cuenta || !cuenta.activo) {
        return { status: 401 as const, body: errorEnvelope("SIN_SESION", "Sin sesión") };
      }
      return {
        status: 200 as const,
        body: {
          userId: cuenta.id,
          dni: cuenta.dni,
          nombres: `${cuenta.nombres} ${cuenta.apellidos}`,
          email: cuenta.email,
          rol: cuenta.rol,
        },
      };
    },
  });
  // Auth bajo tope propio (60/min por IP): el bloqueo 5×15min cubre fuerza bruta,
  // el rate-limit cubre ráfagas. Encapsulado: no afecta al resto de la API.
  void app.register(async (scoped) => {
    await scoped.register(rateLimit, { max: 60, timeWindow: "1 minute" });
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });
}
