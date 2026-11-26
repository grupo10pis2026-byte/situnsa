/**
 * Gestión de formatos: catálogo y versiones (ts-rest) + subida multipart y
 * descargas (rutas nativas Fastify, ver AGENTS.md §6).
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import {
  type FormatoPublicoDTO,
  formatosContract,
  TipoFormatoSchema,
  VarianteFormatoSchema,
} from "@pis/contracts";
import { initServer } from "@ts-rest/fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { autorizar, denegado } from "../../infra/auth/autorizacion.js";
import { rutaPlantillaBase } from "../../infra/docx/render-docx.js";
import { entregarArchivo } from "../../infra/http/entrega-archivo.js";
import {
  errorEnvelope,
  estadoHttp,
  PATRON_UUID,
  respuestaErrorConConflicto,
} from "../../infra/http/errores.js";
import { OPCIONES_TS_REST } from "../../infra/http/manejador-errores.js";
import { LocalStorageService } from "../../infra/storage/local-storage.service.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { esDeMesaDePartes, type FormatoCatalogo } from "./catalogo-formatos.js";
import {
  buscarFormatoVigente,
  catalogoVigente,
  listarFormatos,
  listarVersiones,
  tieneBase,
  versionDTO,
  versionPorId,
} from "./formatos.repository.js";
import { ActivarVersionFormatoUseCase } from "./use-cases/activar-version/activar-version.use-case.js";
import { ActualizarFormatoUseCase } from "./use-cases/actualizar-formato/actualizar-formato.use-case.js";
import { AgregarFormatoUseCase } from "./use-cases/agregar-formato/agregar-formato.use-case.js";
import { EditarFormatoUseCase } from "./use-cases/editar-formato/editar-formato.use-case.js";
import { EliminarFormatoUseCase } from "./use-cases/eliminar-formato/eliminar-formato.use-case.js";
import { ReactivarFormatoUseCase } from "./use-cases/reactivar-formato/reactivar-formato.use-case.js";
import { RestaurarFormatoBaseUseCase } from "./use-cases/restaurar-base/restaurar-base.use-case.js";
import {
  SubirFormatoUseCase,
  TAMANO_MAXIMO_FORMATO,
} from "./use-cases/subir-formato/subir-formato.use-case.js";
import { type ResultadoVistaPrevia, vistaPreviaBase, vistaPreviaVersion } from "./vista-previa.js";

const s = initServer();
const storage = new LocalStorageService();
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Ver catálogo/descargar: personal con documentos; modificar: documentos.editar o administración. */
const PERMISO_VER = { permiso: ["documentos", "ver"] as [string, string] };
const PERMISO_EDITAR = {
  permiso: ["documentos", "editar"] as [string, string],
  alternativas: [["seguridad", "editar"]] as Array<[string, string]>,
};

function disposicion(nombre: string): string {
  const ascii = nombre.replace(/[^A-Za-z0-9._ -]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

/** Valor de un campo de texto del multipart (los campos van antes del archivo). */
function campoTexto(campos: unknown, nombre: string): string | undefined {
  if (typeof campos !== "object" || campos === null) return undefined;
  const campo = (campos as Record<string, unknown>)[nombre];
  if (typeof campo !== "object" || campo === null) return undefined;
  const valor = (campo as { value?: unknown }).value;
  return typeof valor === "string" ? valor : undefined;
}

/** Plantilla base del repositorio (fuera del volumen: se transmite como stream). */
async function enviarBase(reply: FastifyReply, ruta: string, nombre: string): Promise<void> {
  if (!existsSync(ruta)) {
    await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Plantilla base no disponible"));
    return;
  }
  await reply
    .header("Content-Type", MIME_DOCX)
    .header("Content-Length", String(statSync(ruta).size))
    .header("Content-Disposition", disposicion(nombre))
    .header("Cache-Control", "private, no-store")
    .status(200)
    .send(createReadStream(ruta));
}

/** Entrega la plantilla vigente del formato: versión activa (volumen) o base del repositorio. */
async function enviarVigente(reply: FastifyReply, formato: FormatoCatalogo): Promise<void> {
  const activa = (await listarVersiones(undefined, formato)).find((v) => v.activa);
  if (activa) {
    await entregarArchivo(reply, storage, activa.ruta, {
      nombre: formato.archivoBase,
      contentType: MIME_DOCX,
    });
    return;
  }
  const ruta = formato.etapaBase
    ? rutaPlantillaBase(formato.tipo, formato.etapaBase, formato.variante)
    : null;
  if (!ruta) {
    await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Plantilla base no disponible"));
    return;
  }
  await enviarBase(reply, ruta, formato.archivoBase);
}

/** Entrega la vista previa (PDF cacheado en el volumen) o el error correspondiente. */
async function responderVistaPrevia(
  req: FastifyRequest,
  reply: FastifyReply,
  r: ResultadoVistaPrevia,
  nombre: string,
): Promise<void> {
  if (r.ok) {
    await entregarArchivo(reply, storage, r.ruta, { nombre, inline: true });
    return;
  }
  if (r.motivo === "SIN_PLANTILLA") {
    await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Plantilla no disponible"));
    return;
  }
  req.log.error({ detalle: r.detalle }, "[formatos/vista-previa] Error al convertir con Gotenberg");
  await reply
    .status(502)
    .send(
      errorEnvelope(
        "CONVERSION_FALLIDA",
        "No se pudo generar la vista previa: el servicio de conversión a PDF no respondió.",
      ),
    );
}

export function registerFormatosRoutes(app: FastifyInstance): void {
  const router = s.router(formatosContract, {
    listarFormatos: async ({ request }) => {
      const a = await autorizar(request.actor, PERMISO_VER);
      if (!a.ok) return denegado(a);
      return { status: 200 as const, body: { formatos: await listarFormatos() } };
    },
    versionesFormato: async ({ params, request }) => {
      const a = await autorizar(request.actor, PERMISO_VER);
      if (!a.ok) return denegado(a);
      if (!(await buscarFormatoVigente(params.tipo, params.variante))) {
        return {
          status: 404 as const,
          body: errorEnvelope("NO_ENCONTRADO", "Formato no encontrado"),
        };
      }
      const versiones = await listarVersiones(undefined, params);
      return { status: 200 as const, body: versiones.map(versionDTO) };
    },
    actualizarFormato: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, PERMISO_EDITAR);
      if (!a.ok) return denegado(a);
      const r = await new ActualizarFormatoUseCase().execute({
        tipo: params.tipo,
        variante: params.variante,
        etapa: body.etapa,
        nombre: body.nombre,
        actor: request.actor ?? { id: "", dni: "desconocido" },
      });
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
    eliminarFormato: async ({ params, request }) => {
      const a = await autorizar(request.actor, PERMISO_EDITAR);
      if (!a.ok) return denegado(a);
      const r = await new EliminarFormatoUseCase().execute(
        params.tipo,
        params.variante,
        request.actor,
      );
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
    reactivarFormato: async ({ params, request }) => {
      const a = await autorizar(request.actor, PERMISO_EDITAR);
      if (!a.ok) return denegado(a);
      const r = await new ReactivarFormatoUseCase().execute(params.tipo, params.variante);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
    editarFormato: async ({ params, body, request }) => {
      const a = await autorizar(request.actor, PERMISO_EDITAR);
      if (!a.ok) return denegado(a);
      const r = await new EditarFormatoUseCase(storage).execute({
        tipo: params.tipo,
        variante: params.variante,
        reemplazos: body.reemplazos,
        versionBase: body.versionBase,
        nota: body.nota,
        aplicar: body.aplicar,
        actor: request.actor ?? { id: "", dni: "desconocido" },
      });
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
    activarVersionFormato: async ({ params, request }) => {
      const a = await autorizar(request.actor, PERMISO_EDITAR);
      if (!a.ok) return denegado(a);
      const r = await new ActivarVersionFormatoUseCase().execute(params.id);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
    restaurarFormatoBase: async ({ params, request }) => {
      const a = await autorizar(request.actor, PERMISO_EDITAR);
      if (!a.ok) return denegado(a);
      const r = await new RestaurarFormatoBaseUseCase().execute(params.tipo, params.variante);
      if (!r.ok) return respuestaErrorConConflicto(r.error);
      return { status: 200 as const, body: r.value };
    },
  });
  void app.register(async (scoped) => {
    scoped.addHook("preHandler", requireAuth);
    await scoped.register(s.plugin(router), OPCIONES_TS_REST);
  });

  /**
   * POST /api/formatos/:variante (multipart: nombre, etapa, nota?, file .docx)
   * → formato nuevo agregado a la etapa, con su versión 1 activa.
   */
  app.post<{ Params: { variante: string } }>(
    "/api/formatos/:variante",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const variante = VarianteFormatoSchema.safeParse(req.params.variante);
      if (!variante.success) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Variante no encontrada"));
        return;
      }
      const a = await autorizar(req.actor, PERMISO_EDITAR);
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const data = await req.file({
        limits: { files: 1, fields: 3, parts: 4, fieldSize: 1024, fileSize: TAMANO_MAXIMO_FORMATO },
      });
      if (!data) {
        await reply
          .status(400)
          .send(errorEnvelope("VALIDACION_FALLIDA", "Adjunte el formato en Word (.docx)"));
        return;
      }
      const bytes = await data.toBuffer();
      if (data.file.truncated) {
        await reply
          .status(400)
          .send(errorEnvelope("DOCUMENTO_INVALIDO", "El archivo supera el límite de 10 MB"));
        return;
      }
      const r = await new AgregarFormatoUseCase(storage).execute({
        variante: variante.data,
        etapa: campoTexto(data.fields, "etapa") ?? "",
        nombre: campoTexto(data.fields, "nombre") ?? "",
        nota: campoTexto(data.fields, "nota"),
        nombreArchivo: data.filename,
        bytes,
        actor: req.actor ?? { id: "", dni: "desconocido" },
      });
      if (!r.ok) {
        await reply
          .status(estadoHttp(r.error.code))
          .send(errorEnvelope(r.error.code, r.error.message));
        return;
      }
      await reply.status(201).send(r.value);
    },
  );

  /** POST /api/formatos/:variante/:tipo (multipart: file .docx, nota?) → nueva versión activa. */
  app.post<{ Params: { variante: string; tipo: string } }>(
    "/api/formatos/:variante/:tipo",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const variante = VarianteFormatoSchema.safeParse(req.params.variante);
      const tipo = TipoFormatoSchema.safeParse(req.params.tipo);
      if (
        !variante.success ||
        !tipo.success ||
        !(await buscarFormatoVigente(tipo.data, variante.data))
      ) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Formato no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, PERMISO_EDITAR);
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const data = await req.file({
        limits: { files: 1, fields: 1, parts: 2, fieldSize: 1024, fileSize: TAMANO_MAXIMO_FORMATO },
      });
      if (!data) {
        await reply
          .status(400)
          .send(errorEnvelope("VALIDACION_FALLIDA", "Adjunte el formato en Word (.docx)"));
        return;
      }
      const bytes = await data.toBuffer();
      if (data.file.truncated) {
        await reply
          .status(400)
          .send(errorEnvelope("DOCUMENTO_INVALIDO", "El archivo supera el límite de 10 MB"));
        return;
      }
      const nota = campoTexto(data.fields, "nota");
      const r = await new SubirFormatoUseCase(storage).execute({
        tipo: tipo.data,
        variante: variante.data,
        nombreArchivo: data.filename,
        bytes,
        nota,
        actor: req.actor ?? { id: "", dni: "desconocido" },
      });
      if (!r.ok) {
        await reply
          .status(estadoHttp(r.error.code))
          .send(errorEnvelope(r.error.code, r.error.message));
        return;
      }
      await reply.status(201).send(r.value);
    },
  );

  /** GET /api/formatos/:variante/:tipo/descargar: plantilla vigente (versión activa o base). */
  app.get<{ Params: { variante: string; tipo: string } }>(
    "/api/formatos/:variante/:tipo/descargar",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const variante = VarianteFormatoSchema.safeParse(req.params.variante);
      const tipo = TipoFormatoSchema.safeParse(req.params.tipo);
      const formato =
        variante.success && tipo.success
          ? await buscarFormatoVigente(tipo.data, variante.data)
          : null;
      if (!formato) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Formato no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, PERMISO_VER);
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      await enviarVigente(reply, formato);
    },
  );

  /**
   * GET /api/v1/public/formatos-mesa-de-partes?variante=1|2 (sin sesión):
   * formatos de Mesa de Partes con archivo disponible, para el wizard público.
   */
  app.get<{ Querystring: { variante?: string } }>(
    "/api/v1/public/formatos-mesa-de-partes",
    async (req, reply) => {
      const variante = VarianteFormatoSchema.safeParse(req.query.variante ?? "1");
      if (!variante.success) {
        await reply.status(400).send(errorEnvelope("VALIDACION_FALLIDA", "Variante inválida"));
        return;
      }
      const candidatos = (await catalogoVigente()).filter(
        (f) => f.variante === variante.data && esDeMesaDePartes(f),
      );
      const activas = new Set(
        (await listarVersiones()).filter((v) => v.activa).map((v) => `${v.variante}:${v.tipo}`),
      );
      const formatos: FormatoPublicoDTO[] = candidatos
        .filter((f) => activas.has(`${f.variante}:${f.tipo}`) || tieneBase(f))
        .map((f) => ({
          tipo: f.tipo,
          variante: f.variante,
          nombre: f.nombre,
          requisito: f.requisito,
          nombreArchivo: f.archivoBase,
        }));
      await reply.header("Cache-Control", "no-cache").status(200).send({ formatos });
    },
  );

  /** GET /api/v1/public/formatos-mesa-de-partes/:variante/:tipo/descargar (sin sesión, solo `MP`). */
  app.get<{ Params: { variante: string; tipo: string } }>(
    "/api/v1/public/formatos-mesa-de-partes/:variante/:tipo/descargar",
    async (req, reply) => {
      const variante = VarianteFormatoSchema.safeParse(req.params.variante);
      const tipo = TipoFormatoSchema.safeParse(req.params.tipo);
      const formato =
        variante.success && tipo.success
          ? await buscarFormatoVigente(tipo.data, variante.data)
          : null;
      // Solo los formatos de Mesa de Partes son públicos; el resto responde igual que inexistente.
      if (!formato || !esDeMesaDePartes(formato)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Formato no encontrado"));
        return;
      }
      await enviarVigente(reply, formato);
    },
  );

  /** GET /api/formatos/versiones/:id/descargar: una versión concreta del historial. */
  app.get<{ Params: { id: string } }>(
    "/api/formatos/versiones/:id/descargar",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Versión no encontrada"));
        return;
      }
      const a = await autorizar(req.actor, PERMISO_VER);
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const v = await versionPorId(req.params.id);
      if (!v) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Versión no encontrada"));
        return;
      }
      await entregarArchivo(reply, storage, v.ruta, {
        nombre: `${v.tipo}_v${v.version}.docx`,
        contentType: MIME_DOCX,
      });
    },
  );

  /** GET /api/formatos/:variante/:tipo/vista-previa: PDF de la plantilla vigente (inline). */
  app.get<{ Params: { variante: string; tipo: string } }>(
    "/api/formatos/:variante/:tipo/vista-previa",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const variante = VarianteFormatoSchema.safeParse(req.params.variante);
      const tipo = TipoFormatoSchema.safeParse(req.params.tipo);
      const formato =
        variante.success && tipo.success
          ? await buscarFormatoVigente(tipo.data, variante.data)
          : null;
      if (!formato) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Formato no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, PERMISO_VER);
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const activa = (await listarVersiones(undefined, formato)).find((v) => v.activa);
      const r = activa
        ? await vistaPreviaVersion(storage, activa)
        : await vistaPreviaBase(storage, formato);
      await responderVistaPrevia(req, reply, r, `${formato.tipo}.pdf`);
    },
  );

  /** GET /api/formatos/versiones/:id/vista-previa: PDF de una versión del historial. */
  app.get<{ Params: { id: string } }>(
    "/api/formatos/versiones/:id/vista-previa",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Versión no encontrada"));
        return;
      }
      const a = await autorizar(req.actor, PERMISO_VER);
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const v = await versionPorId(req.params.id);
      if (!v) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Versión no encontrada"));
        return;
      }
      await responderVistaPrevia(
        req,
        reply,
        await vistaPreviaVersion(storage, v),
        `${v.tipo}_v${v.version}.pdf`,
      );
    },
  );
}
