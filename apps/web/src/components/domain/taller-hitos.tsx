import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileArchive,
  FileUp,
  Lock,
  Pencil,
  Unlock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useProgramas } from "../../api/catalogos.js";
import {
  descargarVersion,
  descargarZipHito,
  type EntregasProyectoDTO,
  ETIQUETA_ESTADO_HITO,
  ETIQUETA_ESTADO_VERSION,
  type HitoDetalleDTO,
  type PlanTallerDTO,
  useEditarSemanaPlan,
  useEntregasProyecto,
  useHabilitarColumna,
  useMatrizHitos,
  useOperarHito,
  usePlanTaller,
  usePreviaAprobacion,
} from "../../api/hitos.js";
import { fechaCorta, fechaLarga } from "../../api/taller.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Card, CardEncabezado } from "../ui/card.js";
import { DataTable } from "../ui/data-table.js";
import { Dialogo } from "../ui/dialog.js";
import { EmptyState } from "../ui/empty-state.js";
import { controlClase, Field } from "../ui/field.js";
import { StatusBadge } from "../ui/status-badge.js";
import { useToast } from "../ui/toast.js";

/**
 * P6 Plan del taller y matriz de hitos, P6b Entregas de un proyecto, P7
 * (parte de entregas del alumno) y D3 Aprobar plan (spec v1.0 §9–§10).
 */

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : "Ocurrió un error";
}

// ── P6 Plan del taller ─────────────────────────────────────────────────
type Semana = PlanTallerDTO["semanas"][number];

export function PlanTallerCard({ tallerId }: { tallerId: string }) {
  const q = usePlanTaller(tallerId);
  const [editar, setEditar] = useState<Semana | null>(null);
  const plan = q.data;
  return (
    <Card>
      <CardEncabezado
        titulo="Plan del taller"
        descripcion="12 semanas. El entregable y los hitos vienen del plan institucional; el asesor ajusta el contenido y las indicaciones."
      />
      <div className="p-4 md:p-5">
        <DataTable
          cargando={q.isPending}
          vacio="El taller no tiene plan."
          filas={(plan?.semanas ?? []).map((s) => ({ ...s, id: String(s.semana) }))}
          columnas={[
            {
              encabezado: "Semana",
              celda: (s) => (
                <span>
                  <strong className="tabular-nums">{s.semana}</strong>
                  <span className="block text-xs text-grafito-600">{fechaCorta(s.fecha)}</span>
                </span>
              ),
            },
            {
              encabezado: "Contenido",
              celda: (s) => (
                <span className="block max-w-md">
                  {s.contenido}
                  {s.indicaciones && (
                    <span className="mt-1 block text-xs text-grafito-600">
                      Indicaciones: {s.indicaciones}
                    </span>
                  )}
                </span>
              ),
            },
            {
              encabezado: "Entregable",
              celda: (s) =>
                s.hito ? (
                  <span>
                    <StatusBadge estado={s.fijo ? "HITO_FIJO" : "HITO"} etiqueta={s.hito.nombre} />
                    <span className="mt-0.5 block text-xs text-grafito-600">
                      Hasta el {fechaCorta(s.hito.fechaLimite)}
                    </span>
                  </span>
                ) : (
                  (s.entregable ?? "—")
                ),
            },
            {
              encabezado: "",
              clase: "text-right",
              celda: (s) =>
                plan?.editable ? (
                  <Button
                    tamano="xs"
                    variante="fantasma"
                    type="button"
                    onClick={() => setEditar(s)}
                  >
                    <Pencil size={13} />
                    Editar
                  </Button>
                ) : null,
            },
          ]}
        />
      </div>
      {editar && (
        <EditarSemanaDialogo tallerId={tallerId} semana={editar} onCerrar={() => setEditar(null)} />
      )}
    </Card>
  );
}

function EditarSemanaDialogo({
  tallerId,
  semana,
  onCerrar,
}: {
  tallerId: string;
  semana: Semana;
  onCerrar: () => void;
}) {
  const m = useEditarSemanaPlan(tallerId);
  const toast = useToast();
  const [contenido, setContenido] = useState(semana.contenido);
  const [indicaciones, setIndicaciones] = useState(semana.indicaciones ?? "");
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Semana ${semana.semana}`}
      descripcion="Al guardar se avisa a los alumnos del taller."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate(
            { semana: semana.semana, contenido, indicaciones: indicaciones.trim() || null },
            {
              onSuccess: () => {
                toast("Semana guardada", "ok");
                onCerrar();
              },
              onError: (err) => toast(mensaje(err), "error"),
            },
          );
        }}
      >
        <Field etiqueta="Contenido">
          <textarea
            className={cn(controlClase, "min-h-24")}
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            required
          />
        </Field>
        <Field etiqueta="Indicaciones para los alumnos">
          <textarea
            className={cn(controlClase, "min-h-24")}
            value={indicaciones}
            onChange={(e) => setIndicaciones(e.target.value)}
          />
        </Field>
        {semana.entregable && (
          <p className="text-xs text-grafito-600">
            Entregable (fijo): <strong>{semana.entregable}</strong>
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variante="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={m.isPending || contenido.trim() === ""}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}

// ── P6 Matriz de hitos ─────────────────────────────────────────────────
export function MatrizHitosCard({ tallerId }: { tallerId: string }) {
  const q = useMatrizHitos(tallerId);
  const habilitar = useHabilitarColumna(tallerId);
  const toast = useToast();
  const m = q.data;
  if (q.isPending) return <Card className="p-5 text-sm text-grafito-600">Cargando hitos…</Card>;
  if (!m) return <EmptyState titulo="No se pudo cargar los hitos" />;
  return (
    <Card>
      <CardEncabezado
        titulo="Seguimiento de hitos"
        descripcion="Cada hito se habilita cuando el anterior está aprobado. Abre un proyecto para revisar sus versiones."
      />
      <div className="overflow-x-auto p-4 md:p-5">
        {m.proyectos.length === 0 ? (
          <EmptyState titulo="Aún no hay proyectos en el taller" />
        ) : (
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-navy-950 px-3 py-2 text-left text-xs font-semibold text-white">
                  Proyecto
                </th>
                {m.hitos.map((h) => (
                  <th
                    key={h.tipo}
                    className="bg-navy-950 px-2 py-2 text-center text-xs font-semibold text-white"
                  >
                    <span className="block">{h.nombre}</span>
                    <span className="block font-normal text-white/70">
                      Sem. {h.semana} · {fechaCorta(h.fechaLimite)}
                    </span>
                    <span className="mt-1 flex justify-center gap-1">
                      {m.puedeGestionar && (
                        <button
                          type="button"
                          className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] hover:bg-white/20"
                          disabled={habilitar.isPending}
                          onClick={() =>
                            habilitar.mutate(h.tipo, {
                              onSuccess: () => toast(`${h.nombre}: habilitado`, "ok"),
                              onError: (e) => toast(mensaje(e), "error"),
                            })
                          }
                        >
                          Habilitar
                        </button>
                      )}
                      <button
                        type="button"
                        title="Descargar la última versión de cada proyecto"
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] hover:bg-white/20"
                        onClick={() =>
                          descargarZipHito(tallerId, h.tipo).catch((e: unknown) =>
                            toast(mensaje(e), "error"),
                          )
                        }
                      >
                        ZIP
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.proyectos.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="sticky left-0 border-b border-slate-200 bg-white px-3 py-2">
                    <Link
                      to="/proyectos/$id/entregas"
                      params={{ id: p.id }}
                      className="font-bold text-navy-800 hover:underline"
                    >
                      {p.codigo}
                    </Link>
                    <span className="block max-w-[220px] truncate text-xs text-grafito-600">
                      {p.tesistas.join(" · ")}
                    </span>
                    {p.expedienteCodigo && (
                      <span className="text-[11px] font-semibold text-verde-inst-700">
                        Exp. {p.expedienteCodigo}
                      </span>
                    )}
                  </td>
                  {p.hitos.map((h) => (
                    <td key={h.id} className="border-b border-slate-200 px-2 py-2 text-center">
                      <StatusBadge
                        estado={h.vencido ? "VENCIDA" : h.estado}
                        etiqueta={h.vencido ? "Vencido" : ETIQUETA_ESTADO_HITO[h.estado]}
                      />
                      {h.ultimaVersion && (
                        <span className="mt-0.5 block text-[11px] text-grafito-600">
                          v{h.ultimaVersion.version} ·{" "}
                          {ETIQUETA_ESTADO_VERSION[h.ultimaVersion.estado]}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

// ── P6b / P7 Entregas de un proyecto ───────────────────────────────────
type Dialogos =
  | { tipo: "revisar"; hito: HitoDetalleDTO }
  | { tipo: "fecha"; hito: HitoDetalleDTO; reabrir: boolean }
  | { tipo: "subir"; hito: HitoDetalleDTO }
  | { tipo: "aprobar" }
  | null;

export function EntregasProyecto({ proyectoId }: { proyectoId: string }) {
  const q = useEntregasProyecto(proyectoId);
  const [dialogo, setDialogo] = useState<Dialogos>(null);
  const d = q.data;
  if (q.isPending) return <Card className="p-5 text-sm text-grafito-600">Cargando entregas…</Card>;
  if (!d) return <EmptyState titulo="No se pudo cargar las entregas" />;
  return (
    <div className="space-y-4">
      {d.hitos.map((h) => (
        <HitoCard key={h.id} d={d} h={h} onDialogo={setDialogo} />
      ))}
      {dialogo?.tipo === "revisar" && (
        <RevisarDialogo
          proyectoId={proyectoId}
          hito={dialogo.hito}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === "fecha" && (
        <FechaDialogo
          proyectoId={proyectoId}
          hito={dialogo.hito}
          reabrir={dialogo.reabrir}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === "subir" && (
        <SubirDialogo d={d} hito={dialogo.hito} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === "aprobar" && (
        <AprobarPlanDialogo d={d} onCerrar={() => setDialogo(null)} />
      )}
    </div>
  );
}

function HitoCard({
  d,
  h,
  onDialogo,
}: {
  d: EntregasProyectoDTO;
  h: HitoDetalleDTO;
  onDialogo: (v: Dialogos) => void;
}) {
  const operar = useOperarHito(d.proyecto.id);
  const toast = useToast();
  const g = d.capacidades.gestionar;
  const ultima = h.versionesDetalle[0] ?? null;
  return (
    <Card>
      <CardEncabezado
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {h.nombre}
            <StatusBadge
              estado={h.vencido ? "VENCIDA" : h.estado}
              etiqueta={h.vencido ? "Vencido" : ETIQUETA_ESTADO_HITO[h.estado]}
            />
            {h.fijo && <StatusBadge estado="HITO_FIJO" etiqueta="Fecha fija" />}
          </span>
        }
        descripcion={`Semana ${h.semana} · fecha límite ${fechaLarga(h.fechaLimite)}`}
        accion={
          <span className="flex flex-wrap justify-end gap-1.5">
            {g && h.estado === "NO_HABILITADO" && (
              <Button
                tamano="sm"
                variante="oscuro"
                type="button"
                disabled={operar.isPending}
                onClick={() =>
                  operar.mutate(
                    { tipo: "habilitar", hitoId: h.id },
                    {
                      onSuccess: () => toast("Hito habilitado", "ok"),
                      onError: (e) => toast(mensaje(e), "error"),
                    },
                  )
                }
              >
                <Unlock size={14} />
                Habilitar
              </Button>
            )}
            {g &&
              !h.fijo &&
              ["NO_HABILITADO", "HABILITADO", "ENTREGADO", "OBSERVADO"].includes(h.estado) && (
                <Button
                  tamano="sm"
                  variante="contorno"
                  type="button"
                  onClick={() => onDialogo({ tipo: "fecha", hito: h, reabrir: false })}
                >
                  <CalendarClock size={14} />
                  Ajustar fecha
                </Button>
              )}
            {g && !h.fijo && h.estado === "NO_ENTREGADO" && (
              <Button
                tamano="sm"
                variante="contorno"
                type="button"
                onClick={() => onDialogo({ tipo: "fecha", hito: h, reabrir: true })}
              >
                <Unlock size={14} />
                Habilitar nueva entrega
              </Button>
            )}
            {g && ultima?.estado === "ENTREGADA" && (
              <Button
                tamano="sm"
                type="button"
                onClick={() => onDialogo({ tipo: "revisar", hito: h })}
              >
                Revisar v{ultima.version}
              </Button>
            )}
            {g && h.tipo === "PLAN" && h.estado === "ENTREGADO" && !d.proyecto.expedienteId && (
              <Button
                tamano="sm"
                variante="exito"
                type="button"
                onClick={() => onDialogo({ tipo: "aprobar" })}
              >
                <CheckCircle2 size={14} />
                Aprobar plan
              </Button>
            )}
            {d.capacidades.subir &&
              (h.motivoNoSubir === null ? (
                <Button
                  tamano="sm"
                  type="button"
                  onClick={() => onDialogo({ tipo: "subir", hito: h })}
                >
                  <FileUp size={14} />
                  Subir versión
                </Button>
              ) : (
                <span className="flex items-center gap-1 text-xs text-grafito-600">
                  <Lock size={12} />
                  {h.motivoNoSubir}
                </span>
              ))}
          </span>
        }
      />
      <div className="p-4 md:p-5">
        {h.versionesDetalle.length === 0 ? (
          <p className="text-sm text-grafito-600">Sin entregas.</p>
        ) : (
          <ol className="space-y-2">
            {h.versionesDetalle.map((v) => (
              <li key={v.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <strong>Versión {v.version}</strong>
                    <StatusBadge estado={v.estado} etiqueta={ETIQUETA_ESTADO_VERSION[v.estado]} />
                    <span className="text-xs text-grafito-600">
                      {v.entregadaPor} · {new Date(v.entregadaAt).toLocaleString("es-PE")}
                    </span>
                  </span>
                  <Button
                    tamano="xs"
                    variante="fantasma"
                    type="button"
                    onClick={() =>
                      descargarVersion(v).catch((e: unknown) => toast(mensaje(e), "error"))
                    }
                  >
                    <Download size={13} />
                    {v.nombreArchivo}
                  </Button>
                </div>
                {v.comentario && (
                  <p className="mt-1 text-grafito-700">Comentario: {v.comentario}</p>
                )}
                {v.observaciones && (
                  <p className="mt-1 rounded bg-orange-50 p-2 text-orange-900">
                    Observaciones{v.revisadaPor ? ` de ${v.revisadaPor}` : ""}: {v.observaciones}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        {h.tipo === "PLAN" && d.proyecto.expedienteCodigo && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-verde-inst-700">
            <CheckCircle2 size={15} />
            Plan aprobado · expediente {d.proyecto.expedienteCodigo}
          </p>
        )}
      </div>
    </Card>
  );
}

function RevisarDialogo({
  proyectoId,
  hito,
  onCerrar,
}: {
  proyectoId: string;
  hito: HitoDetalleDTO;
  onCerrar: () => void;
}) {
  const operar = useOperarHito(proyectoId);
  const toast = useToast();
  const [resultado, setResultado] = useState<"CONFORME" | "OBSERVADA">("CONFORME");
  const [obs, setObs] = useState("");
  const ultima = hito.versionesDetalle[0];
  if (!ultima) return null;
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Revisar ${hito.nombre} · v${ultima.version}`}
      descripcion={
        hito.tipo === "PLAN"
          ? "Conforme no aprueba el plan: después usa «Aprobar plan»."
          : "La revisión queda en la ficha de control."
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          operar.mutate(
            {
              tipo: "revisar",
              entregaId: ultima.id,
              resultado,
              observaciones: obs.trim() || null,
            },
            {
              onSuccess: () => {
                toast("Revisión guardada", "ok");
                onCerrar();
              },
              onError: (err) => toast(mensaje(err), "error"),
            },
          );
        }}
      >
        <fieldset className="flex gap-4 text-sm">
          {(["CONFORME", "OBSERVADA"] as const).map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input
                type="radio"
                name="resultado"
                checked={resultado === r}
                onChange={() => setResultado(r)}
              />
              {r === "CONFORME" ? "Conforme" : "Observada"}
            </label>
          ))}
        </fieldset>
        <Field
          etiqueta={
            resultado === "OBSERVADA" ? "Observaciones (obligatorio)" : "Comentarios (opcional)"
          }
        >
          <textarea
            className={cn(controlClase, "min-h-28")}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={operar.isPending || (resultado === "OBSERVADA" && obs.trim() === "")}
          >
            Guardar revisión
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}

function FechaDialogo({
  proyectoId,
  hito,
  reabrir,
  onCerrar,
}: {
  proyectoId: string;
  hito: HitoDetalleDTO;
  reabrir: boolean;
  onCerrar: () => void;
}) {
  const operar = useOperarHito(proyectoId);
  const toast = useToast();
  const [fecha, setFecha] = useState(hito.fechaLimite);
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={reabrir ? `Habilitar nueva entrega: ${hito.nombre}` : `Ajustar fecha: ${hito.nombre}`}
      descripcion="Se avisa a los tesistas del proyecto."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          operar.mutate(
            { tipo: reabrir ? "reabrir" : "fecha", hitoId: hito.id, fechaLimite: fecha },
            {
              onSuccess: () => {
                toast("Fecha guardada", "ok");
                onCerrar();
              },
              onError: (err) => toast(mensaje(err), "error"),
            },
          );
        }}
      >
        <Field etiqueta="Nueva fecha límite">
          <input
            type="date"
            className={controlClase}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={operar.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}

function SubirDialogo({
  d,
  hito,
  onCerrar,
}: {
  d: EntregasProyectoDTO;
  hito: HitoDetalleDTO;
  onCerrar: () => void;
}) {
  const operar = useOperarHito(d.proyecto.id);
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [comentario, setComentario] = useState("");
  const grande = archivo !== null && archivo.size > d.maxMb * 1024 * 1024;
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Subir versión: ${hito.nombre}`}
      descripcion={`PDF o Word, hasta ${d.maxMb} MB. Las versiones anteriores se conservan.`}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!archivo) return;
          operar.mutate(
            { tipo: "subir", hitoId: hito.id, archivo, comentario },
            {
              onSuccess: () => {
                toast("Entrega subida", "ok");
                onCerrar();
              },
              onError: (err) => toast(mensaje(err), "error"),
            },
          );
        }}
      >
        <Field etiqueta="Archivo" error={grande ? `Pasa de ${d.maxMb} MB` : undefined}>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            className={controlClase}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            required
          />
        </Field>
        <Field etiqueta="Comentario para tu asesor (opcional)">
          <textarea
            className={cn(controlClase, "min-h-20")}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={operar.isPending || !archivo || grande}>
            <FileUp size={14} />
            Subir
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}

function AprobarPlanDialogo({ d, onCerrar }: { d: EntregasProyectoDTO; onCerrar: () => void }) {
  const previa = usePreviaAprobacion(d.proyecto.id, true);
  const programas = useProgramas();
  const operar = useOperarHito(d.proyecto.id);
  const toast = useToast();
  const [titulo, setTitulo] = useState("");
  const [programa, setPrograma] = useState("");
  const [modalidad, setModalidad] = useState<"TESIS" | "TRABAJO_ACADEMICO" | "ARTICULO">("TESIS");
  const p = previa.data;
  useEffect(() => {
    if (!p) return;
    setTitulo(p.titulo ?? "");
    setPrograma(p.programa ?? "");
    if (
      p.modalidad === "TESIS" ||
      p.modalidad === "TRABAJO_ACADEMICO" ||
      p.modalidad === "ARTICULO"
    )
      setModalidad(p.modalidad);
  }, [p]);
  const bloqueado = !p?.puede || (p.bloquean && p.advertencias.length > 0);
  return (
    <Dialogo
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Aprobar plan · ${d.proyecto.codigo}`}
      descripcion="Crea el expediente de titulación (Etapa 1) y genera el Anexo 18. No se puede deshacer."
      ancho="max-w-xl"
    >
      {!p ? (
        <p className="text-sm text-grafito-600">Cargando…</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            operar.mutate(
              { tipo: "aprobarPlan", datos: { titulo, programa, modalidad } },
              {
                onSuccess: (dto) => {
                  toast(`Plan aprobado · expediente ${dto.proyecto.expedienteCodigo ?? ""}`, "ok");
                  onCerrar();
                },
                onError: (err) => toast(mensaje(err), "error"),
              },
            );
          }}
        >
          {p.motivo && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{p.motivo}</p>}
          {p.advertencias.length > 0 && (
            <div className="rounded-lg bg-aviso-100 p-3 text-sm text-aviso-800">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle size={15} />
                {p.bloquean ? "No se puede aprobar:" : "Advertencias (no bloquean):"}
              </p>
              <ul className="ml-5 list-disc">
                {p.advertencias.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-sm">
            <p>
              <strong>Tesistas:</strong>{" "}
              {p.tesistas.map((t) => `${t.nombre} (${t.dni})`).join(" · ")}
            </p>
            <p>
              <strong>Asesor:</strong> {p.asesor ?? "—"}
            </p>
            {p.versionAprobada && (
              <p>
                <strong>Versión del plan:</strong> v{p.versionAprobada}
              </p>
            )}
          </div>
          <Field etiqueta="Título del plan" ayuda="Mínimo 10 caracteres.">
            <textarea
              className={cn(controlClase, "min-h-20")}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
            />
          </Field>
          <Field etiqueta="Programa">
            <select
              className={controlClase}
              value={programa}
              onChange={(e) => setPrograma(e.target.value)}
              required
            >
              <option value="">Selecciona…</option>
              {(programas.data ?? []).map((x) => (
                <option key={x.codigo} value={x.nombre}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field etiqueta="Modalidad">
            <select
              className={controlClase}
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as typeof modalidad)}
            >
              <option value="TESIS">Tesis</option>
              <option value="TRABAJO_ACADEMICO">Trabajo académico</option>
              <option value="ARTICULO">Artículo</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variante="contorno" type="button" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button
              variante="exito"
              type="submit"
              disabled={operar.isPending || bloqueado || titulo.trim().length < 10 || !programa}
            >
              <FileArchive size={14} />
              {operar.isPending ? "Aprobando…" : "Aprobar y crear expediente"}
            </Button>
          </div>
        </form>
      )}
    </Dialogo>
  );
}
