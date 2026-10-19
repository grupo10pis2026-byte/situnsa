DO $$ BEGIN
    CREATE TYPE "public"."estado_drive_sync" AS ENUM('NO_APLICA', 'PENDIENTE', 'SINCRONIZADO', 'ERROR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."origen_documento" AS ENUM('WEB', 'CORREO', 'SISTEMA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "origen" "origen_documento" DEFAULT 'WEB' NOT NULL;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "origen_metadata" text;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "drive_url" text;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "drive_sync_estado" "estado_drive_sync" DEFAULT 'PENDIENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "drive_sync_intentos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "drive_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "drive_error" text;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "archivo_contenido" "bytea";--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN IF NOT EXISTS "tamano_bytes" integer;--> statement-breakpoint
ALTER TABLE "documentos_generados" ADD COLUMN IF NOT EXISTS "archivo_contenido" "bytea";--> statement-breakpoint
ALTER TABLE "documentos_generados" ADD COLUMN IF NOT EXISTS "tamano_bytes" integer;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN IF NOT EXISTS "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN IF NOT EXISTS "drive_folder_url" text;
