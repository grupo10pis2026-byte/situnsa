DELETE FROM "catalogo_docs_requeridos" WHERE "tipo" = 'ANEXO_17';--> statement-breakpoint
UPDATE "documentos" SET "tipo" = 'SOLICITUD_INSCRIPCION' WHERE "tipo" = 'ANEXO_17' AND "expediente_id" NOT IN (SELECT "expediente_id" FROM "documentos" WHERE "tipo" = 'SOLICITUD_INSCRIPCION');--> statement-breakpoint
DELETE FROM "documentos" WHERE "tipo" = 'ANEXO_17';
