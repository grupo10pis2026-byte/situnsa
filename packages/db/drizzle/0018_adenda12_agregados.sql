CREATE TABLE "grupo_horario_dias" (
	"grupo_horario_id" uuid NOT NULL,
	"dia" integer NOT NULL,
	"hora_inicio" varchar(5) NOT NULL,
	"hora_fin" varchar(5) NOT NULL,
	CONSTRAINT "grupo_horario_dias_grupo_horario_id_dia_pk" PRIMARY KEY("grupo_horario_id","dia")
);
--> statement-breakpoint
ALTER TABLE "taller_sesiones" ALTER COLUMN "hora_inicio" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "taller_sesiones" ALTER COLUMN "hora_fin" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "taller_dias" ALTER COLUMN "hora_inicio" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "taller_dias" ALTER COLUMN "hora_fin" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comprobantes_pension" ADD COLUMN "codigo" varchar(64);--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "enlace_reunion" varchar(512);--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "enlace_revisar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "talleres" ADD COLUMN "enlace_descartado" varchar(512);--> statement-breakpoint
ALTER TABLE "grupo_horario_dias" ADD CONSTRAINT "grupo_horario_dias_grupo_horario_id_grupos_horario_id_fk" FOREIGN KEY ("grupo_horario_id") REFERENCES "public"."grupos_horario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comprobantes_pension_codigo_uq" ON "comprobantes_pension" USING btree ("codigo") WHERE "comprobantes_pension"."codigo" is not null and "comprobantes_pension"."estado" in ('EN_REVISION', 'VALIDADO');