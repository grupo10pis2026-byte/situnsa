import type { ExpedienteDetalleDTO } from "@pis/contracts";
import { resolverNombreArchivoDescarga } from "@pis/domain/dist/documentos/plantillas.js";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  FileDown,
  KeyRound,
  Lock,
  MessageSquareWarning,
  Trash2,
  Undo2,
  Users,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { destinoPorRol } from "../api/auth.js";
import { ApiError } from "../api/errores.js";
import {
  descargarArchivoProtegido,
  formatoDescargaUrl,
  type GuardadoEstado,
  reportarPresenciaExpediente,
  type UsuarioConcurrente,
  useAnular,
  useEnviarAcceso,
  useExpedienteDetalle,
  useGenerarDocumentos,
  useLevantarObservacion,
} from "../api/expedientes.js";
import { esStaff } from "../api/guard.js";
import { useObservar } from "../api/seguimiento.js";
import { useSession } from "../api/session.js";
import { DatosForm } from "../components/domain/datos-form.js";
import { DocumentoCard } from "../components/domain/documento-card.js";
import { ModalModificarFormato } from "../components/domain/modal-modificar-formato.js";
import { ModalVistaPreviaFormato } from "../components/domain/modal-vista-previa-formato.js";
import { ResumenTab } from "../components/domain/resumen-tab.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button, botonClases } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { ConfirmDialog } from "../components/ui/confirm-dialog.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { controlClase } from "../components/ui/field.js";
import { PageHeader } from "../components/ui/page-header.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";
import { useToast } from "../components/ui/toast.js";
import { cn } from "../utils/cn.js";

type TabId = "datos" | "e1" | "e2" | "resumen";

/** Estados desde los que el área puede observar el expediente (state-machine.md). */
const OBSERVABLES = new Set([
  "REGISTRADO",
  "EN_PLAN",
  "EN_BORRADOR",
  "EN_DICTAMEN",
  "EN_VALIDACION",
]);

/** Indicador de autoguardado (legacy activarAutoguardadoAdminV4) como píldora. */
const indicador: Record<GuardadoEstado, { texto: string; clase: string }> = {
  sincronizado: { texto: "", clase: "" },
  editando: {
    texto: "CAMBIOS PENDIENTES…",
    clase: "bg-aviso-100 text-aviso-800 border-yellow-300",
  },
  guardando: {
    texto: "GUARDANDO Y SINCRONIZANDO…",
    clase: "bg-blue-100 text-blue-800 border-blue-300",
  },
  guardado: {
    texto: "GUARDADO · DOCUMENTOS SINCRONIZADOS",
    clase: "bg-verde-inst-100 text-verde-inst-700 border-green-300",
  },
  error: { texto: "ERROR AL GUARDAR", clase: "bg-red-100 text-red-800 border-red-300" },
  conflicto: { texto: "Conflicto de versión", clase: "bg-red-100 text-red-800 border-red-300" },
};

/** Detalle del Expediente — INTERFACES §§6–9. */
export function ExpedienteDetallePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const [tab, setTab] = useState<TabId>("datos");
  const [guardado, setGuardado] = useState<GuardadoEstado>("sincronizado");
  const [conflicto, setConflicto] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState(false);
  const [concurrentes, setConcurrentes] = useState<UsuarioConcurrente[]>([]);
  const query = useExpedienteDetalle(id);
  const anular = useAnular(id);
  const avisar = useToast();
  const navigate = useNavigate();
  const { sesion } = useSession();

  // Detección de concurrencia: ping de presencia cada 15s
  useEffect(() => {
    let activo = true;
    async function pingPresencia() {
      if (!id) return;
      const nombreUsuario = sesion?.nombres?.trim() || undefined;
      const res = await reportarPresenciaExpediente(id, nombreUsuario);
      if (activo) {
        setConcurrentes(res);
      }
    }

    void pingPresencia();
    const interval = setInterval(() => {
      void pingPresencia();
    }, 15_000);

    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, [id, sesion?.nombres]);

  if (query.isPending) {
    return (
      <AppShell activo="/admin">
        <output className="space-y-2" aria-label="Cargando">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-white" />
          ))}
        </output>
      </AppShell>
    );
  }
  if (query.isError) {
    const status = query.error instanceof ApiError ? query.error.status : 0;
    const destino = sesion ? destinoPorRol(sesion.rol) : "/login";
    // INC-07: un 403/404 se informa de inmediato (sin reintentos ni carga eterna).
    if (status === 403 || status === 404) {
      return (
        <AppShell activo={destino}>
          <EmptyState
            icono={<Lock size={22} />}
            titulo={
              status === 403 ? "No tienes acceso a este expediente" : "Expediente no encontrado"
            }
            descripcion={
              status === 403
                ? "El expediente no pertenece a tu alcance. Si crees que es un error, comunícate con el área de titulación."
                : "El expediente no existe o fue retirado."
            }
            accion={
              <Link
                className={cn(botonClases({ variante: "contorno", tamano: "sm" }))}
                to={destino}
              >
                <ArrowLeft size={14} />
                Volver a mi panel
              </Link>
            }
          />
        </AppShell>
      );
    }
    return (
      <AppShell activo="/admin">
        <Card className="p-6 text-sm text-red-700">
          No se pudo cargar el expediente.{" "}
          <button
            className="font-semibold underline underline-offset-2"
            onClick={() => void query.refetch()}
            type="button"
          >
            Reintentar
          </button>{" "}
          <Link className={cn(botonClases({ variante: "contorno", tamano: "sm" }))} to="/admin">
            <ArrowLeft size={14} />
            Volver al listado
          </Link>
        </Card>
      </AppShell>
    );
  }

  const d = query.data;
  const staff = esStaff(sesion?.rol);
  const nombreTesista = d.participante1
    ? `${d.participante1.nombres} ${d.participante1.apellidos}`.trim()
    : "—";
  const e1 = d.checklist.filter((c) => c.etapa === "E1");
  const e2 = d.checklist.filter((c) => c.etapa === "E2");
  const estadoGuardado = indicador[guardado];

  return (
    <AppShell activo={staff ? "/admin" : destinoPorRol(sesion?.rol ?? "")}>
      <Link
        className={cn(botonClases({ variante: "contorno", tamano: "sm" }), "w-fit print:hidden")}
        to={staff ? "/admin" : destinoPorRol(sesion?.rol ?? "")}
      >
        <ArrowLeft size={16} />
        {staff ? "Volver al listado" : "Volver a mi panel"}
      </Link>

      {concurrentes.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-amber-900 shadow-sm animate-in fade-in">
          <Users className="size-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Atención — Trabajo Concurrente Detectado
            </p>
            <p className="text-xs sm:text-sm text-amber-900">
              <strong>{concurrentes.map((c) => `${c.nombre} (${c.rol})`).join(", ")}</strong>{" "}
              también tiene abierto este expediente en este momento. Los cambios se sincronizan en
              tiempo real.
            </p>
          </div>
        </div>
      )}

      <PageHeader
        titulo={`Expediente ${d.codigo}`}
        descripcion={`${nombreTesista} · ${d.programa}`}
        migas={[{ etiqueta: "Expedientes", href: "/admin" }, { etiqueta: d.codigo }]}
        insignia={
          <>
            <StatusBadge estado={d.estado} />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-bold tabular-nums">
              {d.avance.marcados}/{d.avance.total} · {d.avance.pct}%
            </span>
            {estadoGuardado.texto && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  estadoGuardado.clase,
                )}
              >
                {estadoGuardado.texto}
              </span>
            )}
          </>
        }
      />
      <BannerObservacion detalle={d} staff={staff} />
      {conflicto && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {conflicto}{" "}
          <button
            className="font-semibold underline underline-offset-2"
            onClick={() => {
              setConflicto(null);
              setGuardado("sincronizado");
              void query.refetch();
            }}
            type="button"
          >
            Recargar datos
          </button>
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsLista aria-label="Pestañas del expediente">
          <Tab value="datos">Datos</Tab>
          <Tab value="e1">Documentos Etapa 01</Tab>
          <Tab value="e2">Documentos Etapa 02</Tab>
          <Tab value="resumen">Resumen del Trámite</Tab>
        </TabsLista>
        <TabPanel value="datos">
          <DatosForm detalle={d} setEstado={setGuardado} onConflicto={setConflicto} />
          {staff && <AccesoPortal detalle={d} />}
          {staff && (
            <div className="mt-4 print:hidden">
              <Button
                tamano="sm"
                variante="peligro"
                onClick={() => setEliminar(true)}
                type="button"
              >
                <Trash2 size={14} />
                ELIMINAR REGISTRO
              </Button>
              <p className="mt-1.5 text-xs text-grafito-600">
                Baja lógica (ANULADO): se conserva el historial y la cadena de custodia.
              </p>
            </div>
          )}
        </TabPanel>
        <TabPanel value="e1">
          <DocumentosTab etapa="E1" detalle={d} items={e1} staff={staff} />
        </TabPanel>
        <TabPanel value="e2">
          <DocumentosTab etapa="E2" detalle={d} items={e2} staff={staff} />
        </TabPanel>
        <TabPanel value="resumen">
          <ResumenTab detalle={d} />
        </TabPanel>
      </Tabs>
      {eliminar && (
        <ConfirmDialog
          titulo="Eliminar registro"
          mensaje={`Se dará de baja lógica al expediente ${d.codigo} (ANULADO). Se conserva el historial.`}
          confirmar="Eliminar"
          peligroso
          onConfirmar={() => {
            setEliminar(false);
            anular.mutate(undefined, {
              onSuccess: () => {
                avisar("Expediente anulado");
                void navigate({ to: "/admin" });
              },
              onError: (e) => avisar(e instanceof Error ? e.message : "No se pudo anular", "error"),
            });
          }}
          onCancelar={() => setEliminar(false)}
        />
      )}
    </AppShell>
  );
}

/** Observación vigente (o acción para observar) — state-machine.md OBSERVADO. */
function BannerObservacion({
  detalle: d,
  staff,
}: {
  detalle: ExpedienteDetalleDTO;
  staff: boolean;
}) {
  const levantar = useLevantarObservacion(d.id);
  const observar = useObservar();
  const avisar = useToast();
  const [motivo, setMotivo] = useState("");
  const [abierto, setAbierto] = useState(false);

  if (d.estado === "OBSERVADO") {
    const ultima = [...d.mensajes].reverse().find((m) => /Observaci/i.test(m.texto));
    return (
      <section
        className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-yellow-300 bg-aviso-100 p-4 text-sm text-aviso-800"
        aria-label="Observación vigente"
      >
        <div className="flex gap-2">
          <MessageSquareWarning size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">
              Expediente observado
              {d.observadoDesde ? ` (vuelve a ${d.observadoDesde.replace(/_/g, " ")})` : ""}
            </p>
            {ultima && <p className="mt-0.5">{ultima.texto}</p>}
          </div>
        </div>
        {staff && (
          <Button
            tamano="sm"
            variante="oscuro"
            disabled={levantar.isPending}
            onClick={() =>
              levantar.mutate(undefined, {
                onSuccess: (r) => avisar(`Observación levantada: ${r.estado.replace(/_/g, " ")}`),
                onError: (e) =>
                  avisar(e instanceof Error ? e.message : "No se pudo levantar", "error"),
              })
            }
            type="button"
          >
            <Undo2 size={14} />
            Levantar observación
          </Button>
        )}
      </section>
    );
  }
  if (!staff || !OBSERVABLES.has(d.estado)) return null;
  return (
    <div className="print:hidden">
      {abierto ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white p-3">
          <input
            aria-label="Motivo de la observación"
            className={cn(controlClase, "h-9 min-w-64 flex-1")}
            placeholder="Motivo de la observación (visible para el tesista)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <Button
            tamano="sm"
            variante="peligro"
            disabled={observar.isPending || motivo.trim().length < 5}
            onClick={() =>
              observar.mutate(
                { id: d.id, motivo: motivo.trim() },
                {
                  onSuccess: () => {
                    setMotivo("");
                    setAbierto(false);
                    avisar("Expediente observado; se notificó al tesista");
                  },
                  onError: (e) =>
                    avisar(e instanceof Error ? e.message : "No se pudo observar", "error"),
                },
              )
            }
            type="button"
          >
            Observar
          </Button>
          <Button tamano="sm" variante="contorno" onClick={() => setAbierto(false)} type="button">
            Cancelar
          </Button>
        </div>
      ) : (
        <Button tamano="sm" variante="contorno" onClick={() => setAbierto(true)} type="button">
          <MessageSquareWarning size={14} />
          Observar expediente
        </Button>
      )}
    </div>
  );
}

/** Acceso de los participantes a su portal (HU-0002). */
function AccesoPortal({ detalle: d }: { detalle: ExpedienteDetalleDTO }) {
  const enviar = useEnviarAcceso(d.id);
  const avisar = useToast();
  const participantes = [d.participante1, d.participante2].filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  if (participantes.length === 0) return null;
  const validado = d.estado !== "REGISTRADO" && d.estado !== "ANULADO";
  return (
    <Card className="mt-4 p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-navy-950">
            <KeyRound size={15} />
            Acceso al portal del tesista
          </h3>
          <ul className="mt-1 space-y-0.5 text-xs text-grafito-600">
            {participantes.map((p) => (
              <li key={p.id}>
                {p.nombres} {p.apellidos} · {p.email} ·{" "}
                <strong className={p.accesoActivo ? "text-verde-inst-700" : "text-aviso-800"}>
                  {p.accesoActivo ? "clave creada" : "sin clave"}
                </strong>
              </li>
            ))}
          </ul>
        </div>
        <Button
          tamano="sm"
          variante="contorno"
          disabled={!validado || enviar.isPending}
          title={validado ? undefined : "Disponible tras validar la inscripción"}
          onClick={() =>
            enviar.mutate(undefined, {
              onSuccess: (r) => avisar(`Enlace enviado a ${r.destinatarios.join(", ")}`),
              onError: (e) => avisar(e instanceof Error ? e.message : "No se pudo enviar", "error"),
            })
          }
          type="button"
        >
          Enviar enlace de acceso
        </Button>
      </div>
    </Card>
  );
}

interface ExtraFormatoCardProps {
  expedienteCodigo: string;
  formato: {
    id: string;
    tipo: string;
    nombre: string;
    version: number;
    pendientes: string[];
  };
}

function ExtraFormatoCard({ expedienteCodigo, formato: g }: ExtraFormatoCardProps) {
  const avisar = useToast();

  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-card hover:border-slate-300 transition-colors">
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-navy-950" title={g.nombre}>
          {g.nombre}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-grafito-600">
          <span className="font-semibold text-navy-900">v{g.version}</span>
          <span>·</span>
          {g.pendientes.length > 0 ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] text-amber-800 font-semibold">
              {g.pendientes.length} pendientes
            </span>
          ) : (
            <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] text-emerald-800 font-semibold">
              Completo
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center border-t border-slate-100 pt-2">
        <Button
          tamano="sm"
          variante="contorno"
          className="w-full justify-center"
          onClick={() =>
            void descargarArchivoProtegido(
              formatoDescargaUrl(g.id),
              resolverNombreArchivoDescarga(expedienteCodigo, g.tipo, "docx"),
            ).catch((e: unknown) =>
              avisar(e instanceof Error ? e.message : "No se pudo descargar", "error"),
            )
          }
          title={g.pendientes.length > 0 ? `Pendiente: ${g.pendientes.join(", ")}` : undefined}
          type="button"
        >
          <FileDown size={13} />
          Descargar
        </Button>
      </div>
    </div>
  );
}

function DocumentosTab({
  etapa,
  detalle: d,
  items,
  staff,
}: {
  etapa: "E1" | "E2";
  detalle: ExpedienteDetalleDTO;
  items: ExpedienteDetalleDTO["checklist"];
  staff: boolean;
}) {
  const generar = useGenerarDocumentos(d.id);
  const avisar = useToast();
  const [formatoAModificar, setFormatoAModificar] = useState<{
    tipo: string;
    nombre: string;
    version: number;
    pendientes: string[];
  } | null>(null);
  const [formatoAVer, setFormatoAVer] = useState<{
    id: string;
    tipo: string;
    nombre: string;
    version: number;
    pendientes?: string[];
  } | null>(null);
  const cargados = items.filter((c) => c.documentoId !== null).length;
  const pct = items.length > 0 ? Math.round((cargados / items.length) * 100) : 0;
  const generados = d.generados.filter((g) => g.etapa === etapa);
  const generadoPorTipo = new Map(generados.map((g) => [g.tipo, g]));
  // Formatos que no son tarjeta del checklist (carátula del plan, decreto, oficios, etc.).
  const extras = generados.filter((g) => !items.some((c) => c.tipo === g.tipo));

  async function onGenerar(): Promise<void> {
    try {
      const r = await generar.mutateAsync(etapa);
      const conPendientes = r.generados.filter((g) => g.pendientes.length > 0).length;
      avisar(
        `${r.generados.length} formato(s) generado(s)${conPendientes > 0 ? ` · ${conPendientes} con campos pendientes` : ""}`,
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudieron generar", "error");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 md:px-5">
          <div>
            <h2 className="text-sm font-bold text-navy-950">
              DOCUMENTOS - ETAPA {etapa === "E1" ? "01" : "02"}
            </h2>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-grafito-600">
              Inserción automática de datos ·
              <span className="font-bold tabular-nums text-navy-950">
                {cargados}/{items.length} · {pct}%
              </span>
            </p>
            <div
              className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  pct === 100 ? "bg-verde-inst-700" : "bg-dorado-500",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {staff && (
            <Button
              variante="primario"
              tamano="sm"
              disabled={generar.isPending || d.estado === "ANULADO"}
              onClick={() => void onGenerar()}
              type="button"
            >
              <WandSparkles size={14} />
              {generar.isPending ? "GENERANDO…" : "INSERTAR DATOS EN DOCUMENTOS"}
            </Button>
          )}
        </div>
        {extras.length > 0 && (
          <div className="border-t border-slate-200/70 p-4 md:px-5 bg-slate-50/40">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-950">
              Formatos Institucionales Emitidos ({extras.length})
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {extras.map((g) => (
                <ExtraFormatoCard key={g.id} expedienteCodigo={d.codigo} formato={g} />
              ))}
            </div>
          </div>
        )}
      </Card>
      {items.length === 0 ? (
        <EmptyState titulo="Sin documentos configurados para esta etapa" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((c) => (
            <DocumentoCard
              key={c.tipo}
              documentoId={c.documentoId}
              estado={c.estado}
              expedienteId={d.id}
              faltantes={c.faltantes}
              nombre={c.nombre}
              tipo={c.tipo}
              version={c.version}
              requeridoEn={c.requeridoEn}
              subetapaActiva={d.subetapaActiva?.clave ?? null}
              formato={generadoPorTipo.get(c.tipo) ?? null}
              etapa={etapa}
              etiquetaEtapa={
                etapa === "E1"
                  ? "Etapa 1 · Verificación"
                  : etapa === "E2"
                    ? "Etapa 2 · Borrador"
                    : "Etapa 6 · Aprobaciones"
              }
              onModificar={setFormatoAModificar}
              onVistaPrevia={setFormatoAVer}
            />
          ))}
        </div>
      )}
      <ModalModificarFormato
        abierto={!!formatoAModificar}
        onCerrar={() => setFormatoAModificar(null)}
        expedienteId={d.id}
        expediente={d}
        etapa={etapa}
        formato={formatoAModificar}
      />
      <ModalVistaPreviaFormato
        abierto={!!formatoAVer}
        onCerrar={() => setFormatoAVer(null)}
        codigoExpediente={d.codigo}
        formato={formatoAVer}
      />
    </div>
  );
}
