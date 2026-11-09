import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarDays,
  ExternalLink,
  MessageSquareHeart,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useMiTaller } from "../api/mi-taller.js";
import { fechaLarga } from "../api/taller.js";
import { CierreProyecto, FichaProyecto } from "../components/domain/taller-ficha.js";
import { EntregasProyecto, PlanTallerCard } from "../components/domain/taller-hitos.js";
import { AppShell } from "../components/layout/app-shell.js";
import { botonClases } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { DataTable } from "../components/ui/data-table.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { PageHeader } from "../components/ui/page-header.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";

/**
 * P7 Mi Taller (spec v1.0 §9): próxima sesión con su enlace, asistencia con
 * el aviso rojo, plan del taller, entregas por hito, ficha y pensiones. Un
 * alumno retirado ve todo en solo lectura.
 */

const ETIQUETA_MARCA: Record<string, string> = {
  PRESENTE: "Presente",
  FALTA: "Falta",
  JUSTIFICADA: "Justificada",
  PENDIENTE: "Pendiente",
};

export function MiTallerPage() {
  const q = useMiTaller();
  const [tab, setTab] = useState("entregas");
  const d = q.data;
  return (
    <AppShell activo="/mi-taller">
      <PageHeader
        titulo="Mi Taller"
        descripcion={
          d?.taller
            ? `${d.taller.nombre}${d.proyecto ? ` · proyecto ${d.proyecto.codigo}` : ""}`
            : "Taller de Tesis"
        }
        insignia={d?.estadoTesista ? <StatusBadge estado={d.estadoTesista} /> : undefined}
      />
      {q.isPending ? (
        <Card className="p-5 text-sm text-grafito-600">Cargando…</Card>
      ) : !d?.taller || !d.proyecto ? (
        <EmptyState
          titulo="Aún no estás en un taller"
          descripcion="Cuando validen tu inscripción y te asignen a un taller lo verás aquí."
        />
      ) : (
        <div className="space-y-4">
          {d.estadoTesista === "RETIRADO" && (
            <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">
              Fuiste retirado del taller: tu información queda en solo lectura.
            </p>
          )}
          {d.asistencia.aviso && (
            <p className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">
              <AlertTriangle size={16} />
              {d.asistencia.aviso}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-grafito-600">
                <CalendarDays size={14} />
                Próxima sesión
              </p>
              {d.proximaSesion ? (
                <>
                  <p className="mt-1 font-bold text-navy-950">
                    Sesión {d.proximaSesion.nro} · {fechaLarga(d.proximaSesion.fecha)}
                  </p>
                  <p className="text-sm">
                    {d.proximaSesion.horaInicio}–{d.proximaSesion.horaFin}
                    {d.proyecto.grupo ? ` · ${d.proyecto.grupo}` : ""}
                  </p>
                  {d.proximaSesion.enlace && (
                    <a
                      href={d.proximaSesion.enlace}
                      target="_blank"
                      rel="noreferrer"
                      className={botonClases({ tamano: "sm", className: "mt-2" })}
                    >
                      <ExternalLink size={14} />
                      Entrar a la reunión
                    </a>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-grafito-600">No hay sesiones programadas.</p>
              )}
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase text-grafito-600">Mi asistencia</p>
              <p className="mt-1 text-3xl font-bold text-navy-950">
                {d.asistencia.porcentaje === null ? "—" : `${d.asistencia.porcentaje} %`}
              </p>
              <p className="text-sm text-grafito-600">
                {d.asistencia.realizadas} sesiones realizadas
              </p>
            </Card>
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-grafito-600">
                <Wallet size={14} />
                Pensiones
              </p>
              <p className="mt-1 text-3xl font-bold text-navy-950">
                {d.pensiones.pagadas} de {d.pensiones.total}
              </p>
              {d.pensiones.conDeuda > 0 && (
                <p className="text-sm font-semibold text-red-700">
                  Tienes {d.pensiones.conDeuda} con deuda
                </p>
              )}
              <Link to="/mis-pagos" className="text-sm text-navy-800 underline">
                Ver Mis pagos
              </Link>
            </Card>
          </div>
          <p className="text-sm text-grafito-600">
            Asesor: <strong>{d.taller.asesor ?? "—"}</strong>
            {d.taller.asesorEmail && ` (${d.taller.asesorEmail})`} ·{" "}
            <Link to="/encuesta" className="inline-flex items-center gap-1 text-navy-800 underline">
              <MessageSquareHeart size={13} />
              Encuesta sobre tu asesor
            </Link>
          </p>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsLista>
              <Tab value="entregas">Mis entregas</Tab>
              <Tab value="sesiones">Sesiones y asistencia</Tab>
              <Tab value="plan">Plan del taller</Tab>
              <Tab value="ficha">Ficha de control</Tab>
              <Tab value="cierre">Cierre</Tab>
            </TabsLista>
            <TabPanel value="entregas">
              <EntregasProyecto proyectoId={d.proyecto.id} />
            </TabPanel>
            <TabPanel value="sesiones">
              <Card>
                <CardEncabezado
                  titulo="Sesiones"
                  descripcion="La asistencia la registra tu asesor."
                />
                <div className="p-4 md:p-5">
                  <DataTable
                    vacio="Sin sesiones."
                    filas={d.sesiones}
                    columnas={[
                      {
                        encabezado: "N°",
                        celda: (s) => <strong className="tabular-nums">{s.nro}</strong>,
                      },
                      { encabezado: "Fecha", celda: (s) => fechaLarga(s.fecha) },
                      { encabezado: "Hora", celda: (s) => `${s.horaInicio}–${s.horaFin}` },
                      {
                        encabezado: "Sesión",
                        celda: (s) => (
                          <span>
                            <StatusBadge estado={s.estado} />
                            {s.motivo && s.estado !== "PROGRAMADA" && (
                              <span className="block text-xs text-grafito-600">{s.motivo}</span>
                            )}
                          </span>
                        ),
                      },
                      {
                        encabezado: "Mi asistencia",
                        celda: (s) =>
                          s.marca ? (
                            <StatusBadge estado={s.marca} etiqueta={ETIQUETA_MARCA[s.marca]} />
                          ) : (
                            "—"
                          ),
                      },
                    ]}
                  />
                </div>
              </Card>
            </TabPanel>
            <TabPanel value="plan">
              <PlanTallerCard tallerId={d.taller.id} />
            </TabPanel>
            <TabPanel value="ficha">
              <FichaProyecto proyectoId={d.proyecto.id} />
            </TabPanel>
            <TabPanel value="cierre">
              <CierreProyecto proyectoId={d.proyecto.id} />
            </TabPanel>
          </Tabs>
        </div>
      )}
    </AppShell>
  );
}
