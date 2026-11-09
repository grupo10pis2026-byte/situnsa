import { AlertTriangle, CalendarPlus, ClipboardCheck, Eye, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "../../api/errores.js";
import {
  type AsistenciaSesionDTO,
  fechaLarga,
  type SesionesTallerDTO,
  useAsistenciaSesion,
  useGuardarAsistencia,
  useGuardarGrupo,
  useProgramarSesion,
  useSesionesTaller,
} from "../../api/taller.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Card, CardEncabezado } from "../ui/card.js";
import { DataTable } from "../ui/data-table.js";
import { Dialogo } from "../ui/dialog.js";
import { EmptyState } from "../ui/empty-state.js";
import { controlClase, Field } from "../ui/field.js";
import { StatusBadge } from "../ui/status-badge.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../ui/tabs.js";
import { useToast } from "../ui/toast.js";

/**
 * P4 Sesiones y asistencia y P5 grupos de horario (spec v1.0 §9). El asesor
 * registra la asistencia por grupo (por defecto todos Presente); corregir o
 * justificar una marca guardada exige motivo. La Secretaría consulta y corrige.
 */

type Sesion = SesionesTallerDTO["sesiones"][number];
type Marca = "PRESENTE" | "FALTA" | "JUSTIFICADA";

const ETIQUETA_SESION: Record<string, string> = {
  PROGRAMADA: "Programada",
  REPROGRAMADA: "Reprogramada",
  REALIZADA: "Realizada",
  CANCELADA: "Cancelada",
};

export function SesionesPanel({
  tallerId,
  modo,
  sesionInicial,
}: {
  tallerId: string;
  modo: "asesor" | "secretaria";
  /** P5 "Registrar asistencia": abre directamente esta sesión. */
  sesionInicial?: string | null;
}) {
  const q = useSesionesTaller(tallerId);
  const [abierta, setAbierta] = useState<string | null>(sesionInicial ?? null);
  const [d2, setD2] = useState<Sesion | null>(null);
  const [extra, setExtra] = useState(false);
  useEffect(() => {
    if (sesionInicial) setAbierta(sesionInicial);
  }, [sesionInicial]);
  const datos = q.data;

  return (
    <Card>
      <CardEncabezado
        titulo="Sesiones y asistencia"
        descripcion={
          datos
            ? `Quedan ${datos.restantes} sesiones de ${datos.total}. La asistencia la marca el asesor por grupo de horario; el alumno no la marca.`
            : undefined
        }
        accion={
          datos?.puedeProgramar ? (
            <Button tamano="sm" variante="contorno" onClick={() => setExtra(true)} type="button">
              <CalendarPlus size={14} />
              Agregar sesión extra
            </Button>
          ) : null
        }
      />
      <div className="p-4 md:p-5">
        <DataTable
          cargando={q.isPending}
          vacio="El taller no tiene sesiones."
          columnas={[
            { encabezado: "N°", celda: (s) => <strong className="tabular-nums">{s.nro}</strong> },
            {
              encabezado: "Fecha",
              celda: (s) => (
                <span>
                  {fechaLarga(s.fecha)}
                  {s.fechaOriginal && (
                    <span className="block text-xs text-grafito-600">
                      Antes: {fechaLarga(s.fechaOriginal)}
                    </span>
                  )}
                </span>
              ),
            },
            { encabezado: "Hora", celda: (s) => `${s.horaInicio}–${s.horaFin}` },
            {
              encabezado: "Estado",
              celda: (s) => (
                <span>
                  <StatusBadge estado={s.estado} etiqueta={ETIQUETA_SESION[s.estado]} />
                  {s.motivo && s.estado !== "PROGRAMADA" && (
                    <span className="mt-0.5 block max-w-[220px] text-xs text-grafito-600">
                      {s.motivo}
                    </span>
                  )}
                </span>
              ),
            },
            {
              encabezado: "Acciones",
              clase: "text-right",
              celda: (s) => (
                <span className="flex flex-wrap justify-end gap-1.5">
                  {s.estado !== "CANCELADA" &&
                    (s.motivoNoRegistrar === null &&
                    (datos?.puedeRegistrar || s.estado === "REALIZADA") ? (
                      <Button
                        tamano="xs"
                        variante={s.estado === "REALIZADA" ? "contorno" : "oscuro"}
                        onClick={() => setAbierta(s.id)}
                        type="button"
                      >
                        {s.estado === "REALIZADA" ? (
                          <Eye size={13} />
                        ) : (
                          <ClipboardCheck size={13} />
                        )}
                        {s.estado === "REALIZADA"
                          ? modo === "asesor"
                            ? "Ver o corregir"
                            : "Ver o corregir"
                          : "Registrar asistencia"}
                      </Button>
                    ) : (
                      <span className="self-center text-xs text-grafito-600">
                        {s.motivoNoRegistrar ?? "Lo registra el asesor"}
                      </span>
                    ))}
                  {datos?.puedeProgramar &&
                    (s.estado === "PROGRAMADA" || s.estado === "REPROGRAMADA") && (
                      <Button
                        tamano="xs"
                        variante="fantasma"
                        onClick={() => setD2(s)}
                        type="button"
                      >
                        Reprogramar o cancelar
                      </Button>
                    )}
                </span>
              ),
            },
          ]}
          filas={datos?.sesiones ?? []}
        />
      </div>
      {abierta && (
        <AsistenciaDialogo
          sesionId={abierta}
          tallerId={tallerId}
          puedeRegistrar={datos?.puedeRegistrar ?? false}
          onCerrar={() => setAbierta(null)}
        />
      )}
      {d2 && <D2Dialogo sesion={d2} tallerId={tallerId} onCerrar={() => setD2(null)} />}
      {extra && <SesionExtraDialogo tallerId={tallerId} onCerrar={() => setExtra(false)} />}
    </Card>
  );
}

function AsistenciaDialogo({
  sesionId,
  tallerId,
  puedeRegistrar,
  onCerrar,
}: {
  sesionId: string;
  tallerId: string;
  puedeRegistrar: boolean;
  onCerrar: () => void;
}) {
  const q = useAsistenciaSesion(sesionId);
  const [grupo, setGrupo] = useState<string>("");
  const datos = q.data;
  const grupos = datos?.grupos ?? [];
  const actual = grupo || (grupos[0] ? (grupos[0].id ?? "sin") : "");

  return (
    <Dialogo
      abierto
      onAbierto={(v) => {
        if (!v) onCerrar();
      }}
      titulo={datos ? `Asistencia · sesión ${datos.sesion.nro}` : "Asistencia"}
      descripcion={
        datos
          ? `${fechaLarga(datos.sesion.fecha)} · ${datos.sesion.horaInicio}–${datos.sesion.horaFin}`
          : undefined
      }
      ancho="max-w-3xl"
    >
      {q.isPending ? (
        <p className="mt-4 text-sm text-grafito-600">Cargando…</p>
      ) : grupos.length === 0 ? (
        <EmptyState titulo="No hay alumnos en el taller" />
      ) : (
        <Tabs value={actual} onValueChange={setGrupo} className="mt-3">
          <TabsLista>
            {grupos.map((g) => (
              <Tab
                key={g.id ?? "sin"}
                value={g.id ?? "sin"}
                contador={g.guardado ? "✓" : undefined}
              >
                {g.nombre}
              </Tab>
            ))}
          </TabsLista>
          {grupos.map((g) => (
            <TabPanel key={g.id ?? "sin"} value={g.id ?? "sin"}>
              <GrupoAsistencia
                sesionId={sesionId}
                tallerId={tallerId}
                grupo={g}
                puedeRegistrar={puedeRegistrar}
                alertas={datos?.alertas ?? []}
              />
            </TabPanel>
          ))}
        </Tabs>
      )}
    </Dialogo>
  );
}

function GrupoAsistencia({
  sesionId,
  tallerId,
  grupo,
  puedeRegistrar,
  alertas,
}: {
  sesionId: string;
  tallerId: string;
  grupo: AsistenciaSesionDTO["grupos"][number];
  puedeRegistrar: boolean;
  alertas: string[];
}) {
  const avisar = useToast();
  const guardar = useGuardarAsistencia(sesionId, tallerId);
  // (propuesta) todos aparecen en Presente por defecto; el asesor cambia a quien falte.
  const inicial = () =>
    Object.fromEntries(
      grupo.alumnos.map((a) => [a.alumnoId, a.estado === "PENDIENTE" ? "PRESENTE" : a.estado]),
    ) as Record<string, Marca>;
  const [marcas, setMarcas] = useState<Record<string, Marca>>(inicial);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});
  const pendientes = grupo.alumnos.some((a) => a.estado === "PENDIENTE");
  const bloqueado = pendientes && !puedeRegistrar;

  async function confirmar(): Promise<void> {
    const faltanMotivo = grupo.alumnos.filter(
      (a) =>
        a.estado !== "PENDIENTE" &&
        a.estado !== marcas[a.alumnoId] &&
        !(motivos[a.alumnoId] ?? "").trim(),
    );
    if (faltanMotivo.length > 0) {
      setErrores(
        Object.fromEntries(
          faltanMotivo.map((a) => [`motivo.${a.alumnoId}`, "Escribe el motivo del cambio"]),
        ),
      );
      return;
    }
    try {
      const r = await guardar.mutateAsync({
        grupoId: grupo.id,
        marcas: grupo.alumnos.map((a) => ({
          alumnoId: a.alumnoId,
          estado: marcas[a.alumnoId] ?? "PRESENTE",
          motivo: motivos[a.alumnoId]?.trim() || null,
        })),
      });
      setMotivos({});
      setErrores({});
      avisar(
        r.sesion.estado === "REALIZADA"
          ? `Asistencia guardada. La sesión ${r.sesion.nro} quedó realizada`
          : "Asistencia del grupo guardada",
      );
    } catch (e) {
      if (e instanceof ApiError) setErrores(e.campos);
      avisar(e instanceof Error ? e.message : "No se pudo guardar", "error");
    }
  }

  return (
    <div className="space-y-3">
      {alertas.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {alertas.join(", ")} {alertas.length === 1 ? "llegó" : "llegaron"} a 2 faltas
          consecutivas: se generó una alerta para la Unidad y se le avisó por correo.
        </p>
      )}
      {bloqueado && (
        <p className="text-sm text-grafito-600">
          La asistencia de este grupo aún no se registra: lo hace el asesor.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="bg-navy-950 text-[11px] font-bold tracking-wider text-white uppercase">
              <th className="px-3 py-2">Alumno</th>
              <th className="px-3 py-2">Asistencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {grupo.alumnos.map((a) => {
              const cambia = a.estado !== "PENDIENTE" && a.estado !== marcas[a.alumnoId];
              const error = errores[`motivo.${a.alumnoId}`];
              return (
                <tr key={a.alumnoId}>
                  <td className="px-3 py-2">
                    {a.nombre}
                    <span className="block text-xs text-grafito-600">
                      {a.proyecto}
                      {a.marcadaAt && ` · marcada ${new Date(a.marcadaAt).toLocaleString("es-PE")}`}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Asistencia de ${a.nombre}`}
                      className={cn(controlClase, "h-9 w-40")}
                      disabled={bloqueado}
                      value={marcas[a.alumnoId]}
                      onChange={(e) => {
                        setMarcas((m) => ({ ...m, [a.alumnoId]: e.target.value as Marca }));
                        setErrores((x) => ({ ...x, [`motivo.${a.alumnoId}`]: undefined }));
                      }}
                    >
                      <option value="PRESENTE">Presente</option>
                      <option value="FALTA">Falta</option>
                      <option value="JUSTIFICADA">Justificada</option>
                    </select>
                    {(cambia ||
                      (marcas[a.alumnoId] === "JUSTIFICADA" && a.estado === "PENDIENTE")) && (
                      <input
                        aria-label={`Motivo del cambio de ${a.nombre}`}
                        className={cn(
                          controlClase,
                          "mt-1.5 h-8 text-sm",
                          error && "border-red-400",
                        )}
                        placeholder={cambia ? "Motivo del cambio *" : "Motivo (opcional)"}
                        value={motivos[a.alumnoId] ?? ""}
                        onChange={(e) => {
                          setMotivos((m) => ({ ...m, [a.alumnoId]: e.target.value }));
                          setErrores((x) => ({ ...x, [`motivo.${a.alumnoId}`]: undefined }));
                        }}
                      />
                    )}
                    {a.motivo && !cambia && (
                      <span className="mt-1 block text-xs text-grafito-600">
                        Motivo: {a.motivo}
                      </span>
                    )}
                    {error && (
                      <span className="mt-1 block text-xs font-medium text-red-700">{error}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button
          variante="oscuro"
          disabled={bloqueado || guardar.isPending}
          onClick={() => void confirmar()}
          type="button"
        >
          Guardar asistencia
        </Button>
      </div>
    </div>
  );
}

function D2Dialogo({
  sesion,
  tallerId,
  onCerrar,
}: {
  sesion: Sesion;
  tallerId: string;
  onCerrar: () => void;
}) {
  const avisar = useToast();
  const programar = useProgramarSesion(tallerId);
  const [modo, setModo] = useState<"reprogramar" | "cancelar">("reprogramar");
  const [f, setF] = useState({
    fecha: sesion.fecha,
    horaInicio: sesion.horaInicio,
    horaFin: sesion.horaFin,
    motivo: "",
  });
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});

  async function confirmar(): Promise<void> {
    if (f.motivo.trim().length < 3) {
      setErrores({ motivo: "Escribe el motivo" });
      return;
    }
    try {
      if (modo === "reprogramar")
        await programar.mutateAsync({ tipo: "reprogramar", sesionId: sesion.id, datos: f });
      else await programar.mutateAsync({ tipo: "cancelar", sesionId: sesion.id, motivo: f.motivo });
      avisar(
        modo === "reprogramar"
          ? `Sesión ${sesion.nro} reprogramada`
          : `Sesión ${sesion.nro} cancelada`,
      );
      onCerrar();
    } catch (e) {
      if (e instanceof ApiError) setErrores(e.campos);
      avisar(e instanceof Error ? e.message : "No se pudo guardar", "error");
    }
  }

  return (
    <Dialogo
      abierto
      onAbierto={(v) => {
        if (!v) onCerrar();
      }}
      titulo={`Sesión ${sesion.nro} · ${fechaLarga(sesion.fecha)}`}
      descripcion="Se avisa a los alumnos y al asesor, y todo queda en el historial."
    >
      <div className="mt-4 space-y-3">
        <div className="flex gap-2">
          <Button
            tamano="sm"
            variante={modo === "reprogramar" ? "oscuro" : "contorno"}
            onClick={() => setModo("reprogramar")}
            type="button"
          >
            Reprogramar
          </Button>
          <Button
            tamano="sm"
            variante={modo === "cancelar" ? "peligro" : "contorno"}
            onClick={() => setModo("cancelar")}
            type="button"
          >
            Cancelar sesión
          </Button>
        </div>
        {modo === "reprogramar" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field etiqueta="Nueva fecha *" error={errores.fecha}>
              <input
                aria-label="Nueva fecha"
                className={cn(controlClase, "h-10")}
                type="date"
                value={f.fecha}
                onChange={(e) => setF({ ...f, fecha: e.target.value })}
              />
            </Field>
            <Field etiqueta="Desde" error={errores.hora}>
              <input
                aria-label="Hora de inicio"
                className={cn(controlClase, "h-10")}
                type="time"
                value={f.horaInicio}
                onChange={(e) => setF({ ...f, horaInicio: e.target.value })}
              />
            </Field>
            <Field etiqueta="Hasta">
              <input
                aria-label="Hora de fin"
                className={cn(controlClase, "h-10")}
                type="time"
                value={f.horaFin}
                onChange={(e) => setF({ ...f, horaFin: e.target.value })}
              />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-grafito-600">
            La sesión cancelada no admite asistencia y no cuenta para el porcentaje.
          </p>
        )}
        <Field etiqueta="Motivo *" error={errores.motivo}>
          <textarea
            aria-label="Motivo"
            className={cn(controlClase, "min-h-16", errores.motivo && "border-red-400")}
            value={f.motivo}
            onChange={(e) => {
              setF({ ...f, motivo: e.target.value });
              setErrores({});
            }}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" onClick={onCerrar} type="button">
            Volver
          </Button>
          <Button
            variante={modo === "cancelar" ? "peligro" : "oscuro"}
            disabled={programar.isPending}
            onClick={() => void confirmar()}
            type="button"
          >
            {modo === "reprogramar" ? "Reprogramar" : "Cancelar sesión"}
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}

function SesionExtraDialogo({ tallerId, onCerrar }: { tallerId: string; onCerrar: () => void }) {
  const avisar = useToast();
  const programar = useProgramarSesion(tallerId);
  const [f, setF] = useState({ fecha: "", horaInicio: "15:00", horaFin: "20:00", motivo: "" });
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});

  async function confirmar(): Promise<void> {
    try {
      await programar.mutateAsync({ tipo: "agregar", datos: f });
      avisar("Sesión extra agregada al final del calendario");
      onCerrar();
    } catch (e) {
      if (e instanceof ApiError) setErrores(e.campos);
      avisar(e instanceof Error ? e.message : "No se pudo agregar", "error");
    }
  }

  return (
    <Dialogo
      abierto
      onAbierto={(v) => {
        if (!v) onCerrar();
      }}
      titulo="Agregar sesión extra"
      descripcion="Se agrega con el siguiente número, programada, y se avisa a los alumnos."
    >
      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field etiqueta="Fecha *" error={errores.fecha}>
            <input
              aria-label="Fecha de la sesión extra"
              className={cn(controlClase, "h-10")}
              type="date"
              value={f.fecha}
              onChange={(e) => setF({ ...f, fecha: e.target.value })}
            />
          </Field>
          <Field etiqueta="Desde" error={errores.hora}>
            <input
              aria-label="Hora de inicio de la sesión extra"
              className={cn(controlClase, "h-10")}
              type="time"
              value={f.horaInicio}
              onChange={(e) => setF({ ...f, horaInicio: e.target.value })}
            />
          </Field>
          <Field etiqueta="Hasta">
            <input
              aria-label="Hora de fin de la sesión extra"
              className={cn(controlClase, "h-10")}
              type="time"
              value={f.horaFin}
              onChange={(e) => setF({ ...f, horaFin: e.target.value })}
            />
          </Field>
        </div>
        <Field etiqueta="Motivo *" error={errores.motivo}>
          <textarea
            aria-label="Motivo de la sesión extra"
            className={cn(controlClase, "min-h-16")}
            value={f.motivo}
            onChange={(e) => setF({ ...f, motivo: e.target.value })}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" onClick={onCerrar} type="button">
            Volver
          </Button>
          <Button
            variante="oscuro"
            disabled={programar.isPending}
            onClick={() => void confirmar()}
            type="button"
          >
            Agregar sesión
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}

/** P3 (solo lectura) y P5 (el asesor crea, edita, mueve proyectos y elimina). */
export function GruposHorarioTab({ tallerId, editable }: { tallerId: string; editable: boolean }) {
  const q = useSesionesTaller(tallerId);
  const [dialogo, setDialogo] = useState<{ grupoId: string | null } | null>(null);
  const grupos = q.data?.grupos ?? [];
  const sinGrupo = q.data?.proyectosSinGrupo ?? [];
  return (
    <Card>
      <CardEncabezado
        titulo="Grupos de horario"
        descripcion={
          sinGrupo.length
            ? `Proyectos sin grupo: ${sinGrupo.map((p) => p.codigo).join(", ")}. Un proyecto pertenece a un solo grupo; los cambios valen para las sesiones futuras.`
            : "Un proyecto pertenece a un solo grupo; los cambios valen para las sesiones futuras."
        }
        accion={
          editable ? (
            <Button
              tamano="sm"
              variante="oscuro"
              onClick={() => setDialogo({ grupoId: null })}
              type="button"
            >
              <Plus size={14} />
              Crear grupo de horario
            </Button>
          ) : null
        }
      />
      <div className="p-4 md:p-5">
        <DataTable
          cargando={q.isPending}
          vacio="El asesor aún no ha creado grupos de horario."
          columnas={[
            { encabezado: "Grupo", celda: (g) => <strong>{g.nombre}</strong> },
            { encabezado: "Horario", celda: (g) => `${g.horaInicio}–${g.horaFin}` },
            {
              encabezado: "Proyectos",
              celda: (g) =>
                g.proyectos.length ? g.proyectos.map((p) => p.codigo).join(", ") : "Sin proyectos",
            },
            {
              encabezado: "Asistencia promedio",
              celda: (g) => (g.asistenciaPromedio === null ? "—" : `${g.asistenciaPromedio} %`),
            },
            ...(editable
              ? [
                  {
                    encabezado: "Acciones",
                    clase: "text-right",
                    celda: (g: (typeof grupos)[number]) => (
                      <Button
                        tamano="xs"
                        variante="contorno"
                        onClick={() => setDialogo({ grupoId: g.id })}
                        type="button"
                      >
                        Editar
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
          filas={grupos}
        />
      </div>
      {dialogo && q.data && (
        <GrupoDialogo
          tallerId={tallerId}
          datos={q.data}
          grupoId={dialogo.grupoId}
          onCerrar={() => setDialogo(null)}
        />
      )}
    </Card>
  );
}

function GrupoDialogo({
  tallerId,
  datos,
  grupoId,
  onCerrar,
}: {
  tallerId: string;
  datos: SesionesTallerDTO;
  grupoId: string | null;
  onCerrar: () => void;
}) {
  const avisar = useToast();
  const guardar = useGuardarGrupo(tallerId);
  const grupo = datos.grupos.find((g) => g.id === grupoId);
  const [f, setF] = useState({
    nombre: grupo?.nombre ?? "",
    horaInicio: grupo?.horaInicio ?? "15:00",
    horaFin: grupo?.horaFin ?? "17:30",
  });
  const [elegidos, setElegidos] = useState<string[]>(grupo?.proyectos.map((p) => p.id) ?? []);
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});
  const opciones = [
    ...(grupo?.proyectos ?? []),
    ...datos.proyectosSinGrupo,
    ...datos.grupos
      .filter((g) => g.id !== grupoId)
      .flatMap((g) => g.proyectos.map((p) => ({ ...p, de: g.nombre }))),
  ];

  async function confirmar(): Promise<void> {
    try {
      await guardar.mutateAsync(
        grupoId
          ? { tipo: "editar", grupoId, datos: { ...f, proyectoIds: elegidos } }
          : { tipo: "crear", datos: { ...f, proyectoIds: elegidos } },
      );
      avisar(grupoId ? "Grupo actualizado" : "Grupo creado");
      onCerrar();
    } catch (e) {
      if (e instanceof ApiError) setErrores(e.campos);
      avisar(e instanceof Error ? e.message : "No se pudo guardar", "error");
    }
  }

  async function eliminar(): Promise<void> {
    if (!grupoId) return;
    try {
      await guardar.mutateAsync({ tipo: "eliminar", grupoId });
      avisar("Grupo eliminado");
      onCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo eliminar", "error");
    }
  }

  return (
    <Dialogo
      abierto
      onAbierto={(v) => {
        if (!v) onCerrar();
      }}
      titulo={grupoId ? `Editar ${grupo?.nombre}` : "Crear grupo de horario"}
      descripcion="El horario debe estar dentro del bloque de algún día del taller."
    >
      <div className="mt-4 space-y-3">
        <Field etiqueta="Nombre *" error={errores.nombre}>
          <input
            aria-label="Nombre del grupo"
            className={cn(controlClase, "h-10")}
            value={f.nombre}
            onChange={(e) => setF({ ...f, nombre: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field etiqueta="Desde *" error={errores.horario}>
            <input
              aria-label="Hora de inicio del grupo"
              className={cn(controlClase, "h-10")}
              type="time"
              value={f.horaInicio}
              onChange={(e) => setF({ ...f, horaInicio: e.target.value })}
            />
          </Field>
          <Field etiqueta="Hasta *">
            <input
              aria-label="Hora de fin del grupo"
              className={cn(controlClase, "h-10")}
              type="time"
              value={f.horaFin}
              onChange={(e) => setF({ ...f, horaFin: e.target.value })}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-[11px] font-bold tracking-wider text-grafito-600 uppercase">
            Proyectos
          </legend>
          {opciones.length === 0 ? (
            <p className="text-sm text-grafito-600">No hay proyectos en el taller.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {opciones.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={elegidos.includes(p.id)}
                      type="checkbox"
                      onChange={(e) =>
                        setElegidos((xs) =>
                          e.target.checked ? [...xs, p.id] : xs.filter((x) => x !== p.id),
                        )
                      }
                    />
                    <span>
                      <strong>{p.codigo}</strong> {p.tesistas.join(" y ")}
                      {"de" in p && (
                        <span className="text-xs text-grafito-600"> (ahora en {String(p.de)})</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <div className="flex flex-wrap justify-between gap-2">
          {grupoId ? (
            <Button
              variante="fantasma"
              disabled={elegidos.length > 0 || guardar.isPending}
              title={elegidos.length > 0 ? "Solo se elimina un grupo sin proyectos" : undefined}
              onClick={() => void eliminar()}
              type="button"
            >
              Eliminar grupo
            </Button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Button variante="contorno" onClick={onCerrar} type="button">
              Volver
            </Button>
            <Button
              variante="oscuro"
              disabled={guardar.isPending}
              onClick={() => void confirmar()}
              type="button"
            >
              Guardar
            </Button>
          </span>
        </div>
      </div>
    </Dialogo>
  );
}
