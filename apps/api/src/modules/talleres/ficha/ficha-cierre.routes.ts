import { fichaCierreContract } from "@pis/contracts";
import { db } from "@pis/db";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { autorizar, denegado } from "../../../infra/auth/autorizacion.js";
import { entregarArchivo } from "../../../infra/http/entrega-archivo.js";
import { errorEnvelope, estadoHttp, PATRON_UUID } from "../../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../../infra/http/manejador-errores.js";
import { LocalStorageService } from "../../../infra/storage/local-storage.service.js";
import { requireAuth } from "../../../middleware/require-auth.js";
import { capacidadesProyecto } from "../taller-capacidades.js";
import { respuestaDominio } from "../taller-http.js";
import {
  cierreDeProyecto,
  emitirInforme,
  fichaDeProyecto,
  GuardarDatosCierreUseCase,
  pdfFicha,
  proyectoDeFila,
  RegistrarFichaUseCase,
  rutaFirma,
  rutaInformeFirmado,
  SubirFichaFirmadaUseCase,
  SubirInformeFirmadoUseCase,
} from "./ficha-cierre.service.js";

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

/** P11/P13: la ficha y el cierre los ve el personal, el asesor y el alumno; solo el asesor los edita. */
async function vista(proyectoId: string, req: FastifyRequest) {
  const a = await autorizar(req.actor, { permiso: ["taller", "ver"] });
  if (!a.ok) return { error: denegado(a) } as const;
  const c = await capacidadesProyecto(a.perfil, actorDe(req).id, proyectoId);
  if (!c) return { error: noExiste("Proyecto no encontrado") } as const;
  if (!c.ver) return { error: prohibido("El proyecto no está en tu alcance") } as const;
  return { c } as const;
}

async function respuestaFicha(proyectoId: string, editar: boolean) {
  const dto = await fichaDeProyecto(db, proyectoId, editar);
  return dto ? { status: 200 as const, body: dto } : noExiste("Proyecto no encontrado");
}

async function respuestaCierre(proyectoId: string, gestionar: boolean) {
  const dto = await cierreDeProyecto(db, proyectoId, gestionar);
  return dto ? { status: 200 as const, body: dto } : noExiste("Proyecto no encontrado");
}

export function registerFichaCierreRoutes(app: FastifyInstance): void {
  const router = s.router(fichaCierreContract, {
    ficha: async ({ params, request }) => {
      const v = await vista(params.id, request);
      if ("error" in v) return v.error;
      return respuestaFicha(params.id, v.c.gestionar);
    },
    registrar: async ({ params, body, request }) => {
      const proyectoId = await proyectoDeFila(params.id);
      if (!proyectoId) return noExiste("Registro no encontrado");
      const v = await vista(proyectoId, request);
      if ("error" in v) return v.error;
      if (!v.c.gestionar) return prohibido("La ficha la registra el asesor del taller");
      const r = await new RegistrarFichaUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaFicha(proyectoId, true);
    },
    cierre: async ({ params, request }) => {
      const v = await vista(params.id, request);
      if ("error" in v) return v.error;
      return respuestaCierre(params.id, v.c.gestionar);
    },
    datosCierre: async ({ params, body, request }) => {
      const v = await vista(params.id, request);
      if ("error" in v) return v.error;
      if (!v.c.gestionar) return prohibido("El cierre lo registra el asesor del taller");
      const r = await new GuardarDatosCierreUseCase().execute(params.id, body, actorDe(request));
      if (!r.ok) return respuestaDominio(r.error);
      return respuestaCierre(params.id, true);
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });

  const enviar = async (reply: FastifyReply, status: number, body: unknown) => {
    await reply.status(status).send(body);
  };

  const pdf = async (reply: FastifyReply, bytes: Uint8Array, nombre: string) => {
    await reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${nombre}"`)
      .header("Cache-Control", "private, no-store")
      .status(200)
      .send(Buffer.from(bytes));
  };

  async function pdfSubido(req: FastifyRequest): Promise<
    | {
        ok: true;
        archivo: { filename: string; mime: string; bytes: Uint8Array };
        campos: Record<string, string>;
      }
    | { ok: false }
  > {
    try {
      const archivo = await req.file({ limits: { fileSize: 10 * 1024 * 1024 + 1, files: 1 } });
      if (!archivo) return { ok: false };
      const bytes = new Uint8Array(await archivo.toBuffer());
      if (archivo.file.truncated) return { ok: false };
      const campos: Record<string, string> = {};
      for (const [k, v] of Object.entries(archivo.fields)) {
        if (v && !Array.isArray(v) && v.type === "field" && typeof v.value === "string")
          campos[k] = v.value;
      }
      return {
        ok: true,
        archivo: { filename: archivo.filename, mime: archivo.mimetype, bytes },
        campos,
      };
    } catch {
      return { ok: false };
    }
  }

  const validoId = (id: string) => PATRON_UUID.test(id);

  /** P11 Descargar la ficha (Anexo 1) para firmar. */
  app.get<{ Params: { id: string } }>(
    "/api/proyectos/:id/ficha/pdf",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!validoId(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Proyecto no encontrado"));
      const v = await vista(req.params.id, req);
      if ("error" in v) return enviar(reply, v.error.status, v.error.body);
      const bytes = await pdfFicha(req.params.id);
      if (!bytes)
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Proyecto no encontrado"));
      await pdf(reply, bytes, `Ficha_${v.c.proyecto.codigo}.pdf`);
    },
  );

  /** P11 Subir ficha firmada: `semanas` = "2,4" (antes del archivo) y `file`. */
  app.post<{ Params: { id: string } }>(
    "/api/proyectos/:id/ficha/firmada",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!validoId(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Proyecto no encontrado"));
      const v = await vista(req.params.id, req);
      if ("error" in v) return enviar(reply, v.error.status, v.error.body);
      if (!v.c.gestionar)
        return enviar(
          reply,
          403,
          errorEnvelope("FUERA_DE_ALCANCE", "La ficha firmada la sube el asesor"),
        );
      const subido = await pdfSubido(req);
      if (!subido.ok)
        return enviar(
          reply,
          400,
          errorEnvelope("DOCUMENTO_INVALIDO", "Sube un PDF de hasta 10 MB"),
        );
      const semanas = (subido.campos.semanas ?? "")
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      const r = await new SubirFichaFirmadaUseCase(storage).execute(
        req.params.id,
        semanas,
        subido.archivo,
        actorDe(req),
      );
      if (!r.ok)
        return enviar(
          reply,
          estadoHttp(r.error.code),
          errorEnvelope(r.error.code, r.error.message),
        );
      return enviar(reply, 201, await fichaDeProyecto(db, req.params.id, true));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/ficha-firmas/:id/archivo",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!validoId(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Archivo no encontrado"));
      const f = await rutaFirma(req.params.id);
      if (!f) return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Archivo no encontrado"));
      const v = await vista(f.proyectoId, req);
      if ("error" in v) return enviar(reply, v.error.status, v.error.body);
      await entregarArchivo(reply, storage, f.ruta, {
        nombre: f.nombre,
        contentType: "application/pdf",
      });
    },
  );

  /** P13 Emitir el Informe de Conformidad (Anexo 21). */
  app.get<{ Params: { id: string } }>(
    "/api/proyectos/:id/cierre/informe",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!validoId(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Proyecto no encontrado"));
      const v = await vista(req.params.id, req);
      if ("error" in v) return enviar(reply, v.error.status, v.error.body);
      if (!v.c.gestionar)
        return enviar(
          reply,
          403,
          errorEnvelope("FUERA_DE_ALCANCE", "El informe lo emite el asesor"),
        );
      const r = await emitirInforme(req.params.id, actorDe(req));
      if (!r.ok)
        return enviar(
          reply,
          estadoHttp(r.error.code),
          errorEnvelope(r.error.code, r.error.message),
        );
      await pdf(reply, r.value, `Conformidad_${v.c.proyecto.codigo}.pdf`);
    },
  );

  /** P13 Subir el informe firmado: cierra la asesoría. */
  app.post<{ Params: { id: string } }>(
    "/api/proyectos/:id/cierre/firmado",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!validoId(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Proyecto no encontrado"));
      const v = await vista(req.params.id, req);
      if ("error" in v) return enviar(reply, v.error.status, v.error.body);
      if (!v.c.gestionar)
        return enviar(
          reply,
          403,
          errorEnvelope("FUERA_DE_ALCANCE", "El informe firmado lo sube el asesor"),
        );
      const subido = await pdfSubido(req);
      if (!subido.ok)
        return enviar(
          reply,
          400,
          errorEnvelope("DOCUMENTO_INVALIDO", "Sube un PDF de hasta 10 MB"),
        );
      const r = await new SubirInformeFirmadoUseCase(storage).execute(
        req.params.id,
        subido.archivo,
        actorDe(req),
      );
      if (!r.ok)
        return enviar(
          reply,
          estadoHttp(r.error.code),
          errorEnvelope(r.error.code, r.error.message),
        );
      return enviar(reply, 201, await cierreDeProyecto(db, req.params.id, true));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/proyectos/:id/cierre/firmado",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!validoId(req.params.id))
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Proyecto no encontrado"));
      const v = await vista(req.params.id, req);
      if ("error" in v) return enviar(reply, v.error.status, v.error.body);
      const ruta = await rutaInformeFirmado(req.params.id);
      if (!ruta)
        return enviar(reply, 404, errorEnvelope("NO_ENCONTRADO", "Aún no hay informe firmado"));
      await entregarArchivo(reply, storage, ruta, {
        nombre: `Conformidad_firmada_${v.c.proyecto.codigo}.pdf`,
        contentType: "application/pdf",
      });
    },
  );
}
