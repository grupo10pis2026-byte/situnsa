import {
  AlertTriangle,
  CalendarCheck,
  CircleAlert,
  CircleCheck,
  Clock,
  FileDown,
  FileText,
  FolderKanban,
  UserCheck,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  type DashboardTallerDTO,
  descargarDashboardPdf,
  type FiltrosDashboard,
  useDashboardTaller,
} from "../api/dashboard.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { DataTable } from "../components/ui/data-table.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { ESTADO_COLOR, GraficoBarras, SERIES_COLOR } from "../components/ui/grafico-barras.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { StatCard } from "../components/ui/stat-card.js";
import { useToast } from "../components/ui/toast.js";

/**
 * Adenda 1.2 N2: Dashboard del taller (Secretaría, Dirección y Administrador,
 * solo lectura). Los números vienen del servidor con las mismas reglas de
 * P3/P9/P12; cada indicador enlaza al detalle filtrado.
 */

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE")}`;

export function DashboardTallerPage() {
  const toast = useToast();
  const [tallerId, setTallerId] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const filtros: FiltrosDashboard = {
    ...(tallerId ? { tallerId } : {}),
    ...(periodo ? { periodo } : {}),
    ...(tallerId && grupoId ? { grupoId } : {}),
  };
  const q = useDashboardTaller(filtros);
  const d = q.data;
  const [exportando, setExportando] = useState(false);

  async function exportar(): Promise<void> {
    setExportando(true);
    try {
      await descargarDashboardPdf(filtros);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo exportar", "error");
    } finally {
      setExportando(false);
    }
  }

  return (
    <AppShell activo="/dashboard-taller">
      <PageHeader
        titulo={d ? `Dashboard · ${d.titulo}` : "Dashboard del taller"}
        descripcion="Inscripción, asistencia, plan de tesis, avances, pensiones y alertas. Solo lectura."
        migas={[{ etiqueta: "Taller de Tesis", href: "/talleres" }, { etiqueta: "Dashboard" }]}
        acciones={
          <Button
            tamano="sm"
            variante="oscuro"
            disabled={!d || exportando}
            onClick={() => void exportar()}
            type="button"
          >
            <FileDown size={14} />
            {exportando ? "Exportando…" : "Exportar PDF"}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Select
            label="Taller"
            value={tallerId}
            onChange={(v) => {
              setTallerId(v);
              setGrupoId("");
            }}
          >
            <option value="">Todos los talleres</option>
            {(d?.opciones.talleres ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select label="Período" value={periodo} onChange={setPeriodo}>
            <option value="">Todos</option>
            {(d?.opciones.periodos ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        {tallerId && (
          <div className="w-full sm:w-44">
            <Select label="Grupo" value={grupoId} onChange={setGrupoId}>
              <option value="">Todos</option>
              {(d?.opciones.grupos ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}
        {d && (
          <p className="text-xs text-grafito-600">
            Actualizado {new Date(d.generadoAt).toLocaleString("es-PE")}
          </p>
        )}
      </div>

      {q.isPending ? (
        <Card className="p-5 text-sm text-grafito-600">Cargando…</Card>
      ) : q.isError || !d ? (
        <EmptyState
          titulo="No se pudo cargar el dashboard"
          descripcion={q.error instanceof Error ? q.error.message : undefined}
        />
      ) : (
        <Contenido d={d} tallerId={tallerId} />
      )}
    </AppShell>
  );
}

function Indicador({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2"
      href={href}
    >
      {children}
    </a>
  );
}

function Contenido({ d, tallerId }: { d: DashboardTallerDTO; tallerId: string }) {
  const conTaller = tallerId ? `?tallerId=${tallerId}` : "";
  const detalleTaller = tallerId ? `/taller/${tallerId}` : "/talleres";
  const alertasActivas = d.alertas.reduce((a, x) => a + x.cantidad, 0);
  const totalPlan =
    d.plan.presentados +
    d.plan.aprobados +
    d.plan.observados +
    d.plan.noPresentados +
    d.plan.pendientes;
  const totalPen =
    d.pensiones.alDia.cantidad + d.pensiones.pendientes.cantidad + d.pensiones.vencidas.cantidad;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Indicador href={detalleTaller}>
          <StatCard
            etiqueta="Proyectos / cupo"
            valor={`${d.inscripcion.proyectos} / ${d.inscripcion.cupo}`}
            icono={<FolderKanban size={18} />}
            acento="bg-navy-950"
            pie={`${d.inscripcion.alumnos} alumnos activos`}
          />
        </Indicador>
        <Indicador href={detalleTaller}>
          <StatCard
            etiqueta="Asistencia promedio"
            valor={d.asistencia.promedio === null ? "—" : `${d.asistencia.promedio} %`}
            icono={<UserCheck size={18} />}
            acento="bg-navy-800"
            pie={`${d.asistencia.conFaltasConsecutivas} con faltas consecutivas`}
          />
        </Indicador>
        <Indicador href={detalleTaller}>
          <StatCard
            etiqueta="Planes aprobados"
            valor={`${d.plan.aprobados} de ${totalPlan}`}
            icono={<FileText size={18} />}
            acento="bg-verde-inst-700"
            pie={`${d.plan.observados} observados · ${d.plan.noPresentados} no presentados`}
          />
        </Indicador>
        <Indicador href={`/pagos-taller${conTaller}${conTaller ? "&" : "?"}deudores=true`}>
          <StatCard
            etiqueta="Pensiones vencidas"
            valor={d.pensiones.vencidas.cantidad}
            icono={<Wallet size={18} />}
            acento="bg-red-600"
            pie={`Deuda ${soles(d.pensiones.vencidas.monto)}`}
          />
        </Indicador>
        <Indicador href={`/reportes-taller${conTaller}`}>
          <StatCard
            etiqueta="Alertas activas"
            valor={alertasActivas}
            icono={<AlertTriangle size={18} />}
            acento="bg-dorado-500"
            pie={d.alertas.map((a) => `${a.etiqueta}: ${a.cantidad}`).join(" · ") || "Sin alertas"}
          />
        </Indicador>
        <Indicador href={detalleTaller}>
          <StatCard
            etiqueta="Sesiones dictadas"
            valor={`${d.sesiones.realizadas} / ${d.sesiones.total}`}
            icono={<CalendarCheck size={18} />}
            acento="bg-slate-300"
            pie={pct(d.sesiones.realizadas, d.sesiones.total)}
          />
        </Indicador>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GraficoBarras
          titulo={tallerId ? "Asistencia por grupo" : "Asistencia por taller"}
          descripcion="Promedio de asistencia de los alumnos activos (presente + justificada)."
          series={[{ nombre: "Asistencia", color: SERIES_COLOR[0] }]}
          max={100}
          vacio="Aún no hay sesiones con asistencia."
          filas={
            tallerId
              ? d.asistencia.porGrupo.map((g) => ({
                  id: g.grupo,
                  etiqueta: g.grupo,
                  valores: [g.promedio ?? 0],
                  textos: [
                    g.promedio === null
                      ? "Sin alumnos activos"
                      : `${g.promedio} % (${g.alumnos} alumno${g.alumnos === 1 ? "" : "s"})`,
                  ],
                }))
              : d.comparacion
                  .filter((t) => t.asistencia !== null)
                  .map((t) => ({
                    id: t.tallerId,
                    etiqueta: t.nombre,
                    valores: [t.asistencia ?? 0],
                    textos: [`${t.asistencia} %`],
                    href: `/taller/${t.tallerId}`,
                  }))
          }
          pie={
            d.asistencia.alumnosConFaltas.length > 0
              ? `Con faltas consecutivas: ${d.asistencia.alumnosConFaltas
                  .map((a) => `${a.nombre} (${a.proyecto})`)
                  .join(", ")}`
              : undefined
          }
        />
        <GraficoBarras
          titulo="Plan de tesis"
          descripcion="Estado del plan de cada proyecto."
          series={[{ nombre: "Proyectos", color: SERIES_COLOR[0] }]}
          max={totalPlan}
          filas={(
            [
              ["aprobados", "Aprobados", d.plan.aprobados],
              ["presentados", "Presentados (por revisar)", d.plan.presentados],
              ["observados", "Observados", d.plan.observados],
              ["no", "No presentados", d.plan.noPresentados],
              ["pendientes", "Pendientes", d.plan.pendientes],
            ] as const
          ).map(([id, etiqueta, v]) => ({
            id,
            etiqueta,
            valores: [v],
            textos: [`${v} (${pct(v, totalPlan)})`],
            href: detalleTaller,
          }))}
        />
        <GraficoBarras
          titulo="Avances por hito"
          descripcion="Entregas y aprobaciones sobre el total de proyectos."
          series={[
            { nombre: "Entregadas", color: SERIES_COLOR[0] },
            { nombre: "Aprobadas", color: SERIES_COLOR[1] },
          ]}
          max={Math.max(1, ...d.avances.map((a) => a.proyectos))}
          vacio="Aún no hay hitos con entregas."
          filas={d.avances.map((a) => ({
            id: a.hito,
            etiqueta: a.nombre,
            valores: [a.entregadas, a.aprobadas],
            textos: [`${a.entregadas}/${a.proyectos}`, `${a.aprobadas}/${a.proyectos}`],
          }))}
        />
        <GraficoBarras
          titulo="Pensiones"
          descripcion="Cuotas por estado y monto."
          series={[{ nombre: "Cuotas", color: SERIES_COLOR[0] }]}
          max={totalPen}
          filas={[
            {
              id: "aldia",
              etiqueta: "Al día",
              valores: [d.pensiones.alDia.cantidad],
              textos: [`${d.pensiones.alDia.cantidad} · ${soles(d.pensiones.alDia.monto)}`],
              color: ESTADO_COLOR.bien,
              icono: <CircleCheck size={14} color={ESTADO_COLOR.bien} aria-hidden />,
              href: `/pagos-taller${conTaller}`,
            },
            {
              id: "pendientes",
              etiqueta: "Pendientes",
              valores: [d.pensiones.pendientes.cantidad],
              textos: [
                `${d.pensiones.pendientes.cantidad} · ${soles(d.pensiones.pendientes.monto)}`,
              ],
              color: ESTADO_COLOR.aviso,
              icono: <Clock size={14} color="#b07d00" aria-hidden />,
              href: `/pagos-taller${conTaller}`,
            },
            {
              id: "vencidas",
              etiqueta: "Vencidas",
              valores: [d.pensiones.vencidas.cantidad],
              textos: [`${d.pensiones.vencidas.cantidad} · ${soles(d.pensiones.vencidas.monto)}`],
              color: ESTADO_COLOR.critico,
              icono: <CircleAlert size={14} color={ESTADO_COLOR.critico} aria-hidden />,
              href: `/pagos-taller${conTaller}${conTaller ? "&" : "?"}deudores=true`,
            },
          ]}
        />
      </div>

      {d.comparacion.length > 0 && (
        <Card>
          <CardEncabezado
            titulo="Comparación por taller"
            descripcion="Totales por taller, sin datos personales. Elige un taller para ver su detalle."
          />
          <div className="p-4 md:p-5">
            <DataTable
              vacio="No hay talleres para los filtros elegidos."
              filas={d.comparacion.map((t) => ({ ...t, id: t.tallerId }))}
              columnas={[
                {
                  encabezado: "Taller",
                  celda: (t) => (
                    <a
                      className="font-semibold text-navy-800 hover:underline"
                      href={`/taller/${t.tallerId}`}
                    >
                      {t.nombre}
                    </a>
                  ),
                },
                {
                  encabezado: "Estado",
                  celda: (t) => t.estado.replace(/_/g, " ").toLowerCase(),
                },
                {
                  encabezado: "Proyectos",
                  clase: "text-right",
                  celda: (t) => `${t.proyectos}/${t.cupo}`,
                },
                {
                  encabezado: "Asistencia",
                  clase: "text-right",
                  celda: (t) => (t.asistencia === null ? "—" : `${t.asistencia} %`),
                },
                {
                  encabezado: "Planes aprobados",
                  clase: "text-right",
                  celda: (t) => t.planesAprobados,
                },
                {
                  encabezado: "Pensiones con deuda",
                  clase: "text-right",
                  celda: (t) => t.vencidas,
                },
                { encabezado: "Alertas", clase: "text-right", celda: (t) => t.alertas },
              ]}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
