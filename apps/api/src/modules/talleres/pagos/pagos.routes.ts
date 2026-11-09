import { pagosTallerContract } from "@pis/contracts";
import { comprobantesPension, db, pensionesAlumno } from "@pis/db";
import { initServer } from "@ts-rest/fastify";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  autorizar,
  denegado,
  esPersonal,
  type Perfil,
  permite,
  ROL_ADMIN,
} from "../../../infra/auth/autorizacion.js";
import { entregarArchivo } from "../../../infra/http/entrega-archivo.js";
import { errorEnvelope, estadoHttp, PATRON_UUID } from "../../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../../infra/http/manejador-errores.js";
import { LocalStorageService } from "../../../infra/storage/local-storage.service.js";
import { requireAuth } from "../../../middleware/require-auth.js";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";
import { hoyLima } from "../sesiones/sesiones.repository.js";
import { respuestaDominio } from "../taller-http.js";
import { filaPension, misPagos, pagosTaller } from "./pagos.repository.js";
import {
  pensionDeComprobante,
  RegistrarPagoDirectoUseCase,
  RevisarComprobanteUseCase,
  SubirComprobanteUseCase,
} from "./pagos.use-cases.js";

const s = initServer();
const storage = new LocalStorageService();

/** P9 es de la Secretaría del Taller (pagos.editar) y del Administrador. */
function gestionaPagos(perfil: Perfil): boolean {
  return (
    perfil.roles.includes(ROL_ADMIN) ||
    (esPersonal(perfil.roles) && permite(perfil, "pagos", "editar"))
  );
}

const prohibido = (m: string) => ({
  status: 403 as const,
  body: errorEnvelope("FUERA_DE_ALCANCE", m),
});
const noExiste = (m: string) => ({ status: 404 as const, body: errorEnvelope("NO_ENCONTRADO", m) });

function actorDe(req: FastifyRequest) {
  return req.actor ?? { id: "", dni: "desconocido" };
}

async function respuestaFila(id: string) {
  const f = await filaPension(db, id, hoyLima());
  return f ? { status: 200 as const, body: f } : noExiste("Pensión no encontrada");
}

export function registerPagosTallerRoutes(app: FastifyInstance): void {
  const router = s.router(pagosTallerContract, {
    listar: async ({ query, request }) => {
      const a = await autorizar(request.actor, { permiso: ["pagos", "ver"] });
      if (!a.ok) return denegado(a);
      if (!gestionaPagos(a.perfil))
        return prohibido("Los pagos los gestiona la Secretaría del Taller");
      return { status: 200 as const, body: await pagosTaller(db, query, hoyLima()) };
    },
    validar: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["pagos", "ver"] });
      if (!a.ok) return denegado(a);
      if (!gestionaPagos(a.perfil))
        return prohibido("Los pagos los valida la Secretaría del Taller");
      const r = await new RevisarComprobanteUseCase().execute(
        params.id,
        { tipo: "validar" },
        actorDe(request),
      );
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaFila(r.value);
    },
    observar: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["pagos", "ver"] });
      if (!a.ok) return denegado(a);
      if (!gestionaPagos(a.perfil))
        return prohibido("Los pagos los valida la Secretaría del Taller");
      const r = await new RevisarComprobanteUseCase().execute(
        params.id,
        { tipo: "observar", motivo: body.motivo },
        actorDe(request),
      );
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaFila(r.value);
    },
    pagoDirecto: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["pagos", "ver"] });
      if (!a.ok) return denegado(a);
      if (!gestionaPagos(a.perfil))
        return prohibido("Los pagos los registra la Secretaría del Taller");
      const r = await new RegistrarPagoDirectoUseCase().execute(
        params.id,
        body.observacion ?? null,
        actorDe(request),
      );
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaFila(r.value);
    },
    misPagos: async ({ request }) => {
      const a = await autorizar(request.actor, { permiso: ["pagos", "ver"] });
      if (!a.ok) return denegado(a);
      return {
        status: 200 as const,
        body: await misPagos(db, actorDe(request).id, await leerParametrosTaller(), hoyLima()),
      };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });

  const enviar = async (reply: FastifyReply, status: number, body: unknown) => {
    await reply.status(status).send(body);
  };

  /** P8 Subir comprobante (imagen o PDF en `file`). */
  app.post<{ Params: { id: string } }>(
    "/api/pensiones-alumno/:id/comprobante",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Pensión no encontrada"));
      const a = await autorizar(req.actor, { permiso: ["pagos", "ver"] });
      if (!a.ok) return enviar(reply, a.status, a.body);
      const parametros = await leerParametrosTaller();
      let archivo: Awaited<ReturnType<FastifyRequest["file"]>> | undefined;
      let bytes: Uint8Array | null = null;
      try {
        archivo = await req.file({
          limits: { fileSize: parametros.maxMbComprobante * 1024 * 1024 + 1, files: 1 },
        });
        if (archivo) {
          bytes = new Uint8Array(await archivo.toBuffer());
          if (archivo.file.truncated) bytes = null;
        }
      } catch {
        bytes = null;
      }
      if (!archivo || !bytes)
        return enviar(
          reply,
          400,
          errorEnvelope(
            "DOCUMENTO_INVALIDO",
            `Sube una imagen o PDF de hasta ${parametros.maxMbComprobante} MB`,
          ),
        );
      const r = await new SubirComprobanteUseCase(storage).execute(
        req.params.id,
        { filename: archivo.filename, mime: archivo.mimetype, bytes },
        actorDe(req),
      );
      if (!r.ok)
        return enviar(
          reply,
          estadoHttp(r.error.code),
          errorEnvelope(r.error.code, r.error.message),
        );
      return enviar(reply, 201, await misPagos(db, actorDe(req).id, parametros, hoyLima()));
    },
  );

  /** P8/P9 Ver comprobante: el alumno dueño o la Secretaría. */
  app.get<{ Params: { id: string } }>(
    "/api/comprobantes/:id/archivo",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Comprobante no encontrado"));
      const a = await autorizar(req.actor, { permiso: ["pagos", "ver"] });
      if (!a.ok) return enviar(reply, a.status, a.body);
      const pensionId = await pensionDeComprobante(req.params.id);
      if (!pensionId)
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Comprobante no encontrado"));
      const [p] = await db
        .select({ alumnoId: pensionesAlumno.alumnoId })
        .from(pensionesAlumno)
        .where(eq(pensionesAlumno.id, pensionId))
        .limit(1);
      if (!gestionaPagos(a.perfil) && p?.alumnoId !== actorDe(req).id)
        return enviar(reply, 403, errorEnvelope("FUERA_DE_ALCANCE", "Sin alcance"));
      const [c] = await db
        .select()
        .from(comprobantesPension)
        .where(eq(comprobantesPension.id, req.params.id))
        .limit(1);
      if (!c)
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Comprobante no encontrado"));
      await entregarArchivo(reply, storage, c.ruta, {
        nombre: c.nombreOriginal,
        contentType: c.mime,
        inline: true,
      });
    },
  );
}
