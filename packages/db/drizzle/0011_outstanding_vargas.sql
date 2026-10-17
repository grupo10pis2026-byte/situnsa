CREATE TYPE "public"."estado_conformidad_documento" AS ENUM('PENDIENTE', 'CONFORME', 'OBSERVADO');--> statement-breakpoint
CREATE TYPE "public"."estado_solicitud" AS ENUM('NUEVA', 'EN_REVISION', 'OBSERVADA', 'ACEPTADA', 'RECHAZADA');--> statement-breakpoint
CREATE TYPE "public"."via_ingreso" AS ENUM('REGULAR', 'TALLER');--> statement-breakpoint
CREATE TABLE "solicitud_documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"tipo" varchar(64) NOT NULL,
	"participante_orden" integer,
	"ruta" text NOT NULL,
	"nombre_original" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"peso_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"estado_conformidad" "estado_conformidad_documento" DEFAULT 'PENDIENTE' NOT NULL,
	"marcado_purga_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitud_historial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"accion" varchar(40) NOT NULL,
	"actor_id" uuid,
	"actor_dni" varchar(32),
	"ip" varchar(45),
	"detalle" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitud_participantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"orden" integer DEFAULT 1 NOT NULL,
	"nombres" text NOT NULL,
	"apellidos" text NOT NULL,
	"dni" varchar(8) NOT NULL,
	"cui" varchar(16),
	"email" varchar(255) NOT NULL,
	"telefono" varchar(20),
	"nacionalidad" varchar(64) DEFAULT 'Peruana',
	"ciudad" varchar(64),
	"direccion" text,
	"departamento" varchar(64),
	"provincia" varchar(64),
	"distrito" varchar(64),
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitud_participantes_solicitud_orden_unique" UNIQUE("solicitud_id","orden"),
	CONSTRAINT "solicitud_participantes_solicitud_dni_unique" UNIQUE("solicitud_id","dni")
);
--> statement-breakpoint
CREATE TABLE "solicitudes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(32) NOT NULL,
	"via" "via_ingreso" NOT NULL,
	"modalidad" "modalidad" NOT NULL,
	"programa" varchar(160) NOT NULL,
	"titulo" text NOT NULL,
	"anio_egreso" integer,
	"cantidad_tesistas" integer DEFAULT 1 NOT NULL,
	"estado" "estado_solicitud" DEFAULT 'NUEVA' NOT NULL,
	"responsable_asignado_id" uuid,
	"fecha_limite_subsanacion" date,
	"motivo_observacion" text,
	"motivo_rechazo" text,
	"expediente_id" uuid,
	"taller_grupo_id" uuid,
	"ip_origen" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitudes_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "tokens_subsanacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"hash" varchar(64) NOT NULL,
	"expira_at" timestamp with time zone NOT NULL,
	"usado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_subsanacion_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "solicitud_documentos" ADD CONSTRAINT "solicitud_documentos_solicitud_id_solicitudes_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitud_historial" ADD CONSTRAINT "solicitud_historial_solicitud_id_solicitudes_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitud_historial" ADD CONSTRAINT "solicitud_historial_actor_id_usuarios_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitud_participantes" ADD CONSTRAINT "solicitud_participantes_solicitud_id_solicitudes_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitud_participantes" ADD CONSTRAINT "solicitud_participantes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_responsable_asignado_id_usuarios_id_fk" FOREIGN KEY ("responsable_asignado_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_expediente_id_expedientes_id_fk" FOREIGN KEY ("expediente_id") REFERENCES "public"."expedientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_taller_grupo_id_grupos_taller_id_fk" FOREIGN KEY ("taller_grupo_id") REFERENCES "public"."grupos_taller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_subsanacion" ADD CONSTRAINT "tokens_subsanacion_solicitud_id_solicitudes_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solicitud_documentos_solicitud_idx" ON "solicitud_documentos" USING btree ("solicitud_id");--> statement-breakpoint
CREATE INDEX "solicitud_documentos_sha256_idx" ON "solicitud_documentos" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "solicitud_historial_solicitud_created_idx" ON "solicitud_historial" USING btree ("solicitud_id","created_at");--> statement-breakpoint
CREATE INDEX "solicitud_participantes_dni_idx" ON "solicitud_participantes" USING btree ("dni");--> statement-breakpoint
CREATE INDEX "solicitudes_estado_idx" ON "solicitudes" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "solicitudes_via_idx" ON "solicitudes" USING btree ("via");--> statement-breakpoint
CREATE INDEX "solicitudes_created_at_idx" ON "solicitudes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tokens_subsanacion_hash_idx" ON "tokens_subsanacion" USING btree ("hash");