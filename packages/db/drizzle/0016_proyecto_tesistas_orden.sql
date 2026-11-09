ALTER TABLE "proyecto_tesistas" ADD COLUMN "orden" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Proyectos ya creados: titular = el primero registrado.
UPDATE "proyecto_tesistas" pt SET "orden" = x."n"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "proyecto_id" ORDER BY "created_at", "id") AS "n"
  FROM "proyecto_tesistas"
) x
WHERE x."id" = pt."id";
