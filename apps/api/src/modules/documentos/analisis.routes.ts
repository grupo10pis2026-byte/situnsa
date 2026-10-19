/**
 * Adaptador HTTP del análisis documental, registrado desde documentos.routes.ts.
 * Ruta: POST /api/documentos/:id/analisis. Contrato: packages/contracts/src/analisis-documental.ts.
 */
import { AnalisisDocumentoRequestSchema } from "@pis/contracts";
import { db, documentoRevisiones, documentos, expedientes, usuarios } from "@pis/db";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { autorizar } from "../../infra/auth/autorizacion.js";
import { errorEnvelope, PATRON_UUID } from "../../infra/http/errores.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { AnalizarDocumentoUseCase } from "./use-cases/analizar-documento/analizar-documento.use-case.js";

let activo = false;

/**
 * Registra POST /api/documentos/:id/analisis, invocado desde analisis-documental.ts en web.
 * Exige autenticación, alcance del expediente y PLAN_ESTRUCTURADO; limita a 5/min por actor.
 * Solo admite un análisis simultáneo en esta instancia y libera el cupo en finally.
 */
export function registerAnalisisDocumental(app: FastifyInstance): void {
  const cuota = app.createRateLimit({
    max: 5,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.actor?.id ?? req.ip,
  });
  app.post<{ Params: { id: string } }>(
    "/api/documentos/:id/analisis",
    {
      preHandler: async (req, reply) => requireAuth(req, reply),
      bodyLimit: 1024,
      config: { rateLimit: false },
    },
    async (req, reply) => {
      if (!PATRON_UUID.test(req.params.id))
        return reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
      const [doc] = await db
        .select()
        .from(documentos)
        .where(eq(documentos.id, req.params.id))
        .limit(1);
      if (!doc)
        return reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Documento no encontrado"));
      const permiso = await autorizar(req.actor, {
        permiso: ["documentos", "ver"],
        expedienteId: doc.expedienteId,
      });
      if (!permiso.ok) return reply.status(permiso.status).send(permiso.body);
      const entrada = AnalisisDocumentoRequestSchema.safeParse(req.body);
      if (!entrada.success || doc.tipo !== "PLAN_ESTRUCTURADO")
        return reply
          .status(400)
          .send(
            errorEnvelope(
              "VALIDACION_FALLIDA",
              "El análisis solo está habilitado para el plan estructurado y requiere opciones válidas.",
            ),
          );
      // Opt-in local: producción exige cola y supervisor de contenedores aislados.
      if (process.env.ANALISIS_DOCUMENTAL_ENABLED !== "1")
        return reply
          .status(503)
          .send(
            errorEnvelope(
              "ANALISIS_NO_DISPONIBLE",
              "El análisis documental no está habilitado en este entorno.",
            ),
          );
      const cupo = await cuota(req);
      if (!cupo.isAllowed && cupo.isExceeded)
        return reply
          .header("Retry-After", cupo.ttlInSeconds)
          .status(429)
          .send(
            errorEnvelope(
              "ANALISIS_LIMITE",
              "Se alcanzó el límite de análisis por usuario. Intenta después.",
            ),
          );
      if (activo)
        return reply
          .status(503)
          .send(
            errorEnvelope("ANALISIS_OCUPADO", "Hay otro análisis en curso. Intenta nuevamente."),
          );
      activo = true;
      try {
        const [exp] = await db
          .select()
          .from(expedientes)
          .where(eq(expedientes.id, doc.expedienteId))
          .limit(1);
        if (!exp)
          return reply.status(404).send(errorEnvelope("NO_ENCONTRADO", "Expediente no encontrado"));
        const ids = [exp.participante1Id, exp.participante2Id, exp.asesorId].filter(
          (id): id is string => !!id,
        );
        const personas = ids.length
          ? await db.select().from(usuarios).where(inArray(usuarios.id, ids))
          : [];
        const persona = (id: string | null) => personas.find((p) => p.id === id);
        const tesistas = [persona(exp.participante1Id), persona(exp.participante2Id)]
          .filter((p) => p !== undefined)
          .map((p) => ({ nombre: `${p.nombres} ${p.apellidos}`, dni: p.dni }));
        const asesor = persona(exp.asesorId);
        const resultado = await new AnalizarDocumentoUseCase().execute(
          doc,
          {
            titulo: exp.titulo,
            tesistas,
            asesor: asesor
              ? { nombre: `${asesor.nombres} ${asesor.apellidos}`, dni: asesor.dni }
              : exp.asesorNombre
                ? { nombre: exp.asesorNombre }
                : null,
            modalidad: exp.modalidad,
            programa: exp.programa,
            anoReferencia: exp.fechaSustentacion
              ? new Date(exp.fechaSustentacion).getFullYear()
              : undefined,
          },
          process.env.DOCS_VOLUME_PATH ?? "./var/data/titulacion-docs",
          entrada.data.revisionEditorial,
        );

        // Sincronizar con la tabla documentoRevisiones para que las tarjetas y badges se actualicen
        try {
          const hallazgosDb = resultado.hallazgos.map((h) => ({
            campo: h.tipo,
            mensaje: h.mensaje,
            severidad: h.severidad === "ADVERTENCIA" ? ("ADVERTENCIA" as const) : ("INFO" as const),
            ...(h.esperado
              ? { esperado: h.esperado }
              : h.sugerencia
                ? { esperado: h.sugerencia }
                : {}),
            ...(h.encontrado
              ? { encontrado: h.encontrado }
              : h.evidencia
                ? { encontrado: h.evidencia }
                : {}),
          }));

          const [existente] = await db
            .select({ id: documentoRevisiones.id })
            .from(documentoRevisiones)
            .where(eq(documentoRevisiones.documentoId, doc.id))
            .limit(1);

          if (existente) {
            await db
              .update(documentoRevisiones)
              .set({
                estado: "COMPLETADO",
                hallazgos: hallazgosDb,
                paginasAnalizadas: resultado.paginasAnalizadas.length,
                updatedAt: new Date(),
              })
              .where(eq(documentoRevisiones.id, existente.id));
          } else {
            await db.insert(documentoRevisiones).values({
              documentoId: doc.id,
              expedienteId: exp.id,
              estado: "COMPLETADO",
              hallazgos: hallazgosDb,
              paginasAnalizadas: resultado.paginasAnalizadas.length,
            });
          }
        } catch (errSync) {
          req.log.warn(errSync, "No se pudo sincronizar documentoRevisiones tras análisis manual");
        }

        return reply.send(resultado);
      } finally {
        activo = false;
      }
    },
  );
}
