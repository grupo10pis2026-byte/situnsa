-- Adenda 1.2 A1: un solo enlace de reunión por taller.
-- Iguales (o solo uno) → se conserva ese. Distintos → se conserva el del sábado,
-- se guarda el del domingo como descartado y se marca para que la Secretaría lo revise.
UPDATE "talleres" SET
  "enlace_reunion" = COALESCE(NULLIF(TRIM("enlace_sabado"), ''), NULLIF(TRIM("enlace_domingo"), '')),
  "enlace_revisar" = (
    NULLIF(TRIM("enlace_sabado"), '') IS NOT NULL
    AND NULLIF(TRIM("enlace_domingo"), '') IS NOT NULL
    AND TRIM("enlace_sabado") <> TRIM("enlace_domingo")
  ),
  "enlace_descartado" = CASE
    WHEN NULLIF(TRIM("enlace_sabado"), '') IS NOT NULL
      AND NULLIF(TRIM("enlace_domingo"), '') IS NOT NULL
      AND TRIM("enlace_sabado") <> TRIM("enlace_domingo")
    THEN TRIM("enlace_domingo")
  END;
--> statement-breakpoint
-- Adenda 1.2 A2: horario por día de cada grupo existente. Para cada día del taller
-- se usa el horario del grupo si cabe en el bloque de ese día; si no, el bloque del día.
INSERT INTO "grupo_horario_dias" ("grupo_horario_id", "dia", "hora_inicio", "hora_fin")
SELECT g."id", d."dia",
  CASE WHEN d."hora_inicio" IS NULL OR (g."hora_inicio" >= d."hora_inicio" AND g."hora_fin" <= d."hora_fin")
    THEN g."hora_inicio" ELSE d."hora_inicio" END,
  CASE WHEN d."hora_inicio" IS NULL OR (g."hora_inicio" >= d."hora_inicio" AND g."hora_fin" <= d."hora_fin")
    THEN g."hora_fin" ELSE d."hora_fin" END
FROM "grupos_horario" g
JOIN "taller_dias" d ON d."taller_id" = g."taller_id"
ON CONFLICT DO NOTHING;
