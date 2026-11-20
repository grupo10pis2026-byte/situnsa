CREATE TABLE "formatos_catalogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(64) NOT NULL,
	"variante" smallint NOT NULL,
	"etapa" varchar(8) NOT NULL,
	"nombre" text,
	"agregado" boolean DEFAULT false NOT NULL,
	"archivado" boolean DEFAULT false NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formatos_catalogo_tipo_variante" UNIQUE("tipo","variante")
);
--> statement-breakpoint
ALTER TABLE "formatos_catalogo" ADD CONSTRAINT "formatos_catalogo_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;