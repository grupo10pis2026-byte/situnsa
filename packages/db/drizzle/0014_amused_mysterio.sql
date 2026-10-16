ALTER TABLE "documentos" ADD COLUMN "archivo_contenido" "bytea";--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "tamano_bytes" integer;--> statement-breakpoint
ALTER TABLE "documentos_generados" ADD COLUMN "archivo_contenido" "bytea";--> statement-breakpoint
ALTER TABLE "documentos_generados" ADD COLUMN "tamano_bytes" integer;