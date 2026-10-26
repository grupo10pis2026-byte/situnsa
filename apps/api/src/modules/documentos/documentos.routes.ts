/**
 * Registro de rutas nativas Fastify: POST /api/documentos/upload y GET /api/documentos/:id.
 * Incluye GET /api/documentos/:id/descargar, POST /api/documentos/:id/visto-bueno y análisis.
 * También genera por POST /api/expedientes/:id/documentos/generar y descarga formatos generados.
 */
import {
  CrearObservacionDocumentoSchema,
  GenerarDocumentosSchema,
  VistoBuenoSchema,
} from "@pis/contracts";
import {
  db,
  documentoObservaciones,
  documentoRevisiones,
  documentos,
  documentosGenerados,
  expedientes,
  mensajes,
  usuarios,
} from "@pis/db";
import { resolverNombreArchivoDescarga } from "@pis/domain";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { autorizar, esPersonal } from "../../infra/auth/autorizacion.js";
import { convertirDocxAPdf } from "../../infra/docx/docx-to-pdf.js";
import { entregarArchivo } from "../../infra/http/entrega-archivo.js";
import { errorEnvelope, estadoHttp, PATRON_UUID } from "../../infra/http/errores.js";
import { enqueueCorreo, enqueueRevisionDocumento } from "../../infra/jobs/colas.js";
import { LocalStorageService } from "../../infra/storage/local-storage.service.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { appendAuditoria } from "../expedientes/expedientes.auditoria.js";
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
        // Iniciar revisión documental automática para documentos subidos
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
  /** Vista previa y descarga en formato PDF del documento generado. */
  app.get<{ Params: { id: string }; Querystring: { descargar?: string } }>(
    "/api/documentos-generados/:id/pdf",
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
        })
        .from(expedientes)
        .where(eq(expedientes.id, gen.expedienteId))
        .limit(1);
      const codigoExp = exp[0]?.codigo ?? "EXP";
      const nombrePdf = resolverNombreArchivoDescarga(codigoExp, gen.tipo, "pdf");
      const asciiSafe = nombrePdf
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9._ -]/g, "_");
      const disposition = req.query?.descargar === "1" ? "attachment" : "inline";

      // Si el archivo almacenado ya es un PDF nativo
      if (gen.archivoContenido && gen.archivoContenido.slice(0, 4).toString() === "%PDF") {
        void reply
          .header("Content-Type", "application/pdf")
          .header(
            "Content-Disposition",
            `${disposition}; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(nombrePdf)}`,
          )
          .header("Content-Length", gen.archivoContenido.length)
          .send(gen.archivoContenido);
        return;
      }

      // Convertir el DOCX oficial almacenado a PDF usando Gotenberg (LibreOffice headless)
      if (gen.archivoContenido) {
        try {
          const pdfBuffer = await convertirDocxAPdf(gen.archivoContenido, `${gen.tipo}.docx`);
          void reply
            .header("Content-Type", "application/pdf")
            .header(
              "Content-Disposition",
              `${disposition}; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(nombrePdf)}`,
            )
            .header("Content-Length", pdfBuffer.length)
            .send(pdfBuffer);
          return;
        } catch (err) {
          req.log.error(err, "[documentos-generados/pdf] Error al convertir DOCX con Gotenberg");
          await reply
            .status(502)
            .send(
              errorEnvelope(
                "CONVERSION_FALLIDA",
                "No se pudo convertir el formato Word a PDF con el servicio de conversión Gotenberg.",
              ),
            );
          return;
        }
      }

      // Fallback si no hay contenido en BD: entregar desde volumen si existe
      await entregarArchivo(reply, storage, gen.ruta, {
        nombre: nombrePdf,
        inline: req.query?.descargar !== "1",
      });
    },
  );

  let tablaObservacionesAsegurada = false;
  async function asegurarTablaObservaciones(): Promise<void> {
    if (tablaObservacionesAsegurada) return;
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "documento_observaciones" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "expediente_id" uuid NOT NULL REFERENCES "expedientes"("id") ON DELETE cascade,
          "tipo_documento" varchar(64) NOT NULL,
          "documento_id" uuid REFERENCES "documentos"("id") ON DELETE set null,
          "texto" text NOT NULL,
          "autor_id" uuid REFERENCES "usuarios"("id") ON DELETE set null,
          "autor_nombre" text,
          "autor_rol" varchar(32),
          "estado" varchar(32) DEFAULT 'PENDIENTE' NOT NULL,
          "resuelto_at" timestamp with time zone,
          "resuelto_por_id" uuid REFERENCES "usuarios"("id") ON DELETE set null,
          "resuelto_por_nombre" text,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        );
      `);
      tablaObservacionesAsegurada = true;
    } catch {
      // Ignorar si ya existe
    }
  }

  /** GET /api/expedientes/:expedienteId/documentos/:tipo/observaciones: Historial de observaciones. */
  app.get<{ Params: { expedienteId: string; tipo: string } }>(
    "/api/expedientes/:expedienteId/documentos/:tipo/observaciones",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const { expedienteId, tipo } = req.params;
      if (!PATRON_UUID.test(expedienteId)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Expediente no encontrado"));
        return;
      }
      const a = await autorizar(req.actor, {
        permiso: ["expedientes", "ver"],
        expedienteId,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      await asegurarTablaObservaciones();
      try {
        const items = await db
          .select()
          .from(documentoObservaciones)
          .where(
            and(
              eq(documentoObservaciones.expedienteId, expedienteId),
              eq(documentoObservaciones.tipoDocumento, tipo),
            ),
          )
          .orderBy(asc(documentoObservaciones.createdAt));

        await reply.send(
          items.map((it) => ({
            id: it.id,
            expedienteId: it.expedienteId,
            tipoDocumento: it.tipoDocumento,
            documentoId: it.documentoId,
            texto: it.texto,
            autorId: it.autorId,
            autorNombre: it.autorNombre,
            autorRol: it.autorRol,
            estado: it.estado as "PENDIENTE" | "RESUELTO",
            resueltoAt: it.resueltoAt?.toISOString() ?? null,
            resueltoPorId: it.resueltoPorId,
            resueltoPorNombre: it.resueltoPorNombre,
            createdAt: it.createdAt.toISOString(),
          })),
        );
      } catch (err) {
        req.log.error(err, "Error al consultar historial de observaciones");
        await reply.send([]);
      }
    },
  );

  /** POST /api/expedientes/:expedienteId/documentos/:tipo/observaciones: Nueva observación (marca OBSERVADO). */
  app.post<{ Params: { expedienteId: string; tipo: string } }>(
    "/api/expedientes/:expedienteId/documentos/:tipo/observaciones",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const { expedienteId, tipo } = req.params;
      if (!PATRON_UUID.test(expedienteId)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Expediente no encontrado"));
        return;
      }
      const parsed = CrearObservacionDocumentoSchema.safeParse(req.body);
      if (!parsed.success) {
        await reply
          .status(400)
          .send(errorEnvelope("VALIDACION_FALLIDA", "Texto de observación inválido o vacío"));
        return;
      }
      const a = await autorizar(req.actor, {
        permiso: ["expedientes", "editar"],
        alternativas: [
          ["documentos", "aprobar"],
          ["portal_asesor", "crear"],
          ["portal_asesor", "editar"],
          ["expedientes", "ver"],
        ],
        expedienteId,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }

      const rolesUsuario = a.perfil.roles;
      const puedeObservar =
        esPersonal(rolesUsuario) ||
        rolesUsuario.includes("ADMIN_SISTEMA") ||
        rolesUsuario.includes("ADMIN_FIPS") ||
        rolesUsuario.includes("SECRETARIA") ||
        rolesUsuario.includes("ASESOR") ||
        rolesUsuario.includes("JURADO");
      if (!puedeObservar) {
        await reply
          .status(403)
          .send(
            errorEnvelope(
              "SIN_PERMISO",
              "Solo el personal administrativo o revisores pueden registrar observaciones",
            ),
          );
        return;
      }

      await asegurarTablaObservaciones();
      try {
        const actor = req.actor ?? { id: "", dni: "desconocido" };
        const actorUsuario = actor.id
          ? (
              await db
                .select({
                  nombres: usuarios.nombres,
                  apellidos: usuarios.apellidos,
                  rol: usuarios.rol,
                })
                .from(usuarios)
                .where(eq(usuarios.id, actor.id))
                .limit(1)
            )[0]
          : null;

        const autorNombre = actorUsuario
          ? `${actorUsuario.nombres} ${actorUsuario.apellidos}`
          : "Administración";
        const autorRol = actorUsuario?.rol ?? "ADMIN_FIPS";

        // Hallar el documento si se proporcionó o el más reciente
        let targetDocId = parsed.data.documentoId ?? null;
        let targetDocVersion: number | null = null;
        if (!targetDocId) {
          const ult = await db
            .select({ id: documentos.id, version: documentos.version })
            .from(documentos)
            .where(and(eq(documentos.expedienteId, expedienteId), eq(documentos.tipo, tipo)))
            .orderBy(desc(documentos.version))
            .limit(1);
          if (ult[0]) {
            targetDocId = ult[0].id;
            targetDocVersion = ult[0].version;
          }
        }

        // Si existe documento cargado o vigente, marcarlo como OBSERVADO
        if (targetDocId) {
          await db
            .update(documentos)
            .set({ estado: "OBSERVADO" })
            .where(eq(documentos.id, targetDocId));
        }

        const [obs] = await db
          .insert(documentoObservaciones)
          .values({
            expedienteId,
            tipoDocumento: tipo,
            documentoId: targetDocId,
            texto: parsed.data.texto.trim(),
            autorId: actor.id || null,
            autorNombre,
            autorRol,
            estado: "PENDIENTE",
          })
          .returning();

        if (!obs) {
          await reply
            .status(500)
            .send(errorEnvelope("ERROR_INTERNO", "No se pudo registrar la observación"));
          return;
        }

        // Insertar en mensajes generales del expediente
        await db.insert(mensajes).values({
          expedienteId,
          autorId: actor.id || null,
          texto: `[Observación en ${tipo}]: ${parsed.data.texto.trim()}`,
        });

        // Auditoría
        const expRows = await db
          .select({ estado: expedientes.estado })
          .from(expedientes)
          .where(eq(expedientes.id, expedienteId))
          .limit(1);
        const macro = expRows[0]?.estado ?? "REGISTRADO";
        await appendAuditoria(db, {
          expedienteId,
          actorId: actor.id,
          actorDni: actor.dni,
          estadoAnterior: macro,
          estadoNuevo: macro,
          detalle: `Observado ${tipo}${targetDocVersion !== null ? ` v${targetDocVersion}` : ""}: ${parsed.data.texto.trim().slice(0, 150)}`,
        });

        // Notificar por correo al tesista
        await enqueueCorreo({
          expedienteId,
          asunto: "Un documento de tu expediente fue observado",
          titulo: "Documento observado",
          texto: `El documento ${tipo} fue observado: ${parsed.data.texto.trim()}

Puedes revisar el detalle de la observación y subsanarla cargando una nueva versión desde tu portal.`,
        });

        await reply.status(201).send({
          id: obs.id,
          expedienteId: obs.expedienteId,
          tipoDocumento: obs.tipoDocumento,
          documentoId: obs.documentoId,
          texto: obs.texto,
          autorId: obs.autorId,
          autorNombre: obs.autorNombre,
          autorRol: obs.autorRol,
          estado: obs.estado as "PENDIENTE" | "RESUELTO",
          resueltoAt: obs.resueltoAt?.toISOString() ?? null,
          resueltoPorId: obs.resueltoPorId,
          resueltoPorNombre: obs.resueltoPorNombre,
          createdAt: obs.createdAt.toISOString(),
        });
      } catch (err) {
        req.log.error(err, "Error al registrar observación de documento");
        await reply
          .status(500)
          .send(
            errorEnvelope(
              "ERROR_INTERNO",
              err instanceof Error ? err.message : "Error al registrar la observación",
            ),
          );
      }
    },
  );

  /** PATCH /api/expedientes/:expedienteId/documentos/:tipo/observaciones/:observacionId/resolver: Marcar resuelto. */
  app.patch<{ Params: { expedienteId: string; tipo: string; observacionId: string } }>(
    "/api/expedientes/:expedienteId/documentos/:tipo/observaciones/:observacionId/resolver",
    { preHandler: async (req, reply) => requireAuth(req, reply) },
    async (req, reply) => {
      const { expedienteId, tipo, observacionId } = req.params;
      if (!PATRON_UUID.test(expedienteId) || !PATRON_UUID.test(observacionId)) {
        await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Recurso no encontrado"));
        return;
      }
      // Autorizado tanto si es el tesista del expediente como si es personal
      const a = await autorizar(req.actor, {
        permiso: ["expedientes", "ver"],
        expedienteId,
      });
      if (!a.ok) {
        await reply.status(a.status).send(a.body);
        return;
      }
      await asegurarTablaObservaciones();
      try {
        const obsList = await db
          .select()
          .from(documentoObservaciones)
          .where(
            and(
              eq(documentoObservaciones.id, observacionId),
              eq(documentoObservaciones.expedienteId, expedienteId),
              eq(documentoObservaciones.tipoDocumento, tipo),
            ),
          )
          .limit(1);
        const obs = obsList[0];
        if (!obs) {
          await reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Observación no encontrada"));
          return;
        }

        if (obs.estado === "RESUELTO") {
          await reply.send({
            id: obs.id,
            expedienteId: obs.expedienteId,
            tipoDocumento: obs.tipoDocumento,
            documentoId: obs.documentoId,
            texto: obs.texto,
            autorId: obs.autorId,
            autorNombre: obs.autorNombre,
            autorRol: obs.autorRol,
            estado: "RESUELTO",
            resueltoAt: obs.resueltoAt?.toISOString() ?? null,
            resueltoPorId: obs.resueltoPorId,
            resueltoPorNombre: obs.resueltoPorNombre,
            createdAt: obs.createdAt.toISOString(),
          });
          return;
        }

        const actor = req.actor ?? { id: "", dni: "desconocido" };
        const actorUsuario = actor.id
          ? (
              await db
                .select({
                  nombres: usuarios.nombres,
                  apellidos: usuarios.apellidos,
                })
                .from(usuarios)
                .where(eq(usuarios.id, actor.id))
                .limit(1)
            )[0]
          : null;

        const resueltoPorNombre = actorUsuario
          ? `${actorUsuario.nombres} ${actorUsuario.apellidos}`
          : "Tesista";

        const now = new Date();
        const [updated] = await db
          .update(documentoObservaciones)
          .set({
            estado: "RESUELTO",
            resueltoAt: now,
            resueltoPorId: actor.id || null,
            resueltoPorNombre,
            updatedAt: now,
          })
          .where(eq(documentoObservaciones.id, observacionId))
          .returning();

        if (!updated) {
          await reply
            .status(500)
            .send(errorEnvelope("ERROR_INTERNO", "No se pudo actualizar la observación"));
          return;
        }

        await appendAuditoria(db, {
          expedienteId,
          actorId: actor.id,
          actorDni: actor.dni,
          estadoAnterior: "OBSERVADO",
          estadoNuevo: "OBSERVADO",
          detalle: `Observación en ${tipo} marcada como resuelta por ${resueltoPorNombre}`,
        });

        await reply.send({
          id: updated.id,
          expedienteId: updated.expedienteId,
          tipoDocumento: updated.tipoDocumento,
          documentoId: updated.documentoId,
          texto: updated.texto,
          autorId: updated.autorId,
          autorNombre: updated.autorNombre,
          autorRol: updated.autorRol,
          estado: updated.estado as "PENDIENTE" | "RESUELTO",
          resueltoAt: updated.resueltoAt?.toISOString() ?? null,
          resueltoPorId: updated.resueltoPorId,
          resueltoPorNombre: updated.resueltoPorNombre,
          createdAt: updated.createdAt.toISOString(),
        });
      } catch (err) {
        req.log.error(err, "Error al resolver observación de documento");
        await reply
          .status(500)
          .send(
            errorEnvelope(
              "ERROR_INTERNO",
              err instanceof Error ? err.message : "Error al resolver la observación",
            ),
          );
      }
    },
  );
}
