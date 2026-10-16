CREATE TYPE "public"."estado_drive_sync" AS ENUM('NO_APLICA', 'PENDIENTE', 'SINCRONIZADO', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."origen_documento" AS ENUM('WEB', 'CORREO', 'SISTEMA');--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "origen" "origen_documento" DEFAULT 'WEB' NOT NULL;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "origen_metadata" text;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "drive_url" text;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "drive_sync_estado" "estado_drive_sync" DEFAULT 'PENDIENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "drive_sync_intentos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "drive_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "drive_error" text;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN "drive_folder_id" text;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN "drive_folder_url" text;