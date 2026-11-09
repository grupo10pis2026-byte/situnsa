import { FileSpreadsheet, FileText, UserMinus, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type AlertaTallerDTO,
  descargarReporte,
  ETIQUETA_ALERTA,
  useAlertasTaller,
  useDescartarAlerta,
  useRegistrarRetiro,
  useReportesTaller,
} from "../api/alertas.js";
import { fechaLarga } from "../api/taller.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { DataTable } from "../components/ui/data-table.js";
import { Dialogo } from "../components/ui/dialog.js";
import { controlClase, Field } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { Select } from "../components/ui/select.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";
import { useToast } from "../components/ui/toast.js";
import { cn } from "../utils/cn.js";

/**
 * P12 Alertas, retiros y reportes (spec v1.0 §9): la Secretaría atiende las
 * alertas (registra el retiro o la descarta con motivo) y descarga los
 * reportes a la Unidad en PDF o Excel.
 */

function mensaje(e: unknown) {
  return e instanceof Error ? e.message : "Ocurrió un error";
}

type Dialogos = { tipo: "retiro" | "descartar"; alerta: AlertaTallerDTO } | null;

export function ReportesTallerPage() {
  const [tab, setTab] = useState("alertas");
  const [tallerId, setTallerId] = useState("");
  const [estado, setEstado] = useState("ACTIVA");
  const alertas = useAlertasTaller({
    ...(tallerId ? { tallerId } : {}),
    ...(estado ? { estado } : {}),
  });
  const talleres = alertas.data?.talleres ?? [];
  const [tallerReportes, setTallerReportes] = useState<string | null>(null);
  useEffect(() => {
    if (tallerReportes === null && talleres[0]) setTallerReportes(talleres[0].id);
  }, [talleres, tallerReportes]);
  const reportes = useReportesTaller(tallerId || tallerReportes);
  const [dialogo, setDialogo] = useState<Dialogos>(null);
  const toast = useToast();

  return (
    <AppShell activo="/reportes-taller">
      <PageHeader
        titulo="Alertas y reportes"
        descripcion="Alertas por faltas o entregas no presentadas, retiros y reportes del Taller de Tesis a la Unidad."
      />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Select label="Taller" value={tallerId} onChange={setTallerId}>
          <option value="">Todos</option>
          {talleres.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </Select>
      </Card>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsLista>
          <Tab value="alertas">
            Alertas{alertas.data ? ` (${alertas.data.activas} activas)` : ""}
          </Tab>
          <Tab value="reportes">Reportes</Tab>
        </TabsLista>
        <TabPanel value="alertas">
          <Card>
            <CardEncabezado
              titulo="Alertas"
              accion={
                <Select ariaLabel="Estado" value={estado} onChange={setEstado}>
                  <option value="ACTIVA">Activas</option>
                  <option value="ATENDIDA">Atendidas</option>
                  <option value="DESCARTADA">Descartadas</option>
                  <option value="">Todas</option>
                </Select>
              }
            />
            <div className="p-4 md:p-5">
              <DataTable
                cargando={alertas.isPending}
                vacio="No hay alertas."
                filas={alertas.data?.items ?? []}
                columnas={[
                  {
                    encabezado: "Alerta",
                    celda: (a) => (
                      <span>
                        <strong>{ETIQUETA_ALERTA[a.tipo]}</strong>
                        <span className="block text-xs text-grafito-600">
                          {a.detalle}
                          {a.hito ? ` · ${a.hito}` : ""}
                        </span>
                      </span>
                    ),
                  },
                  {
                    encabezado: "Alumno",
                    celda: (a) => (
                      <span>
                        {a.alumno ?? "—"}
                        <span className="block text-xs text-grafito-600">
                          {a.taller}
                          {a.proyecto ? ` · ${a.proyecto}` : ""}
                        </span>
                      </span>
                    ),
                  },
                  {
                    encabezado: "Fecha",
                    celda: (a) => new Date(a.creadaAt).toLocaleDateString("es-PE"),
                  },
                  {
                    encabezado: "Estado",
                    celda: (a) => (
                      <span>
                        <StatusBadge
                          estado={a.estado}
                          etiqueta={
                            a.estado === "ACTIVA"
                              ? "Activa"
                              : a.estado === "ATENDIDA"
                                ? "Atendida"
                                : "Descartada"
                          }
                        />
                        {a.motivoDescarte && (
                          <span className="mt-0.5 block text-xs text-grafito-600">
                            {a.motivoDescarte}
                          </span>
                        )}
                      </span>
                    ),
                  },
                  {
                    encabezado: "Acciones",
                    clase: "text-right",
                    celda: (a) =>
                      a.estado === "ACTIVA" ? (
                        <span className="flex justify-end gap-1.5">
                          {a.alumnoId && !a.retirado && (
                            <Button
                              tamano="xs"
                              variante="peligro"
                              type="button"
                              onClick={() => setDialogo({ tipo: "retiro", alerta: a })}
                            >
                              <UserMinus size={13} />
                              Registrar retiro
                            </Button>
                          )}
                          <Button
                            tamano="xs"
                            variante="contorno"
                            type="button"
                            onClick={() => setDialogo({ tipo: "descartar", alerta: a })}
                          >
                            <XCircle size={13} />
                            Descartar
                          </Button>
                        </span>
                      ) : null,
                  },
                ]}
              />
            </div>
          </Card>
        </TabPanel>
        <TabPanel value="reportes">
          <Card>
            <CardEncabezado
              titulo={reportes.data ? `Reportes · ${reportes.data.taller}` : "Reportes"}
              descripcion="Se generan el lunes siguiente a cada hito: semana 2, quincenales y cierre."
              accion={
                !tallerId ? (
                  <Select
                    ariaLabel="Taller del reporte"
                    value={tallerReportes ?? ""}
                    onChange={setTallerReportes}
                  >
                    {talleres.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </Select>
                ) : null
              }
            />
            <div className="p-4 md:p-5">
              <DataTable
                cargando={reportes.isPending}
                vacio="Elige un taller."
                filas={(reportes.data?.reportes ?? []).map((r) => ({
                  ...r,
                  id: `${r.tipo}-${r.hito}`,
                }))}
                columnas={[
                  { encabezado: "Reporte", celda: (r) => <strong>{r.nombre}</strong> },
                  { encabezado: "Fecha", celda: (r) => fechaLarga(r.fecha) },
                  {
                    encabezado: "Estado",
                    celda: (r) => (
                      <StatusBadge
                        estado={r.disponible ? "ACTIVO" : "PROGRAMADA"}
                        etiqueta={r.disponible ? "Disponible" : "Programado"}
                      />
                    ),
                  },
                  {
                    encabezado: "Descargar",
                    clase: "text-right",
                    celda: (r) => {
                      const id = reportes.data?.tallerId;
                      if (!id) return null;
                      return (
                        <span className="flex justify-end gap-1.5">
                          <Button
                            tamano="xs"
                            variante="contorno"
                            type="button"
                            onClick={() =>
                              descargarReporte(id, r.hito, "pdf").catch((e: unknown) =>
                                toast(mensaje(e), "error"),
                              )
                            }
                          >
                            <FileText size={13} />
                            PDF
                          </Button>
                          <Button
                            tamano="xs"
                            variante="contorno"
                            type="button"
                            onClick={() =>
                              descargarReporte(id, r.hito, "xlsx").catch((e: unknown) =>
                                toast(mensaje(e), "error"),
                              )
                            }
                          >
                            <FileSpreadsheet size={13} />
                            Excel
                          </Button>
                        </span>
                      );
                    },
                  },
                ]}
              />
            </div>
          </Card>
        </TabPanel>
      </Tabs>
      {dialogo && <AlertaDialogo d={dialogo} onCerrar={() => setDialogo(null)} />}
    </AppShell>
  );
}

function AlertaDialogo({ d, onCerrar }: { d: NonNullable<Dialogos>; onCerrar: () => void }) {
  const retiro = useRegistrarRetiro();
  const descartar = useDescartarAlerta();
  const toast = useToast();
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
  );
  const esRetiro = d.tipo === "retiro";
  const pendiente = retiro.isPending || descartar.isPending;
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={esRetiro ? `Registrar retiro de ${d.alerta.alumno ?? ""}` : "Descartar alerta"}
      descripcion={
        esRetiro
          ? "El alumno queda RETIRADO (solo lectura) y se le avisa por correo. No se puede deshacer."
          : ETIQUETA_ALERTA[d.alerta.tipo]
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const listo = {
            onSuccess: () => {
              toast(esRetiro ? "Retiro registrado" : "Alerta descartada", "ok");
              onCerrar();
            },
            onError: (err: unknown) => toast(mensaje(err), "error"),
          };
          if (esRetiro && d.alerta.alumnoId)
            retiro.mutate(
              {
                tallerId: d.alerta.tallerId,
                datos: { alumnoId: d.alerta.alumnoId, motivo, fecha, alertaId: d.alerta.id },
              },
              listo,
            );
          else descartar.mutate({ id: d.alerta.id, motivo }, listo);
        }}
      >
        {esRetiro && (
          <Field etiqueta="Fecha del retiro">
            <input
              type="date"
              className={controlClase}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </Field>
        )}
        <Field etiqueta="Motivo">
          <textarea
            className={cn(controlClase, "min-h-24")}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variante={esRetiro ? "peligro" : "primario"}
            type="submit"
            disabled={pendiente || motivo.trim() === ""}
          >
            {esRetiro ? "Registrar retiro" : "Descartar"}
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
