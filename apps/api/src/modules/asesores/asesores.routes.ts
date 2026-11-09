import { asesoresContract, type ErrorEnvelope } from "@pis/contracts";
import { asesorArchivos, db } from "@pis/db";
import type { DomainError } from "@pis/domain";
import { initServer } from "@ts-rest/fastify";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  type Autorizacion,
  autorizar,
  denegado,
  esPersonal,
} from "../../infra/auth/autorizacion.js";
import { entregarArchivo } from "../../infra/http/entrega-archivo.js";
import { errorEnvelope, estadoHttp, PATRON_UUID } from "../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../infra/http/manejador-errores.js";
import { LocalStorageService } from "../../infra/storage/local-storage.service.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { especialidadesActivas, listarAsesores, perfilAsesor } from "./asesores.repository.js";
import {
  AgregarEspecialidadAsesorUseCase,
  CrearAsesorUseCase,
  EditarAsesorUseCase,
  EliminarArchivoAsesorUseCase,
  QuitarEspecialidadAsesorUseCase,
  SubirArchivoAsesorUseCase,
} from "./use-cases/asesores.use-cases.js";

const s = initServer();
const storage = new LocalStorageService();

/**
 * Permisos (spec v1.0 §4): "Gestionar asesores y su perfil" es de la
 * Secretaría del Taller → `taller.crear` (RESP_TALLER y Administrador).
 * La lectura es del personal administrativo: un asesor o un tesista no
 * ve el catálogo con DNI y correos de los demás.
 */
async function autorizarLectura(
  actor: FastifyRequest["actor"],
): Promise<Extract<Autorizacion, { ok: false }> | null> {
  const a = await autorizar(actor, { permiso: ["taller", "ver"] });
  if (!a.ok) return a;
  if (!esPersonal(a.perfil.roles))
    return {
      ok: false,
      status: 403,
      body: errorEnvelope("SIN_PERMISO", "Solo el personal administrativo ve los asesores"),
    };
  return null;
}

async function autorizarGestion(
  actor: FastifyRequest["actor"],
): Promise<Extract<Autorizacion, { ok: false }> | null> {
  const a = await autorizar(actor, { permiso: ["taller", "crear"] });
  return a.ok ? null : a;
}

/** Error de dominio → respuesta tipada, con el campo de cada error de validación. */
function respuestaError(e: DomainError & { errores?: Array<{ campo: string; mensaje: string }> }): {
  status: 400 | 403 | 404 | 409;
  body: ErrorEnvelope;
} {
  return {
    status: estadoHttp(e.code),
    body: errorEnvelope(
      e.code,
      e.message,
      e.errores?.map((x) => ({ campo: x.campo, mensaje: x.mensaje })),
    ),
  };
}

function actorDe(req: FastifyRequest): { id: string; dni: string } {
  return req.actor ?? { id: "", dni: "desconocido" };
}

export function registerAsesoresRoutes(app: FastifyInstance): void {
  const router = s.router(asesoresContract, {
    listar: async ({ request }) => {
      const negado = await autorizarLectura(request.actor);
      if (negado) return denegado(negado);
      return { status: 200 as const, body: { items: await listarAsesores() } };
    },
    crear: async ({ body, request }) => {
      const negado = await autorizarGestion(request.actor);
      if (negado) return denegado(negado);
      const r = await new CrearAsesorUseCase().execute(
        {
          dni: body.dni,
          nombres: body.nombres,
          apellidos: body.apellidos,
          email: body.email,
          ...(body.telefono !== undefined ? { telefono: body.telefono } : {}),
          ...(body.grado !== undefined ? { grado: body.grado } : {}),
          ...(body.especialidades !== undefined ? { especialidades: body.especialidades } : {}),
        },
        actorDe(request),
      );
      if (!r.ok) return respuestaError(r.error);
      return { status: 201 as const, body: r.value };
    },
    editar: async ({ params, body, request }) => {
      const negado = await autorizarGestion(request.actor);
      if (negado) return denegado(negado);
      const r = await new EditarAsesorUseCase().execute(
        params.id,
        {
          ...(body.nombres !== undefined ? { nombres: body.nombres } : {}),
          ...(body.apellidos !== undefined ? { apellidos: body.apellidos } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.telefono !== undefined ? { telefono: body.telefono } : {}),
          ...(body.grado !== undefined ? { grado: body.grado } : {}),
          ...(body.activo !== undefined ? { activo: body.activo } : {}),
        },
        actorDe(request),
      );
      if (!r.ok) return respuestaError(r.error);
      return { status: 200 as const, body: r.value };
    },
    perfil: async ({ params, request }) => {
      const negado = await autorizarLectura(request.actor);
      if (negado) return denegado(negado);
      const p = await perfilAsesor(params.id);
      if (!p)
        return {
          status: 404 as const,
          body: errorEnvelope("NO_ENCONTRADO", "Asesor no encontrado"),
        };
      return { status: 200 as const, body: p };
    },
    agregarEspecialidad: async ({ params, body, request }) => {
      const negado = await autorizarGestion(request.actor);
      if (negado) return denegado(negado);
      const r = await new AgregarEspecialidadAsesorUseCase().execute(
        params.id,
        body.nombre,
        actorDe(request),
      );
      if (!r.ok) return respuestaError(r.error);
      return { status: 200 as const, body: r.value };
    },
    quitarEspecialidad: async ({ params, request }) => {
      const negado = await autorizarGestion(request.actor);
      if (negado) return denegado(negado);
      const r = await new QuitarEspecialidadAsesorUseCase().execute(
        params.id,
        params.especialidadId,
        actorDe(request),
      );
      if (!r.ok) return respuestaError(r.error);
      return { status: 200 as const, body: r.value };
    },
    eliminarArchivo: async ({ params, request }) => {
      const negado = await autorizarGestion(request.actor);
      if (negado) return denegado(negado);
      const r = await new EliminarArchivoAsesorUseCase().execute(
        params.id,
        params.archivoId,
        actorDe(request),
      );
      if (!r.ok) return respuestaError(r.error);
      return { status: 200 as const, body: r.value };
    },
    especialidades: async ({ request }) => {
      const negado = await autorizarLectura(request.actor);
      if (negado) return denegado(negado);
      return { status: 200 as const, body: { items: await especialidadesActivas() } };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });

  /** P10 "Subir archivo": PDF en el campo `file` (multipart). */
  app.post<{ Params: { id: string } }>(
    "/api/asesores/:id/archivos",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Asesor no encontrado"));
        return;
      }
      const negado = await autorizarGestion(req.actor);
      if (negado) {
        await reply.status(negado.status).send(negado.body);
        return;
      }
      let archivo: Awaited<ReturnType<FastifyRequest["file"]>> | undefined;
      let bytes: Uint8Array | null = null;
      try {
        // Un byte de margen sobre el máximo: el dominio da el mensaje claro.
        archivo = await req.file({ limits: { fileSize: 10 * 1024 * 1024 + 1, files: 1 } });
        if (archivo) {
          bytes = new Uint8Array(await archivo.toBuffer());
          if (archivo.file.truncated) bytes = null;
        }
      } catch {
        bytes = null;
      }
      if (!archivo || !bytes) {
        await reply
          .status(400)
          .send(errorEnvelope("DOCUMENTO_INVALIDO", "Sube un PDF de hasta 10 MB"));
        return;
      }
      const r = await new SubirArchivoAsesorUseCase(storage).execute(
        req.params.id,
        { filename: archivo.filename, mime: archivo.mimetype, bytes },
        actorDe(req),
      );
      if (!r.ok) {
        await reply
          .status(estadoHttp(r.error.code))
          .send(errorEnvelope(r.error.code, r.error.message));
        return;
      }
      await reply.status(201).send(r.value);
    },
  );

  /** P10 "Ver" y "Descargar" (descarga protegida; la web la pide con Bearer). */
  app.get<{ Params: { id: string; archivoId: string } }>(
    "/api/asesores/:id/archivos/:archivoId",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id) || !PATRON_UUID.test(req.params.archivoId)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Archivo no encontrado"));
        return;
      }
      const negado = await autorizarLectura(req.actor);
      if (negado) {
        await reply.status(negado.status).send(negado.body);
        return;
      }
      const [a] = await db
        .select({ ruta: asesorArchivos.ruta, nombre: asesorArchivos.nombreOriginal })
        .from(asesorArchivos)
        .where(
          and(
            eq(asesorArchivos.id, req.params.archivoId),
            eq(asesorArchivos.asesorId, req.params.id),
            isNull(asesorArchivos.eliminadoAt),
          ),
        )
        .limit(1);
      if (!a) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Archivo no encontrado"));
        return;
      }
      await entregarArchivo(reply, storage, a.ruta, {
        nombre: /\.pdf$/i.test(a.nombre) ? a.nombre : `${a.nombre}.pdf`,
        contentType: "application/pdf",
      });
    },
  );
}
