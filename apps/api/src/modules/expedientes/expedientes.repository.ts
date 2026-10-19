import type { DbExecutor } from "@pis/db";
import {
  auditoriaTransiciones,
  catalogoDocsRequeridos,
  documentos,
  documentosGenerados,
  expedientes,
  mensajes,
  subetapas,
  usuarios,
} from "@pis/db";
import {
  CHECKLIST_COMPLETO,
  type ChecklistDef,
  type ClaveSubetapa,
  esClaveSubetapa,
  etapaActualDe,
  evaluarPlazo,
  FLUJO_TITULACION,
  plantillaDe,
  type Semaforo,
  TOTAL_SUBETAPAS,
} from "@pis/domain";
import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export type EstadoLiteral =
  | "REGISTRADO"
  | "EN_PLAN"
  | "PLAN_APROBADO"
  | "EN_BORRADOR"
  | "EN_DICTAMEN"
  | "APTO_SUSTENTACION"
  | "SUSTENTADO"
  | "EN_VALIDACION"
  | "EN_APROBACION"
  | "TITULO_EMITIDO"
  | "OBSERVADO"
  | "DESAPROBADO_TRUNCO"
  | "ANULADO";

const ESTADOS: ReadonlySet<string> = new Set<EstadoLiteral>([
  "REGISTRADO",
  "EN_PLAN",
  "PLAN_APROBADO",
  "EN_BORRADOR",
  "EN_DICTAMEN",
  "APTO_SUSTENTACION",
  "SUSTENTADO",
  "EN_VALIDACION",
  "EN_APROBACION",
  "TITULO_EMITIDO",
  "OBSERVADO",
  "DESAPROBADO_TRUNCO",
  "ANULADO",
]);

function esEstado(v: unknown): v is EstadoLiteral {
  return typeof v === "string" && ESTADOS.has(v);
}

type PersonaRow = {
  id: string;
  dni: string;
  cui: string | null;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  nacionalidad: string | null;
  ciudad: string | null;
  direccion: string | null;
  grado: string | null;
  activo: boolean;
  rol: string;
  /** El participante puede iniciar sesión (tiene clave configurada). */
  accesoActivo: boolean;
};

type EstadoDocumentoLiteral = "PENDIENTE" | "CARGADO" | "OBSERVADO" | "APROBADO" | "RECHAZADO";

export interface SubetapaRow {
  id: string;
  clave: string | null;
  etapa: number;
  etapaNombre: string;
  orden: number;
  nombre: string;
  plazo: string | null;
  estado: "NO_INICIADO" | "EN_CURSO" | "FINALIZADO";
  responsable: string | null;
  inicio: string | null;
  fin: string | null;
  vencimiento: string | null;
  diasRestantes: number | null;
  vencida: boolean;
  semaforo: Semaforo | null;
}

export interface GeneradoRow {
  id: string;
  tipo: string;
  nombre: string;
  etapa: "E1" | "E2" | "E6";
  version: number;
  pendientes: string[];
  createdAt: string;
}

export interface DetalleRow {
  id: string;
  codigo: string;
  estado: EstadoLiteral;
  /** Estado al que vuelve el expediente al levantar la observación vigente. */
  observadoDesde: EstadoLiteral | null;
  modalidad: "TESIS" | "TRABAJO_ACADEMICO" | "ARTICULO";
  programa: string;
  titulo: string;
  updatedAt: string;
  participante1: PersonaRow | null;
  participante2: PersonaRow | null;
  asesor: PersonaRow | null;
  datosAdmin: Record<string, string | null>;
  checklist: Array<{
    tipo: string;
    nombre: string;
    etapa: "E1" | "E2";
    obligatorio: boolean;
    requeridoEn: string | null;
    estado: EstadoDocumentoLiteral;
    documentoId: string | null;
    version: number | null;
    updatedAt: string | null;
    faltantes: string[];
  }>;
  generados: GeneradoRow[];
  subetapas: SubetapaRow[];
  subetapaActiva: { id: string; clave: string | null; etapa: number; orden: number } | null;
  avance: {
    marcados: number;
    total: number;
    pct: number;
    etapaActual: number;
    subetapaActual: string | null;
  };
  mensajes: Array<{ id: string; texto: string; autorDni: string | null; createdAt: string }>;
  historial: Array<{
    estadoAnterior: string | null;
    estadoNuevo: string;
    actorDni: string | null;
    detalle: string | null;
    createdAt: string;
  }>;
}

const CAMPOS_ADMIN = [
  "modalidad02",
  "modalidadFinal",
  "titulo02",
  "asesorNombre",
  "nroDecreto",
  "recomendacion",
  "presidente",
  "secretario",
  "coAsesor",
  "fechaApertura",
  "fechaPresentacion",
  "nroOficio",
  "integrante",
  "presidenteE2",
  "secretarioE2",
  "suplenteE2",
  "decanal",
  "fechaSustentacion",
  "horaSustentacion",
  "lugarSustentacion",
  "modalidadVirtual",
] as const;

function toPersona(u: typeof usuarios.$inferSelect): PersonaRow {
  return {
    id: u.id,
    dni: u.dni,
    cui: u.cui,
    nombres: u.nombres,
    apellidos: u.apellidos,
    email: u.email,
    telefono: u.telefono,
    nacionalidad: u.nacionalidad,
    ciudad: u.ciudad,
    direccion: u.direccion,
    grado: u.grado,
    activo: u.activo,
    rol: u.rol,
    accesoActivo: u.passwordHash !== null,
  };
}

/** Estado de origen guardado al observar (`metadata.observadoDesde`). */
export function observadoDesdeDe(metadata: unknown): EstadoLiteral | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const v = (metadata as { observadoDesde?: unknown }).observadoDesde;
  return esEstado(v) ? v : null;
}

/**
 * Checklist vigente: catálogo en DB (editable, HU-0052) con fallback al
 * código si la tabla está vacía.
 */
export async function leerChecklist(db: DbExecutor): Promise<readonly ChecklistDef[]> {
  const rows = await db
    .select()
    .from(catalogoDocsRequeridos)
    .orderBy(asc(catalogoDocsRequeridos.etapa));
  if (rows.length === 0) return CHECKLIST_COMPLETO;
  const orden = new Map(CHECKLIST_COMPLETO.map((d, i) => [d.tipo, i]));
  return rows
    .map(
      (r): ChecklistDef => ({
        tipo: r.tipo,
        nombre: r.nombre,
        etapa: r.etapa === "E2" ? "E2" : "E1",
        obligatorio: r.obligatorio,
        requeridoEn: esClaveSubetapa(r.requeridoEn) ? r.requeridoEn : null,
      }),
    )
    .sort(
      (a, b) =>
        a.etapa.localeCompare(b.etapa) ||
        (orden.get(a.tipo) ?? Number.MAX_SAFE_INTEGER) -
          (orden.get(b.tipo) ?? Number.MAX_SAFE_INTEGER),
    );
}

export function avanceDe(
  subs: Array<{ estado: string; etapa: number; orden: number; nombre: string }>,
  estadoMacro: string,
): DetalleRow["avance"] {
  const total = subs.length > 0 ? subs.length : TOTAL_SUBETAPAS;
  const marcados = subs.filter((s) => s.estado === "FINALIZADO").length;
  const actual =
    subs.find((s) => s.estado === "EN_CURSO") ?? subs.find((s) => s.estado === "NO_INICIADO");
  return {
    marcados,
    total,
    pct: Math.round((marcados / total) * 100),
    // La etapa real es la de la subetapa en curso (el estado macro OBSERVADO
    // no dice en qué etapa se observó).
    etapaActual: actual?.etapa ?? etapaActualDe(estadoMacro),
    subetapaActual: actual ? `${actual.etapa}.${actual.orden} ${actual.nombre}` : null,
  };
}

function subetapaDTO(
  s: typeof subetapas.$inferSelect,
  nombresEtapa: ReadonlyMap<number, string>,
  ahora: Date,
): SubetapaRow {
  const plazo = s.estado === "EN_CURSO" && s.inicio ? evaluarPlazo(s.inicio, s.plazo, ahora) : null;
  return {
    id: s.id,
    clave: s.clave,
    etapa: s.etapa,
    etapaNombre: nombresEtapa.get(s.etapa) ?? `Etapa ${s.etapa}`,
    orden: s.orden,
    nombre: s.nombre,
    plazo: s.plazo,
    estado: s.estado,
    responsable: s.responsable,
    inicio: s.inicio ? s.inicio.toISOString() : null,
    fin: s.fin ? s.fin.toISOString() : null,
    vencimiento: plazo ? plazo.vencimiento.toISOString().slice(0, 10) : null,
    diasRestantes: plazo ? plazo.diasRestantes : null,
    vencida: plazo?.vencido ?? false,
    semaforo: plazo?.semaforo ?? null,
  };
}

const NOMBRES_ETAPA: ReadonlyMap<number, string> = new Map(
  FLUJO_TITULACION.map((e) => [e.numero, e.nombre]),
);

/** Lectura del detalle: expediente + personas + checklist + seguimiento + mensajes + historial. */
export async function getDetalleById(
  db: DbExecutor,
  id: string,
  ahora: Date = new Date(),
): Promise<DetalleRow | null> {
  const exp = await db.select().from(expedientes).where(eq(expedientes.id, id)).limit(1);
  const row = exp[0];
  if (!row) return null;

  const docs = await db.select().from(documentos).where(eq(documentos.expedienteId, id));
  const porTipo = new Map<string, typeof documentos.$inferSelect>();
  for (const d of docs) {
    const prev = porTipo.get(d.tipo);
    if (!prev || d.version > prev.version) porTipo.set(d.tipo, d);
  }
  const generadosRows = await db
    .select()
    .from(documentosGenerados)
    .where(eq(documentosGenerados.expedienteId, id))
    .orderBy(asc(documentosGenerados.tipo));
  const generadoPorTipo = new Map(generadosRows.map((g) => [g.tipo, g]));

  const catalogo = await leerChecklist(db);
  const checklist = catalogo.flatMap((def) => {
    if (row.participante2Id && (def.tipo === "ANEXO_01_DJ" || def.tipo === "ANEXO_02_DJ")) {
      const p1Tipo = `${def.tipo}_P1`;
      const p2Tipo = `${def.tipo}_P2`;
      const p1Def = {
        tipo: p1Tipo,
        nombre: `${def.nombre} — Participante 01`,
        etapa: def.etapa,
        obligatorio: def.obligatorio,
        requeridoEn: def.requeridoEn,
      };
      const p2Def = {
        tipo: p2Tipo,
        nombre: `${def.nombre} — Participante 02`,
        etapa: def.etapa,
        obligatorio: def.obligatorio,
        requeridoEn: def.requeridoEn,
      };
      return [p1Def, p2Def].map((d) => {
        const doc = porTipo.get(d.tipo) ?? (d.tipo.endsWith("_P1") ? porTipo.get(def.tipo) : null);
        const generado =
          generadoPorTipo.get(d.tipo) ?? (d.tipo.endsWith("_P1") ? generadoPorTipo.get(def.tipo) : null);
        const faltantes = doc
          ? []
          : [
              "Falta adjuntar el archivo",
              ...(generado?.pendientes ?? []).map((p) => `Campo pendiente en el formato: ${p}`),
            ];
        return {
          tipo: d.tipo,
          nombre: d.nombre,
          etapa: d.etapa,
          obligatorio: d.obligatorio,
          requeridoEn: d.requeridoEn,
          estado: (doc?.estado ?? "PENDIENTE") as EstadoDocumentoLiteral,
          documentoId: doc?.id ?? null,
          version: doc?.version ?? null,
          updatedAt: doc?.createdAt ? doc.createdAt.toISOString() : null,
          faltantes,
        };
      });
    }

    const doc = porTipo.get(def.tipo);
    const generado = generadoPorTipo.get(def.tipo);
    const faltantes = doc
      ? []
      : [
          "Falta adjuntar el archivo",
          ...(generado?.pendientes ?? []).map((p) => `Campo pendiente en el formato: ${p}`),
        ];
    return [
      {
        tipo: def.tipo,
        nombre: def.nombre,
        etapa: def.etapa,
        obligatorio: def.obligatorio,
        requeridoEn: def.requeridoEn,
        estado: (doc?.estado ?? "PENDIENTE") as EstadoDocumentoLiteral,
        documentoId: doc?.id ?? null,
        version: doc?.version ?? null,
        updatedAt: doc?.createdAt ? doc.createdAt.toISOString() : null,
        faltantes,
      },
    ];
  });

  const subs = await db
    .select()
    .from(subetapas)
    .where(eq(subetapas.expedienteId, id))
    .orderBy(asc(subetapas.etapa), asc(subetapas.orden));

  const msgs = await db
    .select()
    .from(mensajes)
    .where(eq(mensajes.expedienteId, id))
    .orderBy(asc(mensajes.createdAt));

  const hist = await db
    .select({
      estadoAnterior: auditoriaTransiciones.estadoAnterior,
      estadoNuevo: auditoriaTransiciones.estadoNuevo,
      actorId: auditoriaTransiciones.actorId,
      actorDni: auditoriaTransiciones.actorDni,
      detalle: auditoriaTransiciones.detalle,
      createdAt: auditoriaTransiciones.createdAt,
    })
    .from(auditoriaTransiciones)
    .where(eq(auditoriaTransiciones.expedienteId, id))
    .orderBy(asc(auditoriaTransiciones.createdAt));

  // Solo las personas que aparecen en el detalle (no toda la tabla usuarios).
  const ids = new Set<string>();
  for (const v of [row.participante1Id, row.participante2Id, row.asesorId]) if (v) ids.add(v);
  for (const m of msgs) if (m.autorId) ids.add(m.autorId);
  for (const h of hist) if (h.actorId) ids.add(h.actorId);
  const personas =
    ids.size > 0
      ? await db
          .select()
          .from(usuarios)
          .where(inArray(usuarios.id, [...ids]))
      : [];
  const porId = new Map(personas.map((p) => [p.id, toPersona(p)]));

  const datosAdmin: Record<string, string | null> = {};
  for (const k of CAMPOS_ADMIN) {
    const v: unknown = row[k];
    datosAdmin[k] =
      v instanceof Date ? v.toISOString().slice(0, 10) : ((v as string | null) ?? null);
  }

  const subetapasDTO = subs.map((s) => subetapaDTO(s, NOMBRES_ETAPA, ahora));
  const activa = subs.find((s) => s.estado === "EN_CURSO") ?? null;

  return {
    id: row.id,
    codigo: row.codigo,
    estado: row.estado as EstadoLiteral,
    observadoDesde: row.estado === "OBSERVADO" ? observadoDesdeDe(row.metadata) : null,
    modalidad: row.modalidad as DetalleRow["modalidad"],
    programa: row.programa,
    titulo: row.titulo,
    updatedAt: row.updatedAt.toISOString(),
    participante1: row.participante1Id ? (porId.get(row.participante1Id) ?? null) : null,
    participante2: row.participante2Id ? (porId.get(row.participante2Id) ?? null) : null,
    asesor: row.asesorId ? (porId.get(row.asesorId) ?? null) : null,
    datosAdmin,
    checklist,
    generados: generadosRows.map((g) => {
      const docAdjunto = porTipo.get(g.tipo);
      return {
        id: g.id,
        tipo: g.tipo,
        nombre: plantillaDe(g.tipo)?.nombre ?? g.tipo,
        etapa: (g.etapa === "E2" || g.etapa === "E6" ? g.etapa : "E1") as "E1" | "E2" | "E6",
        version: g.version,
        pendientes: g.pendientes,
        createdAt: g.createdAt.toISOString(),
        documentoId: docAdjunto?.id ?? null,
        documentoEstado: docAdjunto?.estado ?? null,
        documentoVersion: docAdjunto?.version ?? null,
      };
    }),
    subetapas: subetapasDTO,
    subetapaActiva: activa
      ? { id: activa.id, clave: activa.clave, etapa: activa.etapa, orden: activa.orden }
      : null,
    avance: avanceDe(
      subs.map((s) => ({ estado: s.estado, etapa: s.etapa, orden: s.orden, nombre: s.nombre })),
      row.estado,
    ),
    mensajes: msgs.map((m) => ({
      id: m.id,
      texto: m.texto,
      autorDni: m.autorId ? (porId.get(m.autorId)?.dni ?? null) : null,
      createdAt: m.createdAt.toISOString(),
    })),
    historial: hist.map((h) => ({
      estadoAnterior: h.estadoAnterior,
      estadoNuevo: h.estadoNuevo,
      actorDni: h.actorDni ?? (h.actorId ? (porId.get(h.actorId)?.dni ?? null) : null),
      detalle: h.detalle,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}

/** Clave de la subetapa EN_CURSO (para RN-06 en la carga del tesista). */
export async function subetapaActivaDe(
  db: DbExecutor,
  expedienteId: string,
): Promise<{ id: string; clave: ClaveSubetapa | null } | null> {
  const rows = await db
    .select({ id: subetapas.id, clave: subetapas.clave })
    .from(subetapas)
    .where(and(eq(subetapas.expedienteId, expedienteId), eq(subetapas.estado, "EN_CURSO")))
    .orderBy(asc(subetapas.etapa), asc(subetapas.orden))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, clave: esClaveSubetapa(r.clave) ? r.clave : null };
}

export interface ResumenRow {
  id: string;
  codigo: string;
  tesista: string;
  dni: string;
  programa: string;
  etapaActual: number;
  subetapaActual: string | null;
  estado: EstadoLiteral;
  avancePct: number;
  updatedAt: string;
}

/** Alcance del listado (permissions-matrix RN-06/RN-07). */
export type AlcanceListado =
  | { tipo: "TODO" }
  | { tipo: "PARTICIPANTE"; dni: string }
  | { tipo: "ASESOR"; dni: string };

/**
 * Dashboard §4: tabla con filtros + indicadores. El alcance se aplica en SQL
 * y los indicadores se calculan solo sobre lo que el actor puede ver.
 */
export async function listarExpedientes(
  db: DbExecutor,
  filtros: {
    q?: string | undefined;
    estado?: string | undefined;
    orden?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    alcance: AlcanceListado;
  },
): Promise<{
  items: ResumenRow[];
  resumen: { total: number; enCurso: number; finalizados: number; sinIniciar: number };
  total: number;
  page: number;
  limit: number;
}> {
  const p1 = alias(usuarios, "p1");
  const p2 = alias(usuarios, "p2");
  const asesor = alias(usuarios, "asesor");
  const condiciones: SQL[] = [];
  if (filtros.alcance.tipo === "PARTICIPANTE") {
    const c = or(eq(p1.dni, filtros.alcance.dni), eq(p2.dni, filtros.alcance.dni));
    if (c) condiciones.push(c);
  } else if (filtros.alcance.tipo === "ASESOR") {
    condiciones.push(eq(asesor.dni, filtros.alcance.dni));
  }
  const exps = await db
    .select({
      id: expedientes.id,
      codigo: expedientes.codigo,
      estado: expedientes.estado,
      programa: expedientes.programa,
      updatedAt: expedientes.updatedAt,
      p1Nombres: p1.nombres,
      p1Apellidos: p1.apellidos,
      p1Dni: p1.dni,
    })
    .from(expedientes)
    .leftJoin(p1, eq(expedientes.participante1Id, p1.id))
    .leftJoin(p2, eq(expedientes.participante2Id, p2.id))
    .leftJoin(asesor, eq(expedientes.asesorId, asesor.id))
    .where(condiciones.length > 0 ? and(...condiciones) : undefined)
    .orderBy(asc(expedientes.codigo));

  const ids = exps.map((e) => e.id);
  const subsRows =
    ids.length > 0
      ? await db
          .select({
            expedienteId: subetapas.expedienteId,
            estado: subetapas.estado,
            etapa: subetapas.etapa,
            orden: subetapas.orden,
            nombre: subetapas.nombre,
          })
          .from(subetapas)
          .where(inArray(subetapas.expedienteId, ids))
          .orderBy(asc(subetapas.etapa), asc(subetapas.orden))
      : [];
  const subsPorExp = new Map<string, typeof subsRows>();
  for (const s of subsRows) {
    const arr = subsPorExp.get(s.expedienteId) ?? [];
    arr.push(s);
    subsPorExp.set(s.expedienteId, arr);
  }

  let items: ResumenRow[] = exps.map((row) => {
    const av = avanceDe(subsPorExp.get(row.id) ?? [], row.estado);
    return {
      id: row.id,
      codigo: row.codigo,
      tesista: row.p1Nombres ? `${row.p1Nombres} ${row.p1Apellidos ?? ""}`.trim() : "—",
      dni: row.p1Dni ?? "—",
      programa: row.programa,
      etapaActual: av.etapaActual,
      subetapaActual: av.subetapaActual,
      estado: row.estado as EstadoLiteral,
      avancePct: av.pct,
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  // Indicadores sobre el universo visible del actor (INC-03), antes de q/estado.
  const es = (e: string): "curso" | "fin" | "sin" | "otro" =>
    e === "TITULO_EMITIDO"
      ? "fin"
      : e === "REGISTRADO"
        ? "sin"
        : e === "ANULADO" || e === "DESAPROBADO_TRUNCO"
          ? "otro"
          : "curso";
  const resumen = {
    total: items.length,
    enCurso: items.filter((e) => es(e.estado) === "curso").length,
    finalizados: items.filter((e) => es(e.estado) === "fin").length,
    sinIniciar: items.filter((e) => es(e.estado) === "sin").length,
  };

  const q = (filtros.q ?? "").trim().toLowerCase();
  if (q) {
    items = items.filter((i) =>
      [i.codigo, i.tesista, i.dni, i.programa].some((v) => v.toLowerCase().includes(q)),
    );
  }
  if (filtros.estado) items = items.filter((i) => i.estado === filtros.estado);
  switch (filtros.orden ?? "recientes") {
    case "antiguos":
      items.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
      break;
    case "menor-avance":
      items.sort((a, b) => a.avancePct - b.avancePct);
      break;
    case "mayor-avance":
      items.sort((a, b) => b.avancePct - a.avancePct);
      break;
    default:
      items.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
  }

  const page = Math.max(filtros.page ?? 1, 1);
  const limit = Math.min(Math.max(filtros.limit ?? 20, 1), 100);
  const total = items.length;
  return { items: items.slice((page - 1) * limit, page * limit), total, page, limit, resumen };
}
