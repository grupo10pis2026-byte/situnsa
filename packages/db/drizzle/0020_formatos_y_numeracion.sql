CREATE TABLE "importaciones_numeracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre_archivo" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"resumen" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plantillas_formato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(64) NOT NULL,
	"variante" smallint NOT NULL,
	"version" integer NOT NULL,
	"nombre_archivo" text NOT NULL,
	"ruta" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"tamano_bytes" integer NOT NULL,
	"etiquetas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"advertencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nota" text,
	"activa" boolean DEFAULT false NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plantillas_formato_tipo_variante_version" UNIQUE("tipo","variante","version")
);
--> statement-breakpoint
CREATE TABLE "registro_numeracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(16) NOT NULL,
	"clave" varchar(64) NOT NULL,
	"numero" varchar(64) NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"texto_busqueda" text DEFAULT '' NOT NULL,
	"fila" integer,
	"vigente" boolean DEFAULT true NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registro_numeracion_tipo_clave" UNIQUE("tipo","clave")
);
--> statement-breakpoint
CREATE TABLE "vinculos_numeracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(16) NOT NULL,
	"clave" varchar(64) NOT NULL,
	"expediente_id" uuid NOT NULL,
	"origen" varchar(16) DEFAULT 'MANUAL' NOT NULL,
	"vinculado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vinculos_numeracion_tipo_clave" UNIQUE("tipo","clave"),
	CONSTRAINT "vinculos_numeracion_tipo_expediente" UNIQUE("tipo","expediente_id")
);
--> statement-breakpoint
ALTER TABLE "importaciones_numeracion" ADD CONSTRAINT "importaciones_numeracion_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plantillas_formato" ADD CONSTRAINT "plantillas_formato_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vinculos_numeracion" ADD CONSTRAINT "vinculos_numeracion_expediente_id_expedientes_id_fk" FOREIGN KEY ("expediente_id") REFERENCES "public"."expedientes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vinculos_numeracion" ADD CONSTRAINT "vinculos_numeracion_vinculado_por_usuarios_id_fk" FOREIGN KEY ("vinculado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "plantillas_formato_activa_unica" ON "plantillas_formato" USING btree ("tipo","variante") WHERE "plantillas_formato"."activa" = true;
--> statement-breakpoint
CREATE INDEX "vinculos_numeracion_expediente_idx" ON "vinculos_numeracion" USING btree ("expediente_id");
