ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "archivo_contenido" "bytea";--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "tamano_bytes" integer;--> statement-breakpoint
ALTER TABLE "documentos_generados" ADD COLUMN IF NOT EXISTS "archivo_contenido" "bytea";--> statement-breakpoint
ALTER TABLE "documentos_generados" ADD COLUMN IF NOT EXISTS "tamano_bytes" integer;