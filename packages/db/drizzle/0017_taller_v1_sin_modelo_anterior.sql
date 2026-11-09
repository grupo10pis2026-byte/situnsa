-- Fase 5 (spec v1.0): se retira el modelo anterior del taller (grupos con asesor,
-- cuotas libres, fases, avances, pases y automarcado de asistencia). Datos de prueba.
DROP TABLE "cronograma_pensiones" CASCADE;--> statement-breakpoint
DROP TABLE "grupo_miembros" CASCADE;--> statement-breakpoint
DROP TABLE "grupos_taller" CASCADE;--> statement-breakpoint
DROP TABLE "pagos_taller" CASCADE;--> statement-breakpoint
DROP TABLE "taller_avances" CASCADE;--> statement-breakpoint
DROP TABLE "taller_cumplimiento" CASCADE;--> statement-breakpoint
DROP TABLE "taller_entregas" CASCADE;--> statement-breakpoint
DROP TABLE "taller_fases" CASCADE;--> statement-breakpoint
DROP TABLE "taller_pases" CASCADE;--> statement-breakpoint
ALTER TABLE "taller_sesiones" ALTER COLUMN "estado" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "taller_sesiones" ALTER COLUMN "estado" SET DEFAULT 'PROGRAMADA'::text;--> statement-breakpoint
-- La ventana de automarcado (ABIERTA) ya no existe: en v1.0 marca el asesor.
UPDATE "taller_sesiones" SET "estado" = 'PROGRAMADA' WHERE "estado" = 'ABIERTA';--> statement-breakpoint
DROP TYPE "public"."estado_sesion";--> statement-breakpoint
CREATE TYPE "public"."estado_sesion" AS ENUM('PROGRAMADA', 'REPROGRAMADA', 'REALIZADA', 'CANCELADA');--> statement-breakpoint
ALTER TABLE "taller_sesiones" ALTER COLUMN "estado" SET DEFAULT 'PROGRAMADA'::"public"."estado_sesion";--> statement-breakpoint
ALTER TABLE "taller_sesiones" ALTER COLUMN "estado" SET DATA TYPE "public"."estado_sesion" USING "estado"::"public"."estado_sesion";--> statement-breakpoint
ALTER TABLE "pensiones_alumno" ADD COLUMN "monto_pagado" integer;--> statement-breakpoint
ALTER TABLE "proyectos_taller" ADD COLUMN "programa" varchar(160);--> statement-breakpoint
ALTER TABLE "proyectos_taller" ADD COLUMN "modalidad" "modalidad" DEFAULT 'TESIS' NOT NULL;--> statement-breakpoint
ALTER TABLE "talleres" DROP COLUMN "inscritos";--> statement-breakpoint
ALTER TABLE "talleres" DROP COLUMN "dias_sesion";--> statement-breakpoint
ALTER TABLE "talleres" DROP COLUMN "hora_inicio";--> statement-breakpoint
ALTER TABLE "talleres" DROP COLUMN "hora_fin";--> statement-breakpoint
ALTER TABLE "talleres" DROP COLUMN "cupo_max";--> statement-breakpoint
ALTER TABLE "talleres" DROP COLUMN "enlace";--> statement-breakpoint
DROP TYPE "public"."estado_cumplimiento";--> statement-breakpoint
DROP TYPE "public"."estado_cuota";--> statement-breakpoint
DROP TYPE "public"."estado_grupo";