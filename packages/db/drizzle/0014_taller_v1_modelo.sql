CREATE TYPE "public"."estado_alerta_taller" AS ENUM('ACTIVA', 'ATENDIDA', 'DESCARTADA');--> statement-breakpoint
CREATE TYPE "public"."estado_comprobante" AS ENUM('EN_REVISION', 'VALIDADO', 'OBSERVADO');--> statement-breakpoint
CREATE TYPE "public"."estado_hito" AS ENUM('NO_HABILITADO', 'HABILITADO', 'ENTREGADO', 'APROBADO', 'OBSERVADO', 'NO_ENTREGADO');--> statement-breakpoint
CREATE TYPE "public"."estado_pension" AS ENUM('PENDIENTE', 'EN_REVISION', 'VALIDADA', 'OBSERVADA', 'VENCIDA');--> statement-breakpoint
CREATE TYPE "public"."estado_registro_ficha" AS ENUM('SIN_REVISION', 'REVISADO', 'FIRMADO');--> statement-breakpoint
CREATE TYPE "public"."estado_tesista_taller" AS ENUM('EN_TALLER', 'PLAN_APROBADO', 'ASESORIA_CERRADA', 'RETIRADO');--> statement-breakpoint
CREATE TYPE "public"."medio_pension" AS ENUM('INSCRIPCION', 'COMPROBANTE', 'PAGO_DIRECTO');--> statement-breakpoint
CREATE TYPE "public"."tipo_alerta_taller" AS ENUM('FALTAS_CONSECUTIVAS', 'PLAN_NO_PRESENTADO', 'AVANCE_INCUMPLIDO');--> statement-breakpoint
CREATE TYPE "public"."tipo_hito" AS ENUM('PLAN', 'AVANCE_1', 'AVANCE_2', 'AVANCE_3', 'AVANCE_4', 'BORRADOR_INTEGRADO', 'BORRADOR_FINAL');--> statement-breakpoint
ALTER TYPE "public"."estado_sesion" ADD VALUE 'REPROGRAMADA';--> statement-breakpoint
ALTER TYPE "public"."estado_taller" ADD VALUE 'ABIERTO_INSCRIPCIONES';--> statement-breakpoint
ALTER TYPE "public"."estado_taller" ADD VALUE 'COMPLETO';--> statement-breakpoint
ALTER TYPE "public"."estado_taller" ADD VALUE 'EN_CURSO';--> statement-breakpoint
ALTER TYPE "public"."estado_taller" ADD VALUE 'FINALIZADO';--> statement-breakpoint
CREATE TABLE "alertas_taller" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_alerta_taller" NOT NULL,
	"taller_id" uuid NOT NULL,
	"proyecto_id" uuid,
	"alumno_id" uuid,
	"hito_id" uuid,
	"estado" "estado_alerta_taller" DEFAULT 'ACTIVA' NOT NULL,
	"clave_dedupe" varchar(160) NOT NULL,
	"motivo_descarte" text,
	"resuelta_por" uuid,
	"resuelta_at" timestamp with time zone,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alertas_taller_clave_dedupe_unique" UNIQUE("clave_dedupe")
);
--> statement-breakpoint
CREATE TABLE "asesor_archivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asesor_id" uuid NOT NULL,
	"ruta" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"nombre_original" varchar(255) NOT NULL,
	"mime" varchar(128) NOT NULL,
	"bytes" integer NOT NULL,
	"eliminado_at" timestamp with time zone,
	"eliminado_por" uuid,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asesor_especialidades" (
	"asesor_id" uuid NOT NULL,
	"especialidad_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asesor_especialidades_asesor_id_especialidad_id_pk" PRIMARY KEY("asesor_id","especialidad_id")
);
--> statement-breakpoint
CREATE TABLE "asistencia_grupos" (
	"sesion_id" uuid NOT NULL,
	"grupo_horario_id" uuid NOT NULL,
	"guardado_por" uuid,
	"guardado_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asistencia_grupos_sesion_id_grupo_horario_id_pk" PRIMARY KEY("sesion_id","grupo_horario_id")
);
--> statement-breakpoint
CREATE TABLE "cierres_asesoria" (
	"proyecto_id" uuid PRIMARY KEY NOT NULL,
	"similitud_preliminar" numeric(5, 2),
	"observaciones_levantadas" boolean DEFAULT false NOT NULL,
	"informe_generado_at" timestamp with time zone,
	"informe_firmado_ruta" text,
	"informe_firmado_sha256" varchar(64),
	"cerrado_por" uuid,
	"cerrado_at" timestamp with time zone,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cierres_asesoria_similitud_ck" CHECK ("cierres_asesoria"."similitud_preliminar" is null or "cierres_asesoria"."similitud_preliminar" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "comprobantes_pension" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pension_alumno_id" uuid NOT NULL,
	"ruta" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"nombre_original" varchar(255) NOT NULL,
	"mime" varchar(128) NOT NULL,
	"bytes" integer NOT NULL,
	"estado" "estado_comprobante" DEFAULT 'EN_REVISION' NOT NULL,
	"motivo" text,
	"validado_por" uuid,
	"validado_at" timestamp with time zone,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encuesta_participaciones" (
	"taller_id" uuid NOT NULL,
	"alumno_id" uuid NOT NULL,
	"periodo" varchar(32) NOT NULL,
	CONSTRAINT "encuesta_participaciones_taller_id_alumno_id_periodo_pk" PRIMARY KEY("taller_id","alumno_id","periodo")
);
--> statement-breakpoint
CREATE TABLE "encuesta_preguntas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"texto" text NOT NULL,
	"orden" integer NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encuesta_puntajes" (
	"respuesta_id" uuid NOT NULL,
	"pregunta_id" uuid NOT NULL,
	"puntaje" integer NOT NULL,
	CONSTRAINT "encuesta_puntajes_respuesta_id_pregunta_id_pk" PRIMARY KEY("respuesta_id","pregunta_id"),
	CONSTRAINT "encuesta_puntajes_rango_ck" CHECK ("encuesta_puntajes"."puntaje" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "encuesta_respuestas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taller_id" uuid NOT NULL,
	"asesor_id" uuid NOT NULL,
	"periodo" varchar(32) NOT NULL,
	"comentario" text
);
--> statement-breakpoint
CREATE TABLE "entregas_hito" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hito_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"ruta" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"nombre_original" varchar(255) NOT NULL,
	"mime" varchar(128) NOT NULL,
	"bytes" integer NOT NULL,
	"comentario" text,
	"entregada_por" uuid NOT NULL,
	"entregada_at" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" "estado_entrega" DEFAULT 'ENTREGADA' NOT NULL,
	"observaciones" text,
	"revisada_por" uuid,
	"revisada_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "especialidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feriados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feriados_fecha_unique" UNIQUE("fecha")
);
--> statement-breakpoint
CREATE TABLE "ficha_firmas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"ruta" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"nombre_original" varchar(255) NOT NULL,
	"mime" varchar(128) NOT NULL,
	"bytes" integer NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ficha_registros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"semana" integer NOT NULL,
	"fecha" date,
	"avance_revisado" varchar(80) NOT NULL,
	"observaciones_acuerdos" text,
	"estado" "estado_registro_ficha" DEFAULT 'SIN_REVISION' NOT NULL,
	"firma_id" uuid,
	"revisado_por" uuid,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ficha_registros_semana_ck" CHECK ("ficha_registros"."semana" in (2, 4, 6, 8, 10, 12))
);
--> statement-breakpoint
CREATE TABLE "grupos_horario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taller_id" uuid NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"hora_inicio" varchar(5) NOT NULL,
	"hora_fin" varchar(5) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hitos_proyecto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"tipo" "tipo_hito" NOT NULL,
	"semana" integer NOT NULL,
	"fecha_limite" date NOT NULL,
	"estado" "estado_hito" DEFAULT 'NO_HABILITADO' NOT NULL,
	"habilitado_por" uuid,
	"habilitado_at" timestamp with time zone,
	"aprobado_por" uuid,
	"aprobado_at" timestamp with time zone,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parametros_taller" (
	"clave" varchar(64) PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"descripcion" text,
	"actualizado_por" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pensiones_alumno" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pension_taller_id" uuid NOT NULL,
	"alumno_id" uuid NOT NULL,
	"estado" "estado_pension" DEFAULT 'PENDIENTE' NOT NULL,
	"medio" "medio_pension",
	"observacion" text,
	"validada_por" uuid,
	"validada_at" timestamp with time zone,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pensiones_taller" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taller_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"semana" integer,
	"fecha" date,
	"monto" integer NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pensiones_taller_numero_ck" CHECK ("pensiones_taller"."numero" between 1 and 3),
	CONSTRAINT "pensiones_taller_monto_ck" CHECK ("pensiones_taller"."monto" > 0)
);
--> statement-breakpoint
CREATE TABLE "plan_institucional" (
	"semana" integer PRIMARY KEY NOT NULL,
	"contenido" text NOT NULL,
	"entregable" text,
	"es_hito" boolean DEFAULT false NOT NULL,
	"fijo" boolean DEFAULT false NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_institucional_semana_ck" CHECK ("plan_institucional"."semana" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "plan_taller" (
	"taller_id" uuid NOT NULL,
	"semana" integer NOT NULL,
	"contenido" text NOT NULL,
	"entregable" text,
	"indicaciones" text,
	"es_hito" boolean DEFAULT false NOT NULL,
	"fijo" boolean DEFAULT false NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_taller_taller_id_semana_pk" PRIMARY KEY("taller_id","semana"),
	CONSTRAINT "plan_taller_semana_ck" CHECK ("plan_taller"."semana" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "proyecto_tesistas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"alumno_id" uuid NOT NULL,
	"estado" "estado_tesista_taller" DEFAULT 'EN_TALLER' NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proyectos_taller" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taller_id" uuid NOT NULL,
	"codigo" varchar(8) NOT NULL,
	"grupo_horario_id" uuid,
	"titulo" text,
	"expediente_id" uuid,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retiros_taller" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proyecto_tesista_id" uuid NOT NULL,
	"alerta_id" uuid,
	"motivo" text NOT NULL,
	"fecha" date NOT NULL,
	"registrado_por" uuid NOT NULL,
	"creado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retiros_taller_proyecto_tesista_id_unique" UNIQUE("proyecto_tesista_id")
);
--> statement-breakpoint
CREATE TABLE "taller_dias" (
	"taller_id" uuid NOT NULL,
	"dia" integer NOT NULL,
	"hora_inicio" varchar(5) NOT NULL,
	"hora_fin" varchar(5) NOT NULL,
	CONSTRAINT "taller_dias_taller_id_dia_pk" PRIMARY KEY("taller_id","dia")
);
--> statement-breakpoint
DROP INDEX "taller_sesiones_taller_idx";--> statement-breakpoint
ALTER TABLE "auditoria_taller" ADD COLUMN "en_nombre_de_id" uuid;--> statement-breakpoint
ALTER TABLE "taller_asistencias" ADD COLUMN "registrada_por" uuid;--> statement-breakpoint
ALTER TABLE "taller_asistencias" ADD COLUMN "actualizada_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "taller_sesiones" ADD COLUMN "fecha_original" date;--> statement-breakpoint
ALTER TABLE "taller_sesiones" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "fecha_fin" date;--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "numero_sesiones" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "cupo_proyectos" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "enlace_sabado" varchar(512);--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "enlace_domingo" varchar(512);--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "motivo_cancelacion" text;--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "creado_por" uuid;--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "alertas_taller" ADD CONSTRAINT "alertas_taller_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_taller" ADD CONSTRAINT "alertas_taller_proyecto_id_proyectos_taller_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyectos_taller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_taller" ADD CONSTRAINT "alertas_taller_alumno_id_usuarios_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_taller" ADD CONSTRAINT "alertas_taller_hito_id_hitos_proyecto_id_fk" FOREIGN KEY ("hito_id") REFERENCES "public"."hitos_proyecto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_taller" ADD CONSTRAINT "alertas_taller_resuelta_por_usuarios_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas_taller" ADD CONSTRAINT "alertas_taller_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesor_archivos" ADD CONSTRAINT "asesor_archivos_asesor_id_usuarios_id_fk" FOREIGN KEY ("asesor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesor_archivos" ADD CONSTRAINT "asesor_archivos_eliminado_por_usuarios_id_fk" FOREIGN KEY ("eliminado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesor_archivos" ADD CONSTRAINT "asesor_archivos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesor_especialidades" ADD CONSTRAINT "asesor_especialidades_asesor_id_usuarios_id_fk" FOREIGN KEY ("asesor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asesor_especialidades" ADD CONSTRAINT "asesor_especialidades_especialidad_id_especialidades_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencia_grupos" ADD CONSTRAINT "asistencia_grupos_sesion_id_taller_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."taller_sesiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencia_grupos" ADD CONSTRAINT "asistencia_grupos_grupo_horario_id_grupos_horario_id_fk" FOREIGN KEY ("grupo_horario_id") REFERENCES "public"."grupos_horario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asistencia_grupos" ADD CONSTRAINT "asistencia_grupos_guardado_por_usuarios_id_fk" FOREIGN KEY ("guardado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierres_asesoria" ADD CONSTRAINT "cierres_asesoria_proyecto_id_proyectos_taller_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyectos_taller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierres_asesoria" ADD CONSTRAINT "cierres_asesoria_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierres_asesoria" ADD CONSTRAINT "cierres_asesoria_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_pension" ADD CONSTRAINT "comprobantes_pension_pension_alumno_id_pensiones_alumno_id_fk" FOREIGN KEY ("pension_alumno_id") REFERENCES "public"."pensiones_alumno"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_pension" ADD CONSTRAINT "comprobantes_pension_validado_por_usuarios_id_fk" FOREIGN KEY ("validado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes_pension" ADD CONSTRAINT "comprobantes_pension_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuesta_participaciones" ADD CONSTRAINT "encuesta_participaciones_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuesta_participaciones" ADD CONSTRAINT "encuesta_participaciones_alumno_id_usuarios_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuesta_preguntas" ADD CONSTRAINT "encuesta_preguntas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuesta_puntajes" ADD CONSTRAINT "encuesta_puntajes_respuesta_id_encuesta_respuestas_id_fk" FOREIGN KEY ("respuesta_id") REFERENCES "public"."encuesta_respuestas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuesta_puntajes" ADD CONSTRAINT "encuesta_puntajes_pregunta_id_encuesta_preguntas_id_fk" FOREIGN KEY ("pregunta_id") REFERENCES "public"."encuesta_preguntas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuesta_respuestas" ADD CONSTRAINT "encuesta_respuestas_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encuesta_respuestas" ADD CONSTRAINT "encuesta_respuestas_asesor_id_usuarios_id_fk" FOREIGN KEY ("asesor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_hito" ADD CONSTRAINT "entregas_hito_hito_id_hitos_proyecto_id_fk" FOREIGN KEY ("hito_id") REFERENCES "public"."hitos_proyecto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_hito" ADD CONSTRAINT "entregas_hito_entregada_por_usuarios_id_fk" FOREIGN KEY ("entregada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_hito" ADD CONSTRAINT "entregas_hito_revisada_por_usuarios_id_fk" FOREIGN KEY ("revisada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "especialidades" ADD CONSTRAINT "especialidades_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feriados" ADD CONSTRAINT "feriados_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_firmas" ADD CONSTRAINT "ficha_firmas_proyecto_id_proyectos_taller_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyectos_taller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_firmas" ADD CONSTRAINT "ficha_firmas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_registros" ADD CONSTRAINT "ficha_registros_proyecto_id_proyectos_taller_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyectos_taller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_registros" ADD CONSTRAINT "ficha_registros_firma_id_ficha_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."ficha_firmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_registros" ADD CONSTRAINT "ficha_registros_revisado_por_usuarios_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ficha_registros" ADD CONSTRAINT "ficha_registros_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_horario" ADD CONSTRAINT "grupos_horario_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_horario" ADD CONSTRAINT "grupos_horario_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hitos_proyecto" ADD CONSTRAINT "hitos_proyecto_proyecto_id_proyectos_taller_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyectos_taller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hitos_proyecto" ADD CONSTRAINT "hitos_proyecto_habilitado_por_usuarios_id_fk" FOREIGN KEY ("habilitado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hitos_proyecto" ADD CONSTRAINT "hitos_proyecto_aprobado_por_usuarios_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hitos_proyecto" ADD CONSTRAINT "hitos_proyecto_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parametros_taller" ADD CONSTRAINT "parametros_taller_actualizado_por_usuarios_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pensiones_alumno" ADD CONSTRAINT "pensiones_alumno_pension_taller_id_pensiones_taller_id_fk" FOREIGN KEY ("pension_taller_id") REFERENCES "public"."pensiones_taller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pensiones_alumno" ADD CONSTRAINT "pensiones_alumno_alumno_id_usuarios_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pensiones_alumno" ADD CONSTRAINT "pensiones_alumno_validada_por_usuarios_id_fk" FOREIGN KEY ("validada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pensiones_alumno" ADD CONSTRAINT "pensiones_alumno_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pensiones_taller" ADD CONSTRAINT "pensiones_taller_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pensiones_taller" ADD CONSTRAINT "pensiones_taller_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_institucional" ADD CONSTRAINT "plan_institucional_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_taller" ADD CONSTRAINT "plan_taller_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_taller" ADD CONSTRAINT "plan_taller_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyecto_tesistas" ADD CONSTRAINT "proyecto_tesistas_proyecto_id_proyectos_taller_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyectos_taller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyecto_tesistas" ADD CONSTRAINT "proyecto_tesistas_alumno_id_usuarios_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyecto_tesistas" ADD CONSTRAINT "proyecto_tesistas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyectos_taller" ADD CONSTRAINT "proyectos_taller_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyectos_taller" ADD CONSTRAINT "proyectos_taller_grupo_horario_id_grupos_horario_id_fk" FOREIGN KEY ("grupo_horario_id") REFERENCES "public"."grupos_horario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyectos_taller" ADD CONSTRAINT "proyectos_taller_expediente_id_expedientes_id_fk" FOREIGN KEY ("expediente_id") REFERENCES "public"."expedientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyectos_taller" ADD CONSTRAINT "proyectos_taller_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiros_taller" ADD CONSTRAINT "retiros_taller_proyecto_tesista_id_proyecto_tesistas_id_fk" FOREIGN KEY ("proyecto_tesista_id") REFERENCES "public"."proyecto_tesistas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiros_taller" ADD CONSTRAINT "retiros_taller_alerta_id_alertas_taller_id_fk" FOREIGN KEY ("alerta_id") REFERENCES "public"."alertas_taller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiros_taller" ADD CONSTRAINT "retiros_taller_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiros_taller" ADD CONSTRAINT "retiros_taller_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taller_dias" ADD CONSTRAINT "taller_dias_taller_id_talleres_id_fk" FOREIGN KEY ("taller_id") REFERENCES "public"."talleres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_taller_estado_idx" ON "alertas_taller" USING btree ("taller_id","estado");--> statement-breakpoint
CREATE INDEX "asesor_archivos_asesor_idx" ON "asesor_archivos" USING btree ("asesor_id");--> statement-breakpoint
CREATE INDEX "comprobantes_pension_pension_idx" ON "comprobantes_pension" USING btree ("pension_alumno_id");--> statement-breakpoint
CREATE INDEX "encuesta_respuestas_asesor_idx" ON "encuesta_respuestas" USING btree ("asesor_id","periodo");--> statement-breakpoint
CREATE UNIQUE INDEX "entregas_hito_version_uq" ON "entregas_hito" USING btree ("hito_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "especialidades_nombre_uq" ON "especialidades" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "ficha_registros_semana_uq" ON "ficha_registros" USING btree ("proyecto_id","semana");--> statement-breakpoint
CREATE UNIQUE INDEX "grupos_horario_taller_nombre_uq" ON "grupos_horario" USING btree ("taller_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "hitos_proyecto_tipo_uq" ON "hitos_proyecto" USING btree ("proyecto_id","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "pensiones_alumno_uq" ON "pensiones_alumno" USING btree ("pension_taller_id","alumno_id");--> statement-breakpoint
CREATE INDEX "pensiones_alumno_alumno_idx" ON "pensiones_alumno" USING btree ("alumno_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pensiones_taller_numero_uq" ON "pensiones_taller" USING btree ("taller_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "proyecto_tesistas_proyecto_alumno_uq" ON "proyecto_tesistas" USING btree ("proyecto_id","alumno_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proyecto_tesistas_alumno_activo_uq" ON "proyecto_tesistas" USING btree ("alumno_id") WHERE "proyecto_tesistas"."estado" in ('EN_TALLER', 'PLAN_APROBADO');--> statement-breakpoint
CREATE UNIQUE INDEX "proyectos_taller_codigo_uq" ON "proyectos_taller" USING btree ("taller_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "proyectos_taller_expediente_uq" ON "proyectos_taller" USING btree ("expediente_id");--> statement-breakpoint
ALTER TABLE "auditoria_taller" ADD CONSTRAINT "auditoria_taller_en_nombre_de_id_usuarios_id_fk" FOREIGN KEY ("en_nombre_de_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taller_asistencias" ADD CONSTRAINT "taller_asistencias_registrada_por_usuarios_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talleres" ADD CONSTRAINT "talleres_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "taller_sesiones_taller_nro_uq" ON "taller_sesiones" USING btree ("taller_id","nro");--> statement-breakpoint
CREATE UNIQUE INDEX "talleres_nombre_uq" ON "talleres" USING btree ("nombre");