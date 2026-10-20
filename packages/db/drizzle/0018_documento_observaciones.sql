CREATE TABLE IF NOT EXISTS "documento_observaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expediente_id" uuid NOT NULL,
	"tipo_documento" varchar(64) NOT NULL,
	"documento_id" uuid,
	"texto" text NOT NULL,
	"autor_id" uuid,
	"autor_nombre" text,
	"autor_rol" varchar(32),
	"estado" varchar(32) DEFAULT 'PENDIENTE' NOT NULL,
	"resuelto_at" timestamp with time zone,
	"resuelto_por_id" uuid,
	"resuelto_por_nombre" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "documento_observaciones" ADD CONSTRAINT "documento_observaciones_expediente_id_fk" FOREIGN KEY ("expediente_id") REFERENCES "public"."expedientes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "documento_observaciones" ADD CONSTRAINT "documento_observaciones_documento_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "documento_observaciones" ADD CONSTRAINT "documento_observaciones_autor_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "documento_observaciones" ADD CONSTRAINT "documento_observaciones_resuelto_por_id_fk" FOREIGN KEY ("resuelto_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
