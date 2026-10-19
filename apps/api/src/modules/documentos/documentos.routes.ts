/**
 * Registro de rutas nativas Fastify: POST /api/documentos/upload y GET /api/documentos/:id.
 * Incluye GET /api/documentos/:id/descargar, POST /api/documentos/:id/visto-bueno y análisis.
 * También genera por POST /api/expedientes/:id/documentos/generar y descarga formatos generados.
 */
import { GenerarDocumentosSchema, VistoBuenoSchema } from "@pis/contracts";
import { db, documentoRevisiones, documentos, documentosGenerados, expedientes } from "@pis/db";
import { resolverNombreArchivoDescarga } from "@pis/domain";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { autorizar, esPersonal } from "../../infra/auth/autorizacion.js";
import { entregarArchivo } from "../../infra/http/entrega-archivo.js";
import { errorEnvelope, estadoHttp, PATRON_UUID } from "../../infra/http/errores.js";
import { enqueueRevisionDocumento } from "../../infra/jobs/colas.js";
import { LocalStorageService } from "../../infra/storage/local-storage.service.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { leerChecklist } from "../expedientes/expedientes.repository.js";
import { registerAnalisisDocumental } from "./analisis.routes.js";
import { GenerarDocumentosUseCase } from "./use-cases/generar-documentos/generar-documentos.use-case.js";
import { SubirDocumentoUseCase } from "./use-cases/subir-documento/subir-documento.use-case.js";
import { VistoBuenoDocumentoUseCase } from "./use-cases/visto-bueno/visto-bueno.use-case.js";

/**
 * Rutas documentales nativas (multipart y descargas en streaming no encajan
 * en ts-rest); los cuerpos JSON se validan contra los esquemas del contrato.
 */

const storage = new LocalStorageService();

/** UUID inválido se responde como 404, conservando el envelope común de rutas documentales. */
function idValido(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): boolean {
  if (PATRON_UUID.test(req.params.id)) return true;
  void reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
  return false;
}

/** Lee metadatos internos; cada handler debe comprobar el alcance antes de entregar el archivo. */
async function documentoPorId(id: string) {
  const rows = await db.select().from(documentos).where(eq(documentos.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Registra carga, consulta, descargas, visto bueno, generación y el análisis en analisis.routes.ts. */
export function registerDocumentosRoutes(app: FastifyInstance): void {
  registerAnalisisDocumental(app);
  /** POST /api/documentos/upload (multipart: expedienteId, tipo, file). */
  app.post(
    "/api/documentos/upload",
    { preHandler: requireAuth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const data = await req.file({
        limits: { files: 1, fields: 2, parts: 3, fieldSize: 2048, fileSize: 50 * 1024 * 1024 },
      });
      const fields = data?.fields as unknown as
        | { expedienteId?: { value: string }; tipo?: { value: string } }
        | undefined;
      const expedienteId = fields?.expedienteId?.value;
      const tipo = fields?.tipo?.value;
      if (!data || !expedienteId || !tipo) {
        await reply
          .status(400)
          .send(errorEnvelope("VALIDACION_FALLIDA", "Se requiere expedienteId, tipo y file (PDF)"));
        return;
      }
      const a = await autorizar(req.actor, { permiso: ["documentos", "crear"], expedienteId });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      if (
        !data.filename.toLowerCase().endsWith(".pdf") ||
        data.filename.length > 255 ||
        /[\\/:]/u.test(data.filename) ||
        data.filename.includes(String.fromCharCode(0))
      ) {
        await reply.status(400).send(errorEnvelope("DOCUMENTO_INVALIDO", "Nombre PDF inválido"));
        return;
      }
      const contenido = await storage.prepararPdf(data.file);
      let conservar = false;
      try {
        if (data.file.truncated) {
          await reply
            .status(400)
            .send(errorEnvelope("DOCUMENTO_INVALIDO", "El archivo excede el límite permitido"));
          return;
        }
        const comoTesista = !esPersonal(a.perfil.roles) && a.perfil.roles.includes("TESISTA");
        const uc = new SubirDocumentoUseCase(storage, await leerChecklist(db));
        const actor = req.actor ?? { id: "", dni: "desconocido" };
        const r = await uc.execute({
          expedienteId,
          tipo,
          filename: data.filename,
          contenido,
          actor,
          comoTesista,
        });
        if (!r.ok) {
          await reply
            .status(estadoHttp(r.error.code))
            .send(errorEnvelope(r.error.code, r.error.message));
          return;
        }
        conservar = true;
        if (tipo === "PLAN_ESTRUCTURADO") {
          await db
            .insert(documentoRevisiones)
            .values({
              documentoId: r.value.id,
              expedienteId,
              estado: "PENDIENTE",
            })
            .catch((e) => req.log.error(e, "Error al registrar revisión pendiente"));

          await enqueueRevisionDocumento({
            documentoId: r.value.id,
            expedienteId,
          });
        }
        await reply.status(201).send(r.value);
      } finally {
        await contenido.limpiar(conservar);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/documentos/:id",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      if (!idValido(req, reply)) return;
      const doc = await documentoPorId(req.params.id);
      if (!doc) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, {
        permiso: ["documentos", "ver"],
        expedienteId: doc.expedienteId,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      await reply.send({
        id: doc.id,
        expedienteId: doc.expedienteId,
        tipo: doc.tipo,
        etapa: doc.etapa,
        version: doc.version,
        sha256: doc.sha256,
        estado: doc.estado,
      });
    },
  );

  /** Descarga protegida: X-Accel-Redirect (Nginx) en prod, stream en dev. */
  app.get<{ Params: { id: string } }>(
    "/api/documentos/:id/descargar",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      if (!idValido(req, reply)) return;
      const doc = await documentoPorId(req.params.id);
      if (!doc) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, {
        permiso: ["documentos", "ver"],
        expedienteId: doc.expedienteId,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      await entregarArchivo(reply, storage, doc.ruta, {
        nombre: `${doc.tipo}_v${doc.version}.pdf`,
      });
    },
  );

  /** V°B° académico (RN-08: no cierra subetapas). */
  app.post<{ Params: { id: string } }>(
    "/api/documentos/:id/visto-bueno",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      if (!idValido(req, reply)) return;
      const parsed = VistoBuenoSchema.safeParse(req.body);
      if (!parsed.success) {
        await reply
          .status(400)
          .send(errorEnvelope("VALIDACION_FALLIDA", "Cuerpo inválido para el visto bueno"));
        return;
      }
      const doc = await documentoPorId(req.params.id);
      if (!doc) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, {
        permiso: ["documentos", "aprobar"],
        expedienteId: doc.expedienteId,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const actor = req.actor ?? { id: "", dni: "desconocido" };
      const r = await new VistoBuenoDocumentoUseCase().execute(
        req.params.id,
        {
          aprobado: parsed.data.aprobado,
          ...(parsed.data.comentario !== undefined ? { comentario: parsed.data.comentario } : {}),
        },
        actor,
      );
      if (!r.ok) {
        await reply
          .status(estadoHttp(r.error.code))
          .send(errorEnvelope(r.error.code, r.error.message));
        return;
      }
      await reply.status(200).send(r.value);
    },
  );

  /** "INSERTAR DATOS EN DOCUMENTOS": genera los formatos de la etapa (PDF). */
  app.post<{ Params: { id: string } }>(
    "/api/expedientes/:id/documentos/generar",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Expediente no encontrado"));
        return;
      }
      const parsed = GenerarDocumentosSchema.safeParse(req.body);
      if (!parsed.success) {
        await reply
          .status(400)
          .send(errorEnvelope("VALIDACION_FALLIDA", "Etapa inválida (E1, E2 o E6)"));
        return;
      }
      const a = await autorizar(req.actor, {
        permiso: ["expedientes", "editar"],
        expedienteId: req.params.id,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const actor = req.actor ?? { id: "", dni: "desconocido" };
      const r = await new GenerarDocumentosUseCase(storage).execute(
        req.params.id,
        parsed.data.etapa,
        actor,
        new Date(),
        { tipo: parsed.data.tipo, overrides: parsed.data.overrides },
      );
      if (!r.ok) {
        await reply
          .status(estadoHttp(r.error.code))
          .send(errorEnvelope(r.error.code, r.error.message));
        return;
      }
      await reply.status(200).send(r.value);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/documentos-generados/:id/descargar",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      if (!idValido(req, reply)) return;
      const rows = await db
        .select()
        .from(documentosGenerados)
        .where(eq(documentosGenerados.id, req.params.id))
        .limit(1);
      const gen = rows[0];
      if (!gen) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Formato no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, {
        permiso: ["documentos", "ver"],
        expedienteId: gen.expedienteId,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const exp = await db
        .select({
          codigo: expedientes.codigo,
          participante2Id: expedientes.participante2Id,
        })
        .from(expedientes)
        .where(eq(expedientes.id, gen.expedienteId))
        .limit(1);
      const codigoExp = exp[0]?.codigo ?? "EXP";
      const esDocx = gen.ruta.endsWith(".docx") || gen.archivoContenido !== null;
      const ext = esDocx ? "docx" : "pdf";
      const nombreDescarga = resolverNombreArchivoDescarga(codigoExp, gen.tipo, ext);

      if (gen.archivoContenido) {
        const mimeType = esDocx
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf";
        const asciiSafe = nombreDescarga
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Za-z0-9._ -]/g, "_");
        void reply
          .header("Content-Type", mimeType)
          .header(
            "Content-Disposition",
            `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(nombreDescarga)}`,
          )
          .header("Content-Length", gen.archivoContenido.length)
          .send(gen.archivoContenido);
        return;
      }

      await entregarArchivo(reply, storage, gen.ruta, {
        nombre: nombreDescarga,
        inline: false,
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/documentos/:id/revision",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      if (!idValido(req, reply)) return;
      const doc = await documentoPorId(req.params.id);
      if (!doc) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, {
        permiso: ["documentos", "ver"],
        expedienteId: doc.expedienteId,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      const rows = await db
        .select()
        .from(documentoRevisiones)
        .where(eq(documentoRevisiones.documentoId, req.params.id))
        .orderBy(desc(documentoRevisiones.createdAt))
        .limit(1);

      const rev = rows[0];
      if (!rev) {
        await reply.status(200).send(null);
        return;
      }

      await reply.status(200).send({
        id: rev.id,
        documentoId: rev.documentoId,
        expedienteId: rev.expedienteId,
        estado: rev.estado,
        hallazgos: rev.hallazgos,
        paginasAnalizadas: rev.paginasAnalizadas,
        createdAt: rev.createdAt.toISOString(),
        updatedAt: rev.updatedAt.toISOString(),
      });
    },
  );
}
