import type { EstadoSolicitud, Modalidad, SolicitudResumen } from "@pis/contracts";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Inbox,
  RefreshCw,
  Search,
  Timer,
} from "lucide-react";
import { useState } from "react";
import { useListarSolicitudes } from "../api/solicitudes.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import type { Columna } from "../components/ui/data-table.js";
import { DataTable } from "../components/ui/data-table.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { StatCard } from "../components/ui/stat-card.js";
import { StatusBadge } from "../components/ui/status-badge.js";

function etiquetaModalidad(m: Modalidad | string): string {
  if (m === "TESIS") return "Tesis";
  if (m === "TRABAJO_ACADEMICO") return "Trabajo Académico";
  if (m === "ARTICULO") return "Artículo Indexado";
  return m;
}

export function SolicitudesPage() {
  const [q, setQ] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad | "">("");
  const [estado, setEstado] = useState<EstadoSolicitud | "">("");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useListarSolicitudes({
    q: q.trim() || undefined,
    modalidad: modalidad || undefined,
    estado: estado || undefined,
    page,
    limit: 20,
  });

  const columnas: Columna<SolicitudResumen>[] = [
    {
      encabezado: "Código",
      celda: (s) => (
        <Link
          className="font-mono text-xs font-bold text-navy-800 hover:text-navy-950 hover:underline"
          params={{ id: s.id }}
          to="/solicitudes/$id"
        >
          {s.codigo}
        </Link>
      ),
    },
    {
      encabezado: "Fecha Recepción",
      celda: (s) => (
        <span className="text-xs text-grafito-600">
          {new Date(s.fechaHora).toLocaleDateString("es-PE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      encabezado: "Modalidad",
      celda: (s) => (
        <span className="inline-flex items-center rounded-lg bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-900 border border-navy-200/60">
          {etiquetaModalidad(s.modalidad)}
        </span>
      ),
    },
    {
      encabezado: "Participante(s)",
      celda: (s) => (
        <div className="text-xs max-w-xs">
          <p className="font-medium text-navy-950 truncate">{s.tesistaTitular.nombresCompletos}</p>
          <p className="text-[11px] font-mono text-grafito-500">DNI: {s.tesistaTitular.dni}</p>
          {s.coTesista && (
            <p className="text-[11px] text-grafito-600 truncate mt-0.5">
              Participante 2: {s.coTesista.nombresCompletos} ({s.coTesista.dni})
            </p>
          )}
        </div>
      ),
    },
    {
      encabezado: "Programa",
      celda: (s) => (
        <span className="text-xs text-grafito-700 max-w-xs truncate block" title={s.programa}>
          {s.programa}
        </span>
      ),
    },
    {
      encabezado: "Documentos",
      celda: (s) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            s.documentosConformes === s.totalDocumentos && s.totalDocumentos > 0
              ? "bg-verde-inst-100 text-verde-inst-700"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          {s.documentosConformes}/{s.totalDocumentos} conformes
        </span>
      ),
    },
    {
      encabezado: "Estado",
      celda: (s) => (
        <div className="flex flex-col gap-1 items-start">
          <StatusBadge estado={s.estado} />
          {s.esPlazoVencido && s.estado === "OBSERVADA" && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              Plazo Vencido
            </span>
          )}
        </div>
      ),
    },
    {
      encabezado: "Acción",
      clase: "text-right",
      celda: (s) => (
        <Link params={{ id: s.id }} to="/solicitudes/$id">
          <Button tamano="sm" variante="fantasma">
            <Eye size={14} /> Revisar
          </Button>
        </Link>
      ),
    },
  ];

  const kpis = data?.kpis ?? {
    nuevas: 0,
    enRevision: 0,
    expedientesCreados: 0,
    observadas: 0,
    tiempoPromedioEsperaHoras: 0,
  };

  return (
    <AppShell activo="/solicitudes">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
        <PageHeader
          acciones={
            <Button
              disabled={isFetching}
              onClick={() => void refetch()}
              tamano="sm"
              variante="contorno"
            >
              <RefreshCw className={isFetching ? "animate-spin" : ""} size={14} /> Actualizar
            </Button>
          }
          descripcion="Revisión de solicitudes de titulación remitidas desde la Mesa de Partes Virtual."
          titulo="Bandeja de Solicitudes"
        />

        {/* KPIs de Cabecera */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            acento="bg-blue-600"
            etiqueta="Nuevas"
            icono={<Inbox size={18} />}
            valor={kpis.nuevas}
          />
          <StatCard
            acento="bg-purple-600"
            etiqueta="En Revisión"
            icono={<Clock size={18} />}
            valor={kpis.enRevision}
          />
          <StatCard
            acento="bg-verde-inst-600"
            etiqueta="Expedientes Creados"
            icono={<CheckCircle size={18} />}
            valor={kpis.expedientesCreados}
          />
          <StatCard
            acento="bg-orange-500"
            etiqueta="Observadas"
            icono={<AlertTriangle size={18} />}
            valor={kpis.observadas}
          />
          <StatCard
            acento="bg-slate-600"
            etiqueta="Tiempo Promedio"
            icono={<Timer size={18} />}
            valor={`${kpis.tiempoPromedioEsperaHoras}h`}
          />
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <Card className="p-4 shadow-card">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="relative sm:col-span-2">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-grafito-400"
                size={16}
              />
              <input
                className="h-9 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-xs text-grafito-900 shadow-card placeholder:text-slate-400 focus:border-navy-800 focus:outline-none"
                placeholder="Buscar por código SOL, DNI o nombres de participante..."
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <Select
              value={modalidad}
              onChange={(v) => {
                setModalidad(v as Modalidad | "");
                setPage(1);
              }}
            >
              <option value="">Todas las Modalidades</option>
              <option value="TESIS">Tesis</option>
              <option value="TRABAJO_ACADEMICO">Trabajo Académico</option>
              <option value="ARTICULO">Artículo Indexado</option>
            </Select>

            <Select
              value={estado}
              onChange={(v) => {
                setEstado(v as EstadoSolicitud | "");
                setPage(1);
              }}
            >
              <option value="">Todos los Estados</option>
              <option value="NUEVA">NUEVA</option>
              <option value="EN_REVISION">EN REVISION</option>
              <option value="OBSERVADA">OBSERVADA</option>
              <option value="ACEPTADA">ACEPTADA</option>
              <option value="RECHAZADA">RECHAZADA</option>
            </Select>
          </div>
        </Card>

        {/* Tabla de Resultados */}
        <DataTable
          cargando={isLoading}
          columnas={columnas}
          filas={data?.items ?? []}
          vacio="No se encontraron solicitudes con los filtros seleccionados."
        />

        {/* Paginación */}
        {data && data.meta.total > 0 && (
          <div className="flex items-center justify-between text-xs text-grafito-600 px-1">
            <span>
              Mostrando {data.items.length} de {data.meta.total} solicitud(es)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                tamano="sm"
                variante="contorno"
              >
                Anterior
              </Button>
              <span className="px-2 font-semibold text-navy-950">Página {page}</span>
              <Button
                disabled={page * data.meta.limit >= data.meta.total}
                onClick={() => setPage((p) => p + 1)}
                tamano="sm"
                variante="contorno"
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
