import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  estadoAlertaTallerEnum,
  estadoComprobanteEnum,
  estadoEntregaEnum,
  estadoHitoEnum,
  estadoPensionEnum,
  estadoRegistroFichaEnum,
  estadoTesistaTallerEnum,
  medioPensionEnum,
  modalidadEnum,
  tipoAlertaTallerEnum,
  tipoHitoEnum,
} from "./enums.js";
import { expedientes } from "./expedientes.js";
import { tallerSesiones } from "./taller-operativa.js";
import { talleres } from "./talleres.js";
import { usuarios } from "./usuarios.js";

/**
 * Módulo Gestión del Taller de Tesis — modelo v1.0 (spec §7).
 *
 * Reglas transversales (§15): no se borra nada con historial (se anula o
 * desactiva); los archivos guardan ruta + sha256 bajo DOCS_VOLUME_PATH.
 * Lo que depende del estado de otra tabla (un asesor = un taller vigente)
 * lo valida el use-case dentro de la transacción.
 */

const creado = {
  creadoPor: uuid("creado_por").references(() => usuarios.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

const archivo = {
  ruta: text("ruta").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  nombreOriginal: varchar("nombre_original", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 128 }).notNull(),
  bytes: integer("bytes").notNull(),
};

// ── Configuración (P16) ────────────────────────────────────────────────

/** Feriados que el calendario del taller omite (§5). */
export const feriados = pgTable("feriados", {
  id: uuid("id").primaryKey().defaultRandom(),
  fecha: date("fecha").notNull().unique(),
  nombre: varchar("nombre", { length: 160 }).notNull(),
  activo: boolean("activo").notNull().default(true),
  ...creado,
});

/** Parámetros "POR CONFIRMAR" (@pis/domain PARAMETROS_TALLER_DEFECTO). */
export const parametrosTaller = pgTable("parametros_taller", {
  clave: varchar("clave", { length: 64 }).primaryKey(),
  valor: jsonb("valor").notNull(),
  descripcion: text("descripcion"),
  actualizadoPor: uuid("actualizado_por").references(() => usuarios.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Plan institucional de 12 semanas: lo mantiene el Administrador. */
export const planInstitucional = pgTable(
  "plan_institucional",
  {
    semana: integer("semana").primaryKey(),
    contenido: text("contenido").notNull(),
    entregable: text("entregable"),
    esHito: boolean("es_hito").notNull().default(false),
    /** Hito fijo (semanas 2 y 12): no se prorroga. */
    fijo: boolean("fijo").notNull().default(false),
    ...creado,
  },
  (t) => [check("plan_institucional_semana_ck", sql`${t.semana} between 1 and 12`)],
);

// ── Asesores (P10, P15) ────────────────────────────────────────────────

/** Catálogo ampliable de especialidades de los asesores. */
export const especialidades = pgTable(
  "especialidades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    activa: boolean("activa").notNull().default(true),
    ...creado,
  },
  (t) => [uniqueIndex("especialidades_nombre_uq").on(sql`lower(${t.nombre})`)],
);

export const asesorEspecialidades = pgTable(
  "asesor_especialidades",
  {
    asesorId: uuid("asesor_id")
      .notNull()
      .references(() => usuarios.id),
    especialidadId: uuid("especialidad_id")
      .notNull()
      .references(() => especialidades.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.asesorId, t.especialidadId] })],
);

/** CV y otros archivos del asesor. "Eliminar" = marcar `eliminado_at`. */
export const asesorArchivos = pgTable(
  "asesor_archivos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asesorId: uuid("asesor_id")
      .notNull()
      .references(() => usuarios.id),
    ...archivo,
    eliminadoAt: timestamp("eliminado_at", { withTimezone: true }),
    eliminadoPor: uuid("eliminado_por").references(() => usuarios.id),
    ...creado,
  },
  (t) => [index("asesor_archivos_asesor_idx").on(t.asesorId)],
);

// ── Estructura del taller (P3, P5) ─────────────────────────────────────

/** Grupo de horario: lo crea el asesor dentro de su taller. */
export const gruposHorario = pgTable(
  "grupos_horario",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    nombre: varchar("nombre", { length: 80 }).notNull(),
    horaInicio: varchar("hora_inicio", { length: 5 }).notNull(),
    horaFin: varchar("hora_fin", { length: 5 }).notNull(),
    /** (propuesta) Se elimina solo sin proyectos: se desactiva. */
    activo: boolean("activo").notNull().default(true),
    ...creado,
  },
  (t) => [uniqueIndex("grupos_horario_taller_nombre_uq").on(t.tallerId, t.nombre)],
);

/** Proyecto: cuenta 1 en el cupo; 1 o 2 tesistas. */
export const proyectosTaller = pgTable(
  "proyectos_taller",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    /** Correlativo por taller: P-01, P-02… */
    codigo: varchar("codigo", { length: 8 }).notNull(),
    grupoHorarioId: uuid("grupo_horario_id").references(() => gruposHorario.id),
    titulo: text("titulo"),
    /** Programa (segunda especialidad) y modalidad: los pide el expediente al aprobar el plan. */
    programa: varchar("programa", { length: 160 }),
    modalidad: modalidadEnum("modalidad").notNull().default("TESIS"),
    /** Nulo hasta aprobar el plan (D3 crea el SET). */
    expedienteId: uuid("expediente_id").references(() => expedientes.id),
    ...creado,
  },
  (t) => [
    uniqueIndex("proyectos_taller_codigo_uq").on(t.tallerId, t.codigo),
    uniqueIndex("proyectos_taller_expediente_uq").on(t.expedienteId),
  ],
);

export const proyectoTesistas = pgTable(
  "proyecto_tesistas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proyectoId: uuid("proyecto_id")
      .notNull()
      .references(() => proyectosTaller.id),
    alumnoId: uuid("alumno_id")
      .notNull()
      .references(() => usuarios.id),
    /** 1 = titular, 2 = segundo tesista (orden estable en pantallas y documentos). */
    orden: integer("orden").notNull().default(1),
    estado: estadoTesistaTallerEnum("estado").notNull().default("EN_TALLER"),
    ...creado,
  },
  (t) => [
    uniqueIndex("proyecto_tesistas_proyecto_alumno_uq").on(t.proyectoId, t.alumnoId),
    // §3 Un alumno está en un solo taller activo (EN_TALLER o PLAN_APROBADO).
    uniqueIndex("proyecto_tesistas_alumno_activo_uq")
      .on(t.alumnoId)
      .where(sql`${t.estado} in ('EN_TALLER', 'PLAN_APROBADO')`),
  ],
);

/** P4: qué grupos ya guardaron la asistencia de una sesión. */
export const asistenciaGrupos = pgTable(
  "asistencia_grupos",
  {
    sesionId: uuid("sesion_id")
      .notNull()
      .references(() => tallerSesiones.id),
    grupoHorarioId: uuid("grupo_horario_id")
      .notNull()
      .references(() => gruposHorario.id),
    guardadoPor: uuid("guardado_por").references(() => usuarios.id),
    guardadoAt: timestamp("guardado_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.sesionId, t.grupoHorarioId] })],
);

// ── Plan e hitos (P6, P6b, P7) ─────────────────────────────────────────

/** Copia del plan institucional al crear el taller; el asesor edita contenido e indicaciones. */
export const planTaller = pgTable(
  "plan_taller",
  {
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    semana: integer("semana").notNull(),
    contenido: text("contenido").notNull(),
    /** Fijo: copiado del plan institucional, no lo edita el asesor. */
    entregable: text("entregable"),
    indicaciones: text("indicaciones"),
    esHito: boolean("es_hito").notNull().default(false),
    fijo: boolean("fijo").notNull().default(false),
    ...creado,
  },
  (t) => [
    primaryKey({ columns: [t.tallerId, t.semana] }),
    check("plan_taller_semana_ck", sql`${t.semana} between 1 and 12`),
  ],
);

export const hitosProyecto = pgTable(
  "hitos_proyecto",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proyectoId: uuid("proyecto_id")
      .notNull()
      .references(() => proyectosTaller.id),
    tipo: tipoHitoEnum("tipo").notNull(),
    semana: integer("semana").notNull(),
    fechaLimite: date("fecha_limite").notNull(),
    estado: estadoHitoEnum("estado").notNull().default("NO_HABILITADO"),
    habilitadoPor: uuid("habilitado_por").references(() => usuarios.id),
    habilitadoAt: timestamp("habilitado_at", { withTimezone: true }),
    aprobadoPor: uuid("aprobado_por").references(() => usuarios.id),
    aprobadoAt: timestamp("aprobado_at", { withTimezone: true }),
    ...creado,
  },
  (t) => [uniqueIndex("hitos_proyecto_tipo_uq").on(t.proyectoId, t.tipo)],
);

/** Versiones de cada hito: correlativas, nunca se editan ni se eliminan. */
export const entregasHito = pgTable(
  "entregas_hito",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hitoId: uuid("hito_id")
      .notNull()
      .references(() => hitosProyecto.id),
    version: integer("version").notNull(),
    ...archivo,
    comentario: text("comentario"),
    entregadaPor: uuid("entregada_por")
      .notNull()
      .references(() => usuarios.id),
    entregadaAt: timestamp("entregada_at", { withTimezone: true }).defaultNow().notNull(),
    estado: estadoEntregaEnum("estado").notNull().default("ENTREGADA"),
    observaciones: text("observaciones"),
    revisadaPor: uuid("revisada_por").references(() => usuarios.id),
    revisadaAt: timestamp("revisada_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("entregas_hito_version_uq").on(t.hitoId, t.version)],
);

// ── Ficha de Control y cierre (P11, P13) ───────────────────────────────

/** PDF escaneado de la ficha firmada (Anexo 1); cubre una o más filas. */
export const fichaFirmas = pgTable("ficha_firmas", {
  id: uuid("id").primaryKey().defaultRandom(),
  proyectoId: uuid("proyecto_id")
    .notNull()
    .references(() => proyectosTaller.id),
  ...archivo,
  ...creado,
});

export const fichaRegistros = pgTable(
  "ficha_registros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proyectoId: uuid("proyecto_id")
      .notNull()
      .references(() => proyectosTaller.id),
    semana: integer("semana").notNull(),
    fecha: date("fecha"),
    avanceRevisado: varchar("avance_revisado", { length: 80 }).notNull(),
    observacionesAcuerdos: text("observaciones_acuerdos"),
    estado: estadoRegistroFichaEnum("estado").notNull().default("SIN_REVISION"),
    firmaId: uuid("firma_id").references(() => fichaFirmas.id),
    revisadoPor: uuid("revisado_por").references(() => usuarios.id),
    ...creado,
  },
  (t) => [
    uniqueIndex("ficha_registros_semana_uq").on(t.proyectoId, t.semana),
    check("ficha_registros_semana_ck", sql`${t.semana} in (2, 4, 6, 8, 10, 12)`),
  ],
);

/** P13: datos del cierre de asesoría e Informe de Conformidad (Anexo 21). */
export const cierresAsesoria = pgTable(
  "cierres_asesoria",
  {
    proyectoId: uuid("proyecto_id")
      .primaryKey()
      .references(() => proyectosTaller.id),
    similitudPreliminar: numeric("similitud_preliminar", { precision: 5, scale: 2 }),
    observacionesLevantadas: boolean("observaciones_levantadas").notNull().default(false),
    informeGeneradoAt: timestamp("informe_generado_at", { withTimezone: true }),
    informeFirmadoRuta: text("informe_firmado_ruta"),
    informeFirmadoSha256: varchar("informe_firmado_sha256", { length: 64 }),
    cerradoPor: uuid("cerrado_por").references(() => usuarios.id),
    cerradoAt: timestamp("cerrado_at", { withTimezone: true }),
    ...creado,
  },
  (t) => [
    check(
      "cierres_asesoria_similitud_ck",
      sql`${t.similitudPreliminar} is null or ${t.similitudPreliminar} between 0 and 100`,
    ),
  ],
);

// ── Pensiones (P2, P8, P9) ─────────────────────────────────────────────

/** Las 3 pensiones del taller: la 1.ª sin fecha ("al inscribirse"). */
export const pensionesTaller = pgTable(
  "pensiones_taller",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    numero: integer("numero").notNull(),
    semana: integer("semana"),
    fecha: date("fecha"),
    /** Soles enteros (convención del repo: sin decimales). */
    monto: integer("monto").notNull(),
    ...creado,
  },
  (t) => [
    uniqueIndex("pensiones_taller_numero_uq").on(t.tallerId, t.numero),
    check("pensiones_taller_numero_ck", sql`${t.numero} between 1 and 3`),
    check("pensiones_taller_monto_ck", sql`${t.monto} > 0`),
  ],
);

/** Pensión de cada alumno (individual aun con dos tesistas). */
export const pensionesAlumno = pgTable(
  "pensiones_alumno",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pensionTallerId: uuid("pension_taller_id")
      .notNull()
      .references(() => pensionesTaller.id),
    alumnoId: uuid("alumno_id")
      .notNull()
      .references(() => usuarios.id),
    estado: estadoPensionEnum("estado").notNull().default("PENDIENTE"),
    medio: medioPensionEnum("medio"),
    /** Monto cobrado al validarse (un cambio posterior del taller no lo altera). */
    montoPagado: integer("monto_pagado"),
    observacion: text("observacion"),
    validadaPor: uuid("validada_por").references(() => usuarios.id),
    validadaAt: timestamp("validada_at", { withTimezone: true }),
    ...creado,
  },
  (t) => [
    uniqueIndex("pensiones_alumno_uq").on(t.pensionTallerId, t.alumnoId),
    index("pensiones_alumno_alumno_idx").on(t.alumnoId),
  ],
);

/** Comprobantes: varios por pensión (tras una observación se sube otro). */
export const comprobantesPension = pgTable(
  "comprobantes_pension",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pensionAlumnoId: uuid("pension_alumno_id")
      .notNull()
      .references(() => pensionesAlumno.id),
    ...archivo,
    estado: estadoComprobanteEnum("estado").notNull().default("EN_REVISION"),
    motivo: text("motivo"),
    validadoPor: uuid("validado_por").references(() => usuarios.id),
    validadoAt: timestamp("validado_at", { withTimezone: true }),
    ...creado,
  },
  (t) => [index("comprobantes_pension_pension_idx").on(t.pensionAlumnoId)],
);

// ── Alertas y retiros (P12) ────────────────────────────────────────────

export const alertasTaller = pgTable(
  "alertas_taller",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: tipoAlertaTallerEnum("tipo").notNull(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    proyectoId: uuid("proyecto_id").references(() => proyectosTaller.id),
    alumnoId: uuid("alumno_id").references(() => usuarios.id),
    hitoId: uuid("hito_id").references(() => hitosProyecto.id),
    estado: estadoAlertaTallerEnum("estado").notNull().default("ACTIVA"),
    /** Idempotencia de los procesos que detectan alertas (p. ej. "FALTAS:<alumno>:<sesion>"). */
    claveDedupe: varchar("clave_dedupe", { length: 160 }).notNull().unique(),
    motivoDescarte: text("motivo_descarte"),
    resueltaPor: uuid("resuelta_por").references(() => usuarios.id),
    resueltaAt: timestamp("resuelta_at", { withTimezone: true }),
    ...creado,
  },
  (t) => [index("alertas_taller_estado_idx").on(t.tallerId, t.estado)],
);

export const retirosTaller = pgTable("retiros_taller", {
  id: uuid("id").primaryKey().defaultRandom(),
  proyectoTesistaId: uuid("proyecto_tesista_id")
    .notNull()
    .unique()
    .references(() => proyectoTesistas.id),
  alertaId: uuid("alerta_id").references(() => alertasTaller.id),
  motivo: text("motivo").notNull(),
  fecha: date("fecha").notNull(),
  registradoPor: uuid("registrado_por")
    .notNull()
    .references(() => usuarios.id),
  ...creado,
});

// ── Encuestas anónimas (P14, P14b, §15) ────────────────────────────────

export const encuestaPreguntas = pgTable("encuesta_preguntas", {
  id: uuid("id").primaryKey().defaultRandom(),
  texto: text("texto").notNull(),
  orden: integer("orden").notNull(),
  activa: boolean("activa").notNull().default(true),
  ...creado,
});

/**
 * Respuesta anónima: sin alumno ni marca de tiempo (una hora exacta se
 * podría cruzar con `encuesta_participaciones` y revelar quién respondió).
 */
export const encuestaRespuestas = pgTable(
  "encuesta_respuestas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    asesorId: uuid("asesor_id")
      .notNull()
      .references(() => usuarios.id),
    periodo: varchar("periodo", { length: 32 }).notNull(),
    comentario: text("comentario"),
  },
  (t) => [index("encuesta_respuestas_asesor_idx").on(t.asesorId, t.periodo)],
);

export const encuestaPuntajes = pgTable(
  "encuesta_puntajes",
  {
    respuestaId: uuid("respuesta_id")
      .notNull()
      .references(() => encuestaRespuestas.id),
    preguntaId: uuid("pregunta_id")
      .notNull()
      .references(() => encuestaPreguntas.id),
    puntaje: integer("puntaje").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.respuestaId, t.preguntaId] }),
    check("encuesta_puntajes_rango_ck", sql`${t.puntaje} between 1 and 5`),
  ],
);

/** Marca "ya respondió", separada de la respuesta (una por taller y período). */
export const encuestaParticipaciones = pgTable(
  "encuesta_participaciones",
  {
    tallerId: uuid("taller_id")
      .notNull()
      .references(() => talleres.id),
    alumnoId: uuid("alumno_id")
      .notNull()
      .references(() => usuarios.id),
    periodo: varchar("periodo", { length: 32 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tallerId, t.alumnoId, t.periodo] })],
);

export type Feriado = typeof feriados.$inferSelect;
export type Especialidad = typeof especialidades.$inferSelect;
export type GrupoHorario = typeof gruposHorario.$inferSelect;
export type ProyectoTaller = typeof proyectosTaller.$inferSelect;
export type ProyectoTesista = typeof proyectoTesistas.$inferSelect;
export type PlanTallerSemana = typeof planTaller.$inferSelect;
export type HitoProyecto = typeof hitosProyecto.$inferSelect;
export type EntregaHito = typeof entregasHito.$inferSelect;
export type FichaRegistro = typeof fichaRegistros.$inferSelect;
export type PensionTaller = typeof pensionesTaller.$inferSelect;
export type PensionAlumno = typeof pensionesAlumno.$inferSelect;
export type ComprobantePension = typeof comprobantesPension.$inferSelect;
export type AlertaTaller = typeof alertasTaller.$inferSelect;
export type RetiroTaller = typeof retirosTaller.$inferSelect;
