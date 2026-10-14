CREATE TYPE "public"."estado_revision_documento" AS ENUM('PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'FALLIDO');--> statement-breakpoint
CREATE TABLE "documento_revisiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documento_id" uuid NOT NULL,
	"expediente_id" uuid NOT NULL,
	"estado" "estado_revision_documento" DEFAULT 'PENDIENTE' NOT NULL,
	"hallazgos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paginas_analizadas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documento_revisiones" ADD CONSTRAINT "documento_revisiones_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_revisiones" ADD CONSTRAINT "documento_revisiones_expediente_id_expedientes_id_fk" FOREIGN KEY ("expediente_id") REFERENCES "public"."expedientes"("id") ON DELETE cascade ON UPDATE no action;