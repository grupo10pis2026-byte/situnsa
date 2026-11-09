-- Corte 3.3 (spec v1.0 §6): el taller pasa a los estados v1.0 y se retiran
-- ACTIVO y CERRADO. La columna pasa por texto: así los valores se convierten
-- sin usar valores de enum agregados en esta misma transacción (Postgres no
-- lo permite) y el tipo se recrea limpio.
ALTER TABLE "talleres" ALTER COLUMN "estado" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "talleres" ALTER COLUMN "estado" SET DEFAULT 'ABIERTO_INSCRIPCIONES'::text;--> statement-breakpoint
-- ACTIVO: en curso si ya empezó (o tiene sesiones realizadas); si no, abierto.
UPDATE "talleres" SET "estado" = CASE
  WHEN "fecha_inicio" IS NOT NULL AND "fecha_inicio" <= (now() AT TIME ZONE 'America/Lima')::date THEN 'EN_CURSO'
  WHEN EXISTS (
    SELECT 1 FROM "taller_sesiones" s WHERE s."taller_id" = "talleres"."id" AND s."estado" = 'REALIZADA'
  ) THEN 'EN_CURSO'
  ELSE 'ABIERTO_INSCRIPCIONES'
END
WHERE "estado" = 'ACTIVO';--> statement-breakpoint
UPDATE "talleres" SET "estado" = 'FINALIZADO' WHERE "estado" = 'CERRADO';--> statement-breakpoint
DROP TYPE "public"."estado_taller";--> statement-breakpoint
CREATE TYPE "public"."estado_taller" AS ENUM('ABIERTO_INSCRIPCIONES', 'COMPLETO', 'EN_CURSO', 'FINALIZADO', 'CANCELADO');--> statement-breakpoint
ALTER TABLE "talleres" ALTER COLUMN "estado" SET DEFAULT 'ABIERTO_INSCRIPCIONES'::"public"."estado_taller";--> statement-breakpoint
ALTER TABLE "talleres" ALTER COLUMN "estado" SET DATA TYPE "public"."estado_taller" USING "estado"::"public"."estado_taller";--> statement-breakpoint
-- Datos v1.0 de los talleres creados con el modelo anterior.
UPDATE "talleres" SET "cupo_proyectos" = "cupo_max" WHERE "cupo_max" IS NOT NULL AND "cupo_max" >= 1;--> statement-breakpoint
UPDATE "talleres" SET "enlace_sabado" = "enlace", "enlace_domingo" = "enlace" WHERE "enlace" IS NOT NULL;--> statement-breakpoint
UPDATE "talleres" t SET
  "fecha_fin" = s."ultima",
  "numero_sesiones" = s."total"
FROM (
  SELECT "taller_id", max("fecha") AS "ultima", count(*)::int AS "total"
  FROM "taller_sesiones" GROUP BY "taller_id"
) s
WHERE s."taller_id" = t."id" AND t."fecha_fin" IS NULL;--> statement-breakpoint
INSERT INTO "taller_dias" ("taller_id", "dia", "hora_inicio", "hora_fin")
SELECT t."id", d."dia"::int, t."hora_inicio", t."hora_fin"
FROM "talleres" t, unnest(string_to_array(t."dias_sesion", ',')) AS d("dia")
WHERE t."dias_sesion" IS NOT NULL AND t."hora_inicio" IS NOT NULL AND t."hora_fin" IS NOT NULL
  AND d."dia" ~ '^[1-7]$'
ON CONFLICT DO NOTHING;
