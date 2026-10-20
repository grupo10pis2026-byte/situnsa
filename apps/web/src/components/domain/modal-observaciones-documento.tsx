/**
 * Modal interactivo para visualizar y gestionar el historial de observaciones
 * de un documento específico (compartido entre Tesista y Administrador/Asesor).
 */
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  Send,
  User,
} from "lucide-react";
import { useState } from "react";
import {
  useCrearObservacionDocumento,
  useObservacionesDocumento,
  useResolverObservacionDocumento,
} from "../../api/expedientes.js";
import { useSession } from "../../api/session.js";
import { Button } from "../ui/button.js";
import { Dialogo } from "../ui/dialog.js";
import { useToast } from "../ui/toast.js";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  expedienteId: string;
  tipoDocumento: string;
  nombreDocumento: string;
  documentoId?: string | null;
  /** Permite forzar el foco en el formulario de redacción de observación si lo abre el admin */
  modoInicialObservar?: boolean;
}

const ROLES_ADMIN = ["ADMIN_FIPS", "SECRETARIA", "DECANO", "ASESOR"];

/** Calcula los días transcurridos desde una fecha ISO. */
function calcularDiasTranscurridos(fechaIso: string): number {
  const fecha = new Date(fechaIso);
  const ahora = new Date();
  const diffMs = ahora.getTime() - fecha.getTime();
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, dias);
}

function textoContadorDias(dias: number): string {
  if (dias === 0) return "Registrada hoy";
  if (dias === 1) return "Hace 1 día";
  return `Hace ${dias} días`;
}

export function ModalObservacionesDocumento({
  abierto,
  onCerrar,
  expedienteId,
  tipoDocumento,
  nombreDocumento,
  documentoId,
  modoInicialObservar: _modoInicialObservar = false,
}: Props) {
  const { sesion } = useSession();
  const avisar = useToast();

  const [nuevoTexto, setNuevoTexto] = useState("");
  const esAdmin = !!sesion && ROLES_ADMIN.includes(sesion.rol);

  const {
    data: observaciones = [],
    isLoading,
    isError,
  } = useObservacionesDocumento(expedienteId, tipoDocumento, abierto);

  const crearMutation = useCrearObservacionDocumento(expedienteId, tipoDocumento);
  const resolverMutation = useResolverObservacionDocumento(expedienteId, tipoDocumento);

  async function handleCrearObservacion() {
    const texto = nuevoTexto.trim();
    if (!texto) {
      avisar("Por favor escribe el detalle de la observación", "aviso");
      return;
    }
    try {
      await crearMutation.mutateAsync({
        texto,
        ...(documentoId ? { documentoId } : {}),
      });
      setNuevoTexto("");
      avisar("Observación registrada con éxito. El documento ahora está OBSERVADO.", "ok");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Error al registrar la observación", "error");
    }
  }

  async function handleResolver(obsId: string) {
    try {
      await resolverMutation.mutateAsync(obsId);
      avisar("Observación marcada como resuelta", "ok");
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Error al marcar como resuelta", "error");
    }
  }

  // Ordenadas de más reciente a más antigua para visualización cómoda
  const ordenadas = [...observaciones].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const pendientes = observaciones.filter((o) => o.estado === "PENDIENTE").length;
  const resueltas = observaciones.filter((o) => o.estado === "RESUELTO").length;

  return (
    <Dialogo
      abierto={abierto}
      onAbierto={(val) => {
        if (!val) onCerrar();
      }}
      titulo={`Observaciones: ${nombreDocumento}`}
      descripcion="Historial y estado de observaciones formuladas sobre este documento."
      ancho="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Resumen de contadores */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-navy-950 uppercase tracking-wider">
              {tipoDocumento}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 font-bold">
              <Clock size={12} />
              {pendientes} pendiente{pendientes === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 font-bold">
              <CheckCircle2 size={12} />
              {resueltas} resuelta{resueltas === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Formulario para Administrador / Personal */}
        {esAdmin && (
          <section className="rounded-xl border border-dorado-500/40 bg-dorado-50/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-navy-950">
              <AlertTriangle size={16} className="text-amber-600" />
              <span>Registrar nueva observación administrativa</span>
            </div>
            <p className="text-xs text-grafito-600">
              Al registrar una observación, el documento pasará automáticamente a estado{" "}
              <strong>OBSERVADO</strong>, se agregará a los mensajes generales del expediente y se
              notificará al tesista.
            </p>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-navy-950 placeholder-slate-400 focus:border-navy-900 focus:outline-none focus:ring-1 focus:ring-navy-900"
              rows={3}
              placeholder="Detalla de forma clara qué correcciones debe realizar el tesista..."
              value={nuevoTexto}
              onChange={(e) => setNuevoTexto(e.target.value)}
              disabled={crearMutation.isPending}
            />

            <div className="flex justify-end gap-2">
              <Button
                variante="peligro"
                tamano="sm"
                onClick={() => void handleCrearObservacion()}
                disabled={crearMutation.isPending || !nuevoTexto.trim()}
                type="button"
              >
                <Send size={14} />
                {crearMutation.isPending ? "Registrando…" : "Registrar observación"}
              </Button>
            </div>
          </section>
        )}

        {/* Listado / Historial de observaciones */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-grafito-600 flex items-center gap-1.5">
            <MessageSquare size={14} />
            Historial de observaciones ({observaciones.length})
          </h4>

          {isLoading && (
            <div className="space-y-2 py-4">
              <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
            </div>
          )}

          {isError && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle size={15} />
              No se pudo cargar el historial de observaciones.
            </div>
          )}

          {!isLoading && observaciones.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-grafito-600 bg-white">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-slate-800">Sin observaciones registradas</p>
              <p className="text-xs text-slate-500 mt-1">
                Este documento no tiene observaciones pendientes ni subsanadas.
              </p>
            </div>
          )}

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {ordenadas.map((obs, idx) => {
              const esUltima = idx === 0;
              const dias = calcularDiasTranscurridos(obs.createdAt);
              const estaResuelta = obs.estado === "RESUELTO";

              return (
                <div
                  key={obs.id}
                  className={`rounded-xl border p-4 transition-all ${
                    estaResuelta
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-amber-200 bg-amber-50/40 shadow-xs"
                  }`}
                >
                  {/* Encabezado de la observación */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1 font-bold text-navy-950">
                        <User size={13} className="text-slate-500" />
                        {obs.autorNombre || "Administración"}
                      </span>
                      {obs.autorRol && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                          {obs.autorRol}
                        </span>
                      )}
                      <span className="text-slate-400">·</span>
                      <span className="flex items-center gap-1 text-grafito-600">
                        <Calendar size={12} />
                        {new Date(obs.createdAt).toLocaleString("es-PE", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Contador de días para la última observación */}
                      {esUltima && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-navy-900 text-white px-2 py-0.5 text-[11px] font-bold shadow-xs"
                          title="Tiempo transcurrido desde que fue registrada"
                        >
                          <Clock size={11} />
                          {textoContadorDias(dias)}
                        </span>
                      )}

                      {/* Estado */}
                      {estaResuelta ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-xs font-bold">
                          <CheckCircle2 size={12} />
                          Resuelto
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-xs font-bold">
                          <Clock size={12} />
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cuerpo / Texto de la observación */}
                  <div className="mt-2.5 text-sm text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                    {obs.texto}
                  </div>

                  {/* Pie de la tarjeta: resolución o botón de marcar resuelto */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex flex-wrap items-center justify-between gap-2">
                    {estaResuelta ? (
                      <div className="text-xs text-emerald-800 flex items-center gap-1 font-medium">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                        <span>
                          Subsanado y resuelto
                          {obs.resueltoAt
                            ? ` el ${new Date(obs.resueltoAt).toLocaleString("es-PE", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}`
                            : ""}{" "}
                          {obs.resueltoPorNombre ? `por ${obs.resueltoPorNombre}` : ""}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="text-xs text-amber-800 font-medium flex items-center gap-1">
                          <AlertTriangle size={13} className="shrink-0" />
                          <span>Pendiente de corrección por el tesista</span>
                        </div>

                        {/* Botón formal para el Tesista (o quien subsana) */}
                        <Button
                          variante="exito"
                          tamano="sm"
                          disabled={resolverMutation.isPending}
                          onClick={() => void handleResolver(obs.id)}
                          type="button"
                          title="Marcar esta observación como resuelta tras haber realizado la corrección"
                        >
                          <CheckCircle2 size={14} />
                          {resolverMutation.isPending ? "Guardando…" : "Marcar como resuelto"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Botón de cierre */}
        <div className="flex justify-end pt-2 border-t border-slate-200">
          <Button variante="contorno" tamano="sm" onClick={onCerrar} type="button">
            Cerrar
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
