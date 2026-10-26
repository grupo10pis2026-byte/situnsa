import type {
  FiltrosSolicitudesQuery,
  KpisSolicitudes,
  SolicitudDetalleDTO,
  SolicitudResumen,
} from "@pis/contracts";
import type { DbExecutor } from "@pis/db";
import {
  db,
  solicitudDocumentos,
  solicitudes,
  solicitudHistorial,
  solicitudParticipantes,
  tokensSubsanacion,
  usuarios,
} from "@pis/db";
import { estaSubsanacionVencida } from "@pis/domain";
import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/* TIPOS INTERNOS                                                              */
/* -------------------------------------------------------------------------- */

export type SolicitudRow = typeof solicitudes.$inferSelect;

/* -------------------------------------------------------------------------- */
/* LISTADO PAGINADO CON KPIs                                                  */
/* -------------------------------------------------------------------------- */

export async function listarSolicitudes(filtros: FiltrosSolicitudesQuery): Promise<{
  items: SolicitudResumen[];
  meta: { page: number; limit: number; total: number };
  kpis: KpisSolicitudes;
}> {
  const page = Math.max(1, filtros.page ?? 1);
  const limit = Math.min(100, Math.max(1, filtros.limit ?? 20));
  const offset = (page - 1) * limit;

  // Condiciones de filtro
  const condiciones = [];
  if (filtros.via) condiciones.push(eq(solicitudes.via, filtros.via));
  if (filtros.estado) condiciones.push(eq(solicitudes.estado, filtros.estado));
  if (filtros.programa) condiciones.push(ilike(solicitudes.programa, `%${filtros.programa}%`));
  if (filtros.desde) condiciones.push(gte(solicitudes.createdAt, new Date(filtros.desde)));
  if (filtros.hasta) condiciones.push(lte(solicitudes.createdAt, new Date(filtros.hasta)));

  if (filtros.q) {
    const q = `%${filtros.q}%`;
    condiciones.push(
      or(
        ilike(solicitudes.codigo, q),
        ilike(solicitudes.titulo, q),
        // sub-query para filtrar por DNI/nombre de participante
        sql`EXISTS (
          SELECT 1 FROM solicitud_participantes sp
          WHERE sp.solicitud_id = ${solicitudes.id}
          AND (sp.dni ILIKE ${q} OR sp.nombres ILIKE ${q} OR sp.apellidos ILIKE ${q} OR sp.cui ILIKE ${q})
        )`,
      ),
    );
  }

  const where = condiciones.length > 0 ? and(...condiciones) : undefined;

  // Total
  const countRows = await db.select({ total: count() }).from(solicitudes).where(where);
  const total = Number(countRows[0]?.total ?? 0);

  // Datos principales paginados
  const rows = await db
    .select()
    .from(solicitudes)
    .where(where)
    .orderBy(desc(solicitudes.createdAt))
    .limit(limit)
    .offset(offset);

  // Participantes de las solicitudes listadas
  const ids = rows.map((r) => r.id);
  const participantesRows =
    ids.length > 0
      ? await db
          .select()
          .from(solicitudParticipantes)
          .where(
            sql`${solicitudParticipantes.solicitudId} = ANY(${sql.raw(`ARRAY['${ids.join("','")}']::uuid[]`)})`,
          )
      : [];

  // Documentos: contadores
  const docContadores =
    ids.length > 0
      ? await db
          .select({
            solicitudId: solicitudDocumentos.solicitudId,
            total: count(),
            conformes: sql<number>`count(*) filter (where ${solicitudDocumentos.estadoConformidad} = 'CONFORME')`,
          })
          .from(solicitudDocumentos)
          .where(
            sql`${solicitudDocumentos.solicitudId} = ANY(${sql.raw(`ARRAY['${ids.join("','")}']::uuid[]`)})`,
          )
          .groupBy(solicitudDocumentos.solicitudId)
      : [];

  const docMap = new Map(docContadores.map((d) => [d.solicitudId, d]));
  const partMap = new Map<string, (typeof participantesRows)[0][]>();
  for (const p of participantesRows) {
    const arr = partMap.get(p.solicitudId) ?? [];
    arr.push(p);
    partMap.set(p.solicitudId, arr);
  }

  const ahora = new Date();
  const items: SolicitudResumen[] = rows.map((s) => {
    const parts = (partMap.get(s.id) ?? []).sort((a, b) => a.orden - b.orden);
    const p1 = parts[0];
    const p2 = parts[1] ?? null;
    const doc = docMap.get(s.id);
    return {
      id: s.id,
      codigo: s.codigo,
      fechaHora: s.createdAt.toISOString(),
      via: s.via,
      modalidad: s.modalidad,
      programa: s.programa,
      titulo: s.titulo,
      tesistaTitular: {
        nombresCompletos: p1 ? `${p1.nombres} ${p1.apellidos}` : "—",
        dni: p1?.dni ?? "—",
        cui: p1?.cui ?? null,
      },
      coTesista: p2
        ? {
            nombresCompletos: `${p2.nombres} ${p2.apellidos}`,
            dni: p2.dni,
            cui: p2.cui ?? null,
          }
        : null,
      totalDocumentos: Number(doc?.total ?? 0),
      documentosConformes: Number(doc?.conformes ?? 0),
      estado: s.estado,
      expedienteCodigo: null, // Se agrega en query optimizada si se necesita
      fechaLimiteSubsanacion: s.fechaLimiteSubsanacion,
      esPlazoVencido: s.fechaLimiteSubsanacion
        ? estaSubsanacionVencida(new Date(s.fechaLimiteSubsanacion), ahora)
        : false,
    };
  });

  // KPIs globales
  const kpisRows = await db
    .select({
      estado: solicitudes.estado,
      cantidad: count(),
    })
    .from(solicitudes)
    .groupBy(solicitudes.estado);

  const kpiMap = new Map(kpisRows.map((k) => [k.estado, Number(k.cantidad)]));

  // Tiempo promedio de espera para solicitudes NUEVA/EN_REVISION (horas desde createdAt)
  const [promedioRow] = await db
    .select({
      promedio: sql<number>`COALESCE(
        EXTRACT(EPOCH FROM AVG(NOW() - ${solicitudes.createdAt})) / 3600,
        0
      )`,
    })
    .from(solicitudes)
    .where(or(eq(solicitudes.estado, "NUEVA"), eq(solicitudes.estado, "EN_REVISION")));

  const kpis: KpisSolicitudes = {
    nuevas: kpiMap.get("NUEVA") ?? 0,
    enRevision: kpiMap.get("EN_REVISION") ?? 0,
    expedientesCreados: kpiMap.get("ACEPTADA") ?? 0,
    observadas: kpiMap.get("OBSERVADA") ?? 0,
    tiempoPromedioEsperaHoras: Math.round((promedioRow?.promedio ?? 0) * 10) / 10,
  };

  return {
    items,
    meta: {
      page,
      limit,
      total,
    },
    kpis,
  };
}

/* -------------------------------------------------------------------------- */
/* DETALLE COMPLETO                                                            */
/* -------------------------------------------------------------------------- */

export async function getSolicitudById(
  id: string,
  tx: DbExecutor = db,
): Promise<SolicitudDetalleDTO | null> {
  const [sol] = await tx.select().from(solicitudes).where(eq(solicitudes.id, id)).limit(1);
  if (!sol) return null;

  // Participantes
  const partsRows = await tx
    .select()
    .from(solicitudParticipantes)
    .where(eq(solicitudParticipantes.solicitudId, id));

  // Documentos
  const docsRows = await tx
    .select()
    .from(solicitudDocumentos)
    .where(eq(solicitudDocumentos.solicitudId, id));

  // Historial
  const historialRows = await tx
    .select({
      h: solicitudHistorial,
      actorNombres: usuarios.nombres,
      actorApellidos: usuarios.apellidos,
    })
    .from(solicitudHistorial)
    .leftJoin(usuarios, eq(solicitudHistorial.actorId, usuarios.id))
    .where(eq(solicitudHistorial.solicitudId, id))
    .orderBy(desc(solicitudHistorial.createdAt));

  // Expediente código (si hay)
  let expedienteCodigo: string | null = null;
  if (sol.expedienteId) {
    const { expedientes } = await import("@pis/db");
    const [exp] = await tx
      .select({ codigo: expedientes.codigo })
      .from(expedientes)
      .where(eq(expedientes.id, sol.expedienteId))
      .limit(1);
    expedienteCodigo = exp?.codigo ?? null;
  }

  const ahora = new Date();
  const esPlazoVencido = sol.fechaLimiteSubsanacion
    ? estaSubsanacionVencida(new Date(sol.fechaLimiteSubsanacion), ahora)
    : false;

  const participantes = partsRows
    .sort((a, b) => a.orden - b.orden)
    .map((p) => ({
      id: p.id,
      orden: p.orden,
      nombres: p.nombres,
      apellidos: p.apellidos,
      dni: p.dni,
      cui: p.cui ?? null,
      email: p.email,
      telefono: p.telefono ?? null,
      nacionalidad: p.nacionalidad ?? null,
      ciudad: p.ciudad ?? null,
      direccion: p.direccion ?? null,
      departamento: p.departamento ?? null,
      provincia: p.provincia ?? null,
      distrito: p.distrito ?? null,
      esCuentaInstitucional: p.email.endsWith(".edu.pe"),
      poseeCuentaPrevia: p.usuarioId !== null,
      usuarioId: p.usuarioId ?? null,
    }));

  const documentos = docsRows.map((d) => ({
    id: d.id,
    tipo: d.tipo,
    nombreOriginal: d.nombreOriginal,
    mimeType: d.mimeType,
    pesoBytes: d.pesoBytes,
    version: d.version,
    estadoConformidad: d.estadoConformidad,
    participanteOrden: d.participanteOrden ?? null,
    sha256: d.sha256,
    createdAt: d.createdAt.toISOString(),
  }));

  const trazabilidad = historialRows.map(({ h, actorNombres, actorApellidos }) => ({
    id: h.id,
    accion: h.accion,
    actor:
      actorNombres && actorApellidos
        ? `${actorNombres} ${actorApellidos}`
        : (h.actorDni ?? "Sistema"),
    actorDni: h.actorDni ?? null,
    ip: h.ip ?? null,
    detalle: h.detalle ?? null,
    metadata: (h.metadata as Record<string, unknown>) ?? {},
    fechaHora: h.createdAt.toISOString(),
  }));

  return {
    id: sol.id,
    codigo: sol.codigo,
    via: sol.via,
    modalidad: sol.modalidad,
    programa: sol.programa,
    titulo: sol.titulo,
    anioEgreso: sol.anioEgreso ?? null,
    cantidadTesistas: sol.cantidadTesistas,
    estado: sol.estado,
    responsableAsignado: null,
    fechaRecepcion: sol.createdAt.toISOString(),
    fechaLimiteSubsanacion: sol.fechaLimiteSubsanacion,
    esPlazoVencido,
    motivoObservacion: sol.motivoObservacion ?? null,
    motivoRechazo: sol.motivoRechazo ?? null,
    expedienteId: sol.expedienteId ?? null,
    expedienteCodigo,
    tallerGrupoId: sol.tallerGrupoId ?? null,
    participantes,
    documentos,
    trazabilidad,
  };
}

/* -------------------------------------------------------------------------- */
/* OBTENER SOLICITUD RAW PARA USE CASES (con lock opcional)                   */
/* -------------------------------------------------------------------------- */

export async function getSolicitudRaw(
  id: string,
  tx: DbExecutor = db,
): Promise<SolicitudRow | null> {
  const [sol] = await tx.select().from(solicitudes).where(eq(solicitudes.id, id)).limit(1);
  return sol ?? null;
}

/* -------------------------------------------------------------------------- */
/* TOKEN DE SUBSANACIÓN                                                       */
/* -------------------------------------------------------------------------- */

export async function getTokenSubsanacionPorHash(hash: string, tx: DbExecutor = db) {
  const [row] = await tx
    .select()
    .from(tokensSubsanacion)
    .where(eq(tokensSubsanacion.hash, hash))
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/* SIGUIENTE CÓDIGO CORRELATIVO SOL-AAAA-NNNN                                 */
/* -------------------------------------------------------------------------- */

export async function siguienteCodigoSol(anio: number, tx: DbExecutor = db): Promise<string> {
  const prefix = `SOL-${anio}-`;
  const offset = prefix.length + 1;
  const resultado = await tx.execute<{ max: number | null }>(
    sql`SELECT MAX(CAST(SUBSTRING(${solicitudes.codigo}, ${sql.raw(String(offset))}) AS INTEGER)) as max
        FROM ${solicitudes}
        WHERE ${solicitudes.codigo} LIKE ${`${prefix}%`}`,
  );
  const siguiente = Number(resultado.rows[0]?.max ?? 0) + 1;
  return `${prefix}${String(siguiente).padStart(4, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* SIGUIENTE CÓDIGO SET (para modal de aceptación)                            */
/* -------------------------------------------------------------------------- */

export async function sugerirCodigoSet(tx: DbExecutor = db): Promise<string> {
  const { expedientes } = await import("@pis/db");
  const resultado = await tx.execute<{ max: number | null }>(
    sql`SELECT MAX(CAST(SUBSTRING(${expedientes.codigo} FROM 4) AS INTEGER)) as max
        FROM ${expedientes}
        WHERE ${expedientes.codigo} ~ '^SET[0-9]+$'`,
  );
  const siguiente = Number(resultado.rows[0]?.max ?? 0) + 1;
  return `SET${String(siguiente).padStart(3, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* APPEND HISTORIAL DE SOLICITUD                                              */
/* -------------------------------------------------------------------------- */

export async function appendHistorialSolicitud(
  tx: DbExecutor,
  data: {
    solicitudId: string;
    accion: string;
    actorId: string | null;
    actorDni: string;
    ip?: string | null;
    detalle?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(solicitudHistorial).values({
    solicitudId: data.solicitudId,
    accion: data.accion,
    actorId: data.actorId,
    actorDni: data.actorDni,
    ip: data.ip ?? null,
    detalle: data.detalle ?? null,
    metadata: data.metadata ?? {},
  });
}

/* -------------------------------------------------------------------------- */
/* OBTENER DOCUMENTO DE SOLICITUD POR ID (para descarga / visor)              */
/* -------------------------------------------------------------------------- */

export async function getDocumentoSolicitudById(
  solicitudId: string,
  documentoId: string,
  tx: DbExecutor = db,
): Promise<{ id: string; ruta: string; nombreOriginal: string; mimeType: string } | null> {
  const [doc] = await tx
    .select({
      id: solicitudDocumentos.id,
      ruta: solicitudDocumentos.ruta,
      nombreOriginal: solicitudDocumentos.nombreOriginal,
      mimeType: solicitudDocumentos.mimeType,
    })
    .from(solicitudDocumentos)
    .where(
      and(
        eq(solicitudDocumentos.id, documentoId),
        eq(solicitudDocumentos.solicitudId, solicitudId),
      ),
    )
    .limit(1);
  return doc ?? null;
}
