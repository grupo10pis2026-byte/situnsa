import { hitosContract } from "@pis/contracts";
import { db } from "@pis/db";
import { TIPOS_HITO, type TipoHito } from "@pis/domain";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { autorizar, denegado } from "../../../infra/auth/autorizacion.js";
import { entregarArchivo } from "../../../infra/http/entrega-archivo.js";
import { errorEnvelope, estadoHttp, PATRON_UUID } from "../../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../../infra/http/manejador-errores.js";
import { LocalStorageService } from "../../../infra/storage/local-storage.service.js";
import { zipAlmacenado } from "../../../infra/xlsx/escribir-xlsx.js";
import { requireAuth } from "../../../middleware/require-auth.js";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";
import { hoyLima } from "../sesiones/sesiones.repository.js";
import { capacidadesProyecto, capacidadesTallerActor } from "../taller-capacidades.js";
import { respuestaDominio } from "../taller-http.js";
import {
  entregaConHito,
  entregasDeProyecto,
  hitoConProyecto,
  matrizHitos,
  nombreHito,
  planDelTaller,
  ultimasVersionesDelTaller,
} from "./hitos.repository.js";
import {
  AjustarFechaHitoUseCase,
  AprobarPlanUseCase,
  EditarSemanaPlanUseCase,
  HabilitarHitoEnTallerUseCase,
  HabilitarHitoUseCase,
  previaAprobacion,
  RevisarEntregaUseCase,
  SubirEntregaUseCase,
} from "./hitos.use-cases.js";

const s = initServer();
const storage = new LocalStorageService();

const prohibido = (m: string) => ({
  status: 403 as const,
  body: errorEnvelope("FUERA_DE_ALCANCE", m),
});
const noExiste = (m: string) => ({ status: 404 as const, body: errorEnvelope("NO_ENCONTRADO", m) });

function actorDe(req: FastifyRequest) {
  return req.actor ?? { id: "", dni: "desconocido" };
}

async function vistaProyecto(proyectoId: string, req: FastifyRequest) {
  const a = await autorizar(req.actor, { permiso: ["taller", "ver"] });
  if (!a.ok) return { error: denegado(a) } as const;
  const c = await capacidadesProyecto(a.perfil, actorDe(req).id, proyectoId);
  if (!c) return { error: noExiste("Proyecto no encontrado") } as const;
  if (!c.ver) return { error: prohibido("El proyecto no está en tu alcance") } as const;
  return { c } as const;
}

async function dtoProyecto(proyectoId: string, c: { gestionar: boolean; subir: boolean }) {
  return entregasDeProyecto(
    db,
    proyectoId,
    { subir: c.subir, revisar: c.gestionar, gestionar: c.gestionar },
    await leerParametrosTaller(),
    hoyLima(),
  );
}

async function respuestaProyecto(proyectoId: string, c: { gestionar: boolean; subir: boolean }) {
  const dto = await dtoProyecto(proyectoId, c);
  return dto ? { status: 200 as const, body: dto } : noExiste("Proyecto no encontrado");
}

async function proyectoDeHito(hitoId: string): Promise<string | null> {
  return (await hitoConProyecto(db, hitoId))?.hito.proyectoId ?? null;
}

export function registerHitosRoutes(app: FastifyInstance): void {
  const router = s.router(hitosContract, {
    plan: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const c = await capacidadesTallerActor(a.perfil, actorDe(request).id, params.id);
      if (!c) return noExiste("Taller no encontrado");
      if (!c.ver && !c.verComoAlumno) return prohibido("El taller no está en tu alcance");
      const dto = await planDelTaller(db, params.id, c.gestionar);
      return dto ? { status: 200 as const, body: dto } : noExiste("Taller no encontrado");
    },
    editarPlan: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const c = await capacidadesTallerActor(a.perfil, actorDe(request).id, params.id);
      if (!c) return noExiste("Taller no encontrado");
      if (!c.gestionar) return prohibido("El plan lo edita el asesor del taller");
      const r = await new EditarSemanaPlanUseCase().execute(
        params.id,
        params.semana,
        body,
        actorDe(request),
      );
      if (!r.ok) return respuestaDominio(r.error);
      const dto = await planDelTaller(db, params.id, true);
      return dto ? { status: 200 as const, body: dto } : noExiste("Taller no encontrado");
    },
    matriz: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const c = await capacidadesTallerActor(a.perfil, actorDe(request).id, params.id);
      if (!c) return noExiste("Taller no encontrado");
      if (!c.ver) return prohibido("El taller no está en tu alcance");
      const dto = await matrizHitos(db, params.id, c.gestionar, hoyLima());
      return dto ? { status: 200 as const, body: dto } : noExiste("Taller no encontrado");
    },
    habilitarTodos: async ({ params, request }) => {
      const a = await autorizar(request.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return denegado(a);
      const c = await capacidadesTallerActor(a.perfil, actorDe(request).id, params.id);
      if (!c) return noExiste("Taller no encontrado");
      if (!c.gestionar) return prohibido("Los hitos los habilita el asesor del taller");
      const r = await new HabilitarHitoEnTallerUseCase().execute(
        params.id,
        params.tipo,
        actorDe(request),
      );
      if (!r.ok) return respuestaDominio(r.error);
      const dto = await matrizHitos(db, params.id, true, hoyLima());
      return dto ? { status: 200 as const, body: dto } : noExiste("Taller no encontrado");
    },
    entregas: async ({ params, request }) => {
      const v = await vistaProyecto(params.id, request);
      if ("error" in v) return v.error;
      return respuestaProyecto(params.id, v.c);
    },
    habilitar: async ({ params, request }) => {
      const proyectoId = await proyectoDeHito(params.id);
      if (!proyectoId) return noExiste("Hito no encontrado");
      const v = await vistaProyecto(proyectoId, request);
      if ("error" in v) return v.error;
      if (!v.c.gestionar) return prohibido("Los hitos los habilita el asesor del taller");
      const r = await new HabilitarHitoUseCase().execute(params.id, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaProyecto(proyectoId, v.c);
    },
    ajustarFecha: async ({ params, body, request }) => {
      const proyectoId = await proyectoDeHito(params.id);
      if (!proyectoId) return noExiste("Hito no encontrado");
      const v = await vistaProyecto(proyectoId, request);
      if ("error" in v) return v.error;
      if (!v.c.gestionar) return prohibido("La fecha la ajusta el asesor del taller");
      const r = await new AjustarFechaHitoUseCase().execute(
        params.id,
        body.fechaLimite,
        actorDe(request),
      );
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaProyecto(proyectoId, v.c);
    },
    reabrir: async ({ params, body, request }) => {
      const proyectoId = await proyectoDeHito(params.id);
      if (!proyectoId) return noExiste("Hito no encontrado");
      const v = await vistaProyecto(proyectoId, request);
      if ("error" in v) return v.error;
      if (!v.c.gestionar) return prohibido("La nueva entrega la habilita el asesor del taller");
      const r = await new AjustarFechaHitoUseCase().execute(
        params.id,
        body.fechaLimite,
        actorDe(request),
        true,
      );
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaProyecto(proyectoId, v.c);
    },
    revisar: async ({ params, body, request }) => {
      const e = await entregaConHito(db, params.id);
      if (!e) return noExiste("Entrega no encontrada");
      const v = await vistaProyecto(e.hito.proyectoId, request);
      if ("error" in v) return v.error;
      if (!v.c.gestionar) return prohibido("Las entregas las revisa el asesor del taller");
      const r = await new RevisarEntregaUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaProyecto(e.hito.proyectoId, v.c);
    },
    previaAprobacion: async ({ params, request }) => {
      const v = await vistaProyecto(params.id, request);
      if ("error" in v) return v.error;
      if (!v.c.gestionar) return prohibido("El plan lo aprueba el asesor del taller");
      const dto = await previaAprobacion(params.id);
      return dto ? { status: 200 as const, body: dto } : noExiste("Proyecto no encontrado");
    },
    aprobarPlan: async ({ params, body, request }) => {
      const v = await vistaProyecto(params.id, request);
      if ("error" in v) return v.error;
      if (!v.c.gestionar) return prohibido("El plan lo aprueba el asesor del taller");
      const r = await new AprobarPlanUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaProyecto(params.id, v.c);
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });

  const enviar = async (reply: FastifyReply, status: number, body: unknown) => {
    await reply.status(status).send(body);
  };

  /** P7 Subir versión: campo `comentario` (opcional, antes del archivo) y `file`. */
  app.post<{ Params: { id: string } }>(
    "/api/hitos/:id/entregas",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Hito no encontrado"));
      const proyectoId = await proyectoDeHito(req.params.id);
      if (!proyectoId)
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Hito no encontrado"));
      const v = await vistaProyecto(proyectoId, req);
      if ("error" in v) return enviar(reply, v.error.status, v.error.body);
      if (!v.c.subir)
        return enviar(
          reply,
          403,
          errorEnvelope("FUERA_DE_ALCANCE", "Solo el alumno sube sus entregas"),
        );
      const parametros = await leerParametrosTaller();
      let archivo: Awaited<ReturnType<FastifyRequest["file"]>> | undefined;
      let bytes: Uint8Array | null = null;
      try {
        archivo = await req.file({
          limits: { fileSize: parametros.maxMbEntrega * 1024 * 1024 + 1, files: 1 },
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
            `Sube un PDF o Word de hasta ${parametros.maxMbEntrega} MB`,
          ),
        );
      const campo = archivo.fields.comentario;
      const comentario =
        campo && !Array.isArray(campo) && campo.type === "field" && typeof campo.value === "string"
          ? campo.value.slice(0, 2000)
          : null;
      const r = await new SubirEntregaUseCase(storage).execute(
        req.params.id,
        { filename: archivo.filename, mime: archivo.mimetype, bytes },
        comentario,
        actorDe(req),
      );
      if (!r.ok)
        return enviar(
          reply,
          estadoHttp(r.error.code),
          errorEnvelope(r.error.code, r.error.message),
        );
      return enviar(reply, 201, await dtoProyecto(proyectoId, v.c));
    },
  );

  /** P6b/P7 Descargar una versión (protegida). */
  app.get<{ Params: { id: string } }>(
    "/api/entregas/:id/archivo",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Entrega no encontrada"));
      const e = await entregaConHito(db, req.params.id);
      if (!e) return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Entrega no encontrada"));
      const v = await vistaProyecto(e.hito.proyectoId, req);
      if ("error" in v) return enviar(reply, v.error.status, v.error.body);
      await entregarArchivo(reply, storage, e.entrega.ruta, {
        nombre: e.entrega.nombreOriginal,
        contentType: e.entrega.mime,
      });
    },
  );

  /** P6 "Descargar todo": ZIP con la última versión del hito de cada proyecto. */
  app.get<{ Params: { id: string; tipo: string } }>(
    "/api/talleres/:id/hitos/:tipo/zip",
    { preHandler: requireAuth },
    async (req, reply) => {
      const tipo: TipoHito | undefined = TIPOS_HITO.find((t) => t === req.params.tipo);
      if (!PATRON_UUID.test(req.params.id) || !tipo)
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Hito no encontrado"));
      const a = await autorizar(req.actor, { permiso: ["taller", "ver"] });
      if (!a.ok) return enviar(reply, a.status, a.body);
      const c = await capacidadesTallerActor(a.perfil, actorDe(req).id, req.params.id);
      if (!c) return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Taller no encontrado"));
      if (!c.ver) return enviar(reply, 403, errorEnvelope("FUERA_DE_ALCANCE", "Sin alcance"));
      const filas = await ultimasVersionesDelTaller(db, req.params.id, tipo);
      if (filas.length === 0)
        return enviar(
          reply,
          404,
          errorEnvelope("NO_ENCONTRADO", "Aún no hay entregas de este hito"),
        );
      const entradas: { nombre: string; datos: Uint8Array }[] = [];
      for (const f of filas) {
        const abierto = await storage.abrir(f.ruta);
        if (!abierto) continue;
        const partes: Buffer[] = [];
        for await (const trozo of abierto.stream) partes.push(trozo as Buffer);
        const ext = f.nombre.includes(".") ? f.nombre.slice(f.nombre.lastIndexOf(".")) : "";
        entradas.push({
          nombre: `${f.codigo}_${tipo}_v${f.version}${ext}`,
          datos: new Uint8Array(Buffer.concat(partes)),
        });
      }
      const zip = zipAlmacenado(entradas, new Date());
      await reply
        .header("Content-Type", "application/zip")
        .header(
          "Content-Disposition",
          `attachment; filename="${nombreHito(tipo).replace(/[^A-Za-z0-9]+/g, "_")}.zip"`,
        )
        .header("Cache-Control", "private, no-store")
        .status(200)
        .send(Buffer.from(zip));
    },
  );
}
