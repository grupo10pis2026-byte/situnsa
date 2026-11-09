import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useAsesores } from "../api/asesores.js";
import { diaMes, ETIQUETA_ESTADO_TALLER, type TallerDTO, useTalleres } from "../api/taller.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button, botonClases } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { DataTable } from "../components/ui/data-table.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { StatusBadge } from "../components/ui/status-badge.js";

/**
 * P1 Lista de talleres (spec v1.0 §9): filtros combinables (período, estado
 * y asesor) y tabla con proyectos asignados sobre el cupo y sesiones
 * realizadas. Aquí no se edita ni elimina nada: Ver abre el detalle (P3).
 */

const CORTO = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** "Sáb y Dom" (spec P1: días; el horario va en el detalle). */
function textoDias(t: TallerDTO): string {
  if (t.dias.length === 0) return "—";
  const nombres = t.dias.map((d) => CORTO[d.dia] ?? "");
  return nombres.length === 1
    ? (nombres[0] ?? "")
    : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
}

export function TalleresPage() {
  const [periodo, setPeriodo] = useState("");
  const [estado, setEstado] = useState("");
  const [asesorDni, setAsesorDni] = useState("");
  const query = useTalleres({
    ...(periodo ? { periodo } : {}),
    ...(estado ? { estado } : {}),
    ...(asesorDni ? { asesorDni } : {}),
  });
  const todos = useTalleres({});
  const asesores = useAsesores();
  const items = query.data?.items ?? [];
  const periodos: string[] = [
    ...new Set(
      (todos.data?.items ?? []).map((t) => t.periodo).filter((p): p is string => p !== null),
    ),
  ].sort();
  const conFiltros = periodo !== "" || estado !== "" || asesorDni !== "";

  return (
    <AppShell activo="/talleres">
      <PageHeader
        titulo="Talleres de Tesis"
        descripcion="Cada taller es un grupo de proyectos con un asesor. Se cierra a inscripciones al llegar al cupo."
        acciones={
          <Link className={botonClases({ variante: "exito" })} to="/talleres/nuevo">
            <Plus size={16} />
            NUEVO TALLER
          </Link>
        }
      />
      <Card>
        <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end md:p-5">
          <Select label="PERÍODO" value={periodo} onChange={setPeriodo}>
            <option value="">Todos</option>
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Select label="ESTADO" value={estado} onChange={setEstado}>
            <option value="">Todos</option>
            {Object.entries(ETIQUETA_ESTADO_TALLER).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Select>
          <Select label="ASESOR" value={asesorDni} onChange={setAsesorDni}>
            <option value="">Todos</option>
            {(asesores.data ?? []).map((a) => (
              <option key={a.id} value={a.dni}>
                {a.nombres} {a.apellidos}
              </option>
            ))}
          </Select>
          <Button
            variante="fantasma"
            disabled={!conFiltros}
            onClick={() => {
              setPeriodo("");
              setEstado("");
              setAsesorDni("");
            }}
            type="button"
          >
            Quitar filtros
          </Button>
        </div>
      </Card>
      {items.length === 0 && !query.isPending ? (
        conFiltros ? (
          <EmptyState
            titulo="Sin resultados"
            descripcion="Ajusta los filtros para ver más talleres."
          />
        ) : (
          <EmptyState
            titulo="Aún no hay talleres. Crea el primero"
            accion={
              <Link className={botonClases({ variante: "oscuro" })} to="/talleres/nuevo">
                <Plus size={16} />
                Nuevo taller
              </Link>
            }
          />
        )
      ) : (
        <DataTable
          cargando={query.isPending}
          vacio="No existen talleres registrados."
          columnas={[
            { encabezado: "Taller", celda: (t) => <strong>{t.nombre}</strong> },
            { encabezado: "Asesor", celda: (t) => t.asesorNombre ?? "—" },
            { encabezado: "Período", celda: (t) => t.periodo ?? "—" },
            { encabezado: "Días", celda: (t) => textoDias(t) },
            {
              encabezado: "Inicio - fin",
              celda: (t) =>
                t.fechaInicio
                  ? `${diaMes(t.fechaInicio)} - ${t.fechaFin ? diaMes(t.fechaFin) : "—"}`
                  : "—",
            },
            {
              encabezado: "Proyectos",
              celda: (t) => (
                <span className="tabular-nums">
                  {t.proyectos}/{t.cupoProyectos}
                </span>
              ),
            },
            {
              encabezado: "Sesiones",
              celda: (t) => (
                <span className="tabular-nums">
                  {t.sesiones.realizadas}/{t.sesiones.total}
                </span>
              ),
            },
            {
              encabezado: "Estado",
              celda: (t) => (
                <StatusBadge estado={t.estado} etiqueta={ETIQUETA_ESTADO_TALLER[t.estado]} />
              ),
            },
            {
              encabezado: "Acciones",
              celda: (t) => (
                <Link
                  aria-label={`Ver ${t.nombre}`}
                  className={botonClases({ variante: "contorno", tamano: "sm" })}
                  to="/taller/$id"
                  params={{ id: t.id }}
                >
                  Ver
                </Link>
              ),
            },
          ]}
          filas={items}
        />
      )}
    </AppShell>
  );
}
