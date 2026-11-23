import type { DashboardTallerDTO, FiltrosDashboard } from "@pis/contracts";
import {
  alertasTaller,
  type DbExecutor,
  entregasHito,
  gruposHorario,
  hitosProyecto,
  pensionesAlumno,
  pensionesTaller,
  proyectosTaller,
  proyectoTesistas,
  tallerAsistencias,
  talleres,
  tallerSesiones,
  usuarios,
} from "@pis/db";
import {
  alcanzaFaltasParaRetiro,
  diasAtraso,
  ESTADOS_TESISTA_ACTIVO,
  HITOS_TALLER,
  porcentajeAsistenciaCurso,
  type RegistroAsistenciaCurso,
} from "@pis/domain";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";
import { tieneDeuda } from "../pagos/pagos.repository.js";

/**
 * Adenda 1.2 N2: indicadores del taller (o de todos) calculados en el
 * servidor con las mismas reglas que P1, P3, P9 y P12:
 * - proyectos y cupo como P1; asistencia (PRESENTE + JUSTIFICADA) / realizadas
 *   como P3; deuda con la regla de «Solo deudores» de P9; alertas activas de P12.
 * La vista de todos los talleres no lista datos personales.
 */

const ETIQUETA_ALERTA: Record<string, string> = {
  FALTAS_CONSECUTIVAS: "Faltas consecutivas",
  PLAN_NO_PRESENTADO: "Plan no presentado",
  AVANCE_INCUMPLIDO: "Avance incumplido",
};

const promedio = (v: number[]) =>
  v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;

export async function dashboardTaller(
  tx: DbExecutor,
  filtros: FiltrosDashboard,
  hoy: string,
): Promise<DashboardTallerDTO | null> {
  const p = await leerParametrosTaller(tx);

  // ── Opciones de filtro ──────────────────────────────────────────────
  const todos = await tx
    .select({
      id: talleres.id,
      nombre: talleres.nombre,
      periodo: talleres.periodo,
      estado: talleres.estado,
      cupo: talleres.cupoProyectos,
    })
    .from(talleres)
    .orderBy(desc(talleres.fechaInicio));
  const periodos = [...new Set(todos.map((t) => t.periodo).filter((x): x is string => !!x))];
  let elegidos = todos.filter((t) => t.estado !== "CANCELADO");
  if (filtros.periodo) elegidos = elegidos.filter((t) => t.periodo === filtros.periodo);
  const uno = filtros.tallerId ? (todos.find((t) => t.id === filtros.tallerId) ?? null) : null;
  if (filtros.tallerId && !uno) return null;
  if (uno) elegidos = [uno];
  const ids = elegidos.map((t) => t.id);

  const grupos = uno
    ? await tx
        .select({ id: gruposHorario.id, nombre: gruposHorario.nombre })
        .from(gruposHorario)
        .where(and(eq(gruposHorario.tallerId, uno.id), eq(gruposHorario.activo, true)))
        .orderBy(asc(gruposHorario.nombre))
    : [];
  const grupoId =
    uno && filtros.grupoId && grupos.some((g) => g.id === filtros.grupoId) ? filtros.grupoId : null;

  const vacio: DashboardTallerDTO = {
    titulo: uno ? uno.nombre : "Todos los talleres",
    generadoAt: new Date().toISOString(),
    filtros: { tallerId: uno?.id ?? null, periodo: filtros.periodo ?? null, grupoId },
    opciones: {
      talleres: todos.map((t) => ({ id: t.id, nombre: t.nombre, periodo: t.periodo })),
      periodos,
      grupos,
    },
    inscripcion: { proyectos: 0, cupo: elegidos.reduce((a, t) => a + t.cupo, 0), alumnos: 0 },
    asistencia: { promedio: null, porGrupo: [], conFaltasConsecutivas: 0, alumnosConFaltas: [] },
    plan: { presentados: 0, aprobados: 0, observados: 0, noPresentados: 0, pendientes: 0 },
    avances: [],
    pensiones: {
      alDia: { cantidad: 0, monto: 0 },
      pendientes: { cantidad: 0, monto: 0 },
      vencidas: { cantidad: 0, monto: 0 },
    },
    alertas: [],
    sesiones: { realizadas: 0, total: 0 },
    comparacion: [],
  };
  if (ids.length === 0) return vacio;

  // ── Proyectos y tesistas ────────────────────────────────────────────
  const condProyecto: SQL[] = [inArray(proyectosTaller.tallerId, ids)];
  if (grupoId) condProyecto.push(eq(proyectosTaller.grupoHorarioId, grupoId));
  const proyectos = await tx
    .select({
      id: proyectosTaller.id,
      codigo: proyectosTaller.codigo,
      tallerId: proyectosTaller.tallerId,
      grupoId: proyectosTaller.grupoHorarioId,
    })
    .from(proyectosTaller)
    .where(and(...condProyecto));
  const pids = proyectos.map((x) => x.id);
  const tesistas = pids.length
    ? await tx
        .select({
          alumnoId: proyectoTesistas.alumnoId,
          proyectoId: proyectoTesistas.proyectoId,
          estado: proyectoTesistas.estado,
          nombres: usuarios.nombres,
          apellidos: usuarios.apellidos,
        })
        .from(proyectoTesistas)
        .innerJoin(usuarios, eq(usuarios.id, proyectoTesistas.alumnoId))
        .where(inArray(proyectoTesistas.proyectoId, pids))
    : [];
  const activos = tesistas.filter((t) =>
    (ESTADOS_TESISTA_ACTIVO as readonly string[]).includes(t.estado),
  );
  const proyectoDe = new Map(proyectos.map((x) => [x.id, x]));

  // ── Asistencia ──────────────────────────────────────────────────────
  const sesiones = await tx
    .select({
      id: tallerSesiones.id,
      tallerId: tallerSesiones.tallerId,
      estado: tallerSesiones.estado,
    })
    .from(tallerSesiones)
    .where(inArray(tallerSesiones.tallerId, ids))
    .orderBy(asc(tallerSesiones.fecha), asc(tallerSesiones.nro));
  const marcas =
    sesiones.length && activos.length
      ? await tx
          .select({
            sesionId: tallerAsistencias.sesionId,
            usuarioId: tallerAsistencias.usuarioId,
            estado: tallerAsistencias.estado,
          })
          .from(tallerAsistencias)
          .where(
            and(
              inArray(
                tallerAsistencias.sesionId,
                sesiones.map((s) => s.id),
              ),
              inArray(
                tallerAsistencias.usuarioId,
                activos.map((t) => t.alumnoId),
              ),
            ),
          )
      : [];
  const marca = new Map(marcas.map((m) => [`${m.sesionId}|${m.usuarioId}`, m.estado]));
  const registrosDe = (alumnoId: string, tallerId: string): RegistroAsistenciaCurso[] =>
    sesiones
      .filter((s) => s.tallerId === tallerId)
      .map((s) => ({ sesion: s.estado, marca: marca.get(`${s.id}|${alumnoId}`) ?? null }));
  const porAlumno = activos.map((t) => {
    const pr = proyectoDe.get(t.proyectoId);
    const regs = registrosDe(t.alumnoId, pr?.tallerId ?? "");
    return {
      ...t,
      tallerId: pr?.tallerId ?? "",
      grupoId: pr?.grupoId ?? null,
      codigo: pr?.codigo ?? "",
      pct: porcentajeAsistenciaCurso(regs, p),
      faltas: alcanzaFaltasParaRetiro(regs, p),
    };
  });
  const porGrupo = uno
    ? [
        ...grupos
          .filter((g) => !grupoId || g.id === grupoId)
          .map((g) => ({ id: g.id as string | null, nombre: g.nombre })),
        ...(grupoId ? [] : [{ id: null, nombre: "Sin grupo" }]),
      ]
        .map((g) => {
          const suyos = porAlumno.filter((a) => (a.grupoId ?? null) === g.id);
          return {
            grupo: g.nombre,
            alumnos: suyos.length,
            promedio: promedio(suyos.map((a) => a.pct).filter((x): x is number => x !== null)),
          };
        })
        .filter((g) => g.alumnos > 0 || g.grupo !== "Sin grupo")
    : [];

  // ── Hitos: plan y avances ───────────────────────────────────────────
  const hitos = pids.length
    ? await tx
        .select({
          id: hitosProyecto.id,
          proyectoId: hitosProyecto.proyectoId,
          tipo: hitosProyecto.tipo,
          estado: hitosProyecto.estado,
        })
        .from(hitosProyecto)
        .where(inArray(hitosProyecto.proyectoId, pids))
    : [];
  const conVersion = new Set(
    hitos.length
      ? (
          await tx
            .selectDistinct({ hitoId: entregasHito.hitoId })
            .from(entregasHito)
            .where(
              inArray(
                entregasHito.hitoId,
                hitos.map((h) => h.id),
              ),
            )
        ).map((x) => x.hitoId)
      : [],
  );
  const planes = hitos.filter((h) => h.tipo === "PLAN");
  const plan = {
    presentados: planes.filter((h) => h.estado === "ENTREGADO").length,
    aprobados: planes.filter((h) => h.estado === "APROBADO").length,
    observados: planes.filter((h) => h.estado === "OBSERVADO").length,
    noPresentados: planes.filter((h) => h.estado === "NO_ENTREGADO").length,
    pendientes: planes.filter((h) => h.estado === "NO_HABILITADO" || h.estado === "HABILITADO")
      .length,
  };
  const cuenta = (lista: typeof hitos) => ({
    proyectos: lista.length,
    entregadas: lista.filter((h) => conVersion.has(h.id)).length,
    aprobadas: lista.filter((h) => h.estado === "APROBADO").length,
  });
  const avances = HITOS_TALLER.filter((h) => h.tipo !== "PLAN").map((h) => {
    const delTipo = hitos.filter((x) => x.tipo === h.tipo);
    return {
      hito: h.tipo,
      nombre: h.nombre,
      ...cuenta(delTipo),
      porGrupo: uno
        ? grupos
            .filter((g) => !grupoId || g.id === grupoId)
            .map((g) => ({
              grupo: g.nombre,
              ...cuenta(delTipo.filter((x) => proyectoDe.get(x.proyectoId)?.grupoId === g.id)),
            }))
        : [],
    };
  });

  // ── Pensiones (regla de deuda de P9) ────────────────────────────────
  const alumnosFiltro = grupoId ? activos.map((t) => t.alumnoId) : null;
  const pens = await tx
    .select({
      tallerId: pensionesTaller.tallerId,
      alumnoId: pensionesAlumno.alumnoId,
      estado: pensionesAlumno.estado,
      fecha: pensionesTaller.fecha,
      monto: pensionesTaller.monto,
      montoPagado: pensionesAlumno.montoPagado,
    })
    .from(pensionesAlumno)
    .innerJoin(pensionesTaller, eq(pensionesTaller.id, pensionesAlumno.pensionTallerId))
    .where(inArray(pensionesTaller.tallerId, ids));
  const pensFiltradas = alumnosFiltro
    ? pens.filter((x) => alumnosFiltro.includes(x.alumnoId))
    : pens;
  const pensiones = {
    alDia: { cantidad: 0, monto: 0 },
    pendientes: { cantidad: 0, monto: 0 },
    vencidas: { cantidad: 0, monto: 0 },
  };
  for (const x of pensFiltradas) {
    const atraso =
      x.estado === "EN_REVISION" ? 0 : diasAtraso({ estado: x.estado, fecha: x.fecha }, hoy);
    const grupo =
      x.estado === "VALIDADA"
        ? pensiones.alDia
        : tieneDeuda(x.estado, atraso)
          ? pensiones.vencidas
          : pensiones.pendientes;
    grupo.cantidad += 1;
    grupo.monto += x.estado === "VALIDADA" ? (x.montoPagado ?? x.monto) : x.monto;
  }

  // ── Alertas activas ─────────────────────────────────────────────────
  const alertasFilas = await tx
    .select({
      tallerId: alertasTaller.tallerId,
      tipo: alertasTaller.tipo,
      alumnoId: alertasTaller.alumnoId,
    })
    .from(alertasTaller)
    .where(and(inArray(alertasTaller.tallerId, ids), eq(alertasTaller.estado, "ACTIVA")));
  const alertasF = alumnosFiltro
    ? alertasFilas.filter((a) => a.alumnoId && alumnosFiltro.includes(a.alumnoId))
    : alertasFilas;
  const alertas = Object.keys(ETIQUETA_ALERTA).map((tipo) => ({
    tipo,
    etiqueta: ETIQUETA_ALERTA[tipo] ?? tipo,
    cantidad: alertasF.filter((a) => a.tipo === tipo).length,
  }));

  // ── Comparación (vista de todos) ────────────────────────────────────
  const comparacion = uno
    ? []
    : elegidos.map((t) => {
        const suyos = porAlumno.filter((a) => a.tallerId === t.id);
        return {
          tallerId: t.id,
          nombre: t.nombre,
          estado: t.estado,
          proyectos: proyectos.filter((x) => x.tallerId === t.id).length,
          cupo: t.cupo,
          asistencia: promedio(suyos.map((a) => a.pct).filter((x): x is number => x !== null)),
          planesAprobados: planes.filter(
            (h) => proyectoDe.get(h.proyectoId)?.tallerId === t.id && h.estado === "APROBADO",
          ).length,
          vencidas: pens.filter((x) => {
            const atraso =
              x.estado === "EN_REVISION"
                ? 0
                : diasAtraso({ estado: x.estado, fecha: x.fecha }, hoy);
            return x.tallerId === t.id && x.estado !== "VALIDADA" && tieneDeuda(x.estado, atraso);
          }).length,
          alertas: alertasFilas.filter((a) => a.tallerId === t.id).length,
        };
      });

  return {
    ...vacio,
    inscripcion: {
      proyectos: proyectos.length,
      cupo: elegidos.reduce((a, t) => a + t.cupo, 0),
      alumnos: activos.length,
    },
    asistencia: {
      promedio: promedio(porAlumno.map((a) => a.pct).filter((x): x is number => x !== null)),
      porGrupo,
      conFaltasConsecutivas: porAlumno.filter((a) => a.faltas).length,
      // Sin datos personales en la vista de todos los talleres (propuesta de la adenda).
      alumnosConFaltas: uno
        ? porAlumno
            .filter((a) => a.faltas)
            .map((a) => ({ nombre: `${a.nombres} ${a.apellidos}`, proyecto: a.codigo }))
        : [],
    },
    plan,
    avances,
    pensiones,
    alertas,
    sesiones: {
      realizadas: sesiones.filter((s) => s.estado === "REALIZADA").length,
      total: sesiones.length,
    },
    comparacion,
  };
}
