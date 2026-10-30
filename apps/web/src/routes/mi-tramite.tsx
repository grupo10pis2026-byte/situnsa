import { esDocumentoTesista } from "@pis/domain/dist/expediente/checklist-catalogo.js";
import {
  CheckCircle2,
  Clock,
  FileBadge,
  FileText,
  Flag,
  Gauge,
  Info,
  Lock,
  MessageSquare,
  MessageSquareWarning,
  MessagesSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useExpedienteDetalle, useListarExpedientes } from "../api/expedientes.js";
import { DocumentoCard } from "../components/domain/documento-card.js";
import { PropuestaFechasCard } from "../components/domain/propuesta-fechas-card.js";
import { SemaforoBadge } from "../components/domain/semaforo-badge.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Card, CardEncabezado } from "../components/ui/card.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { PageHeader } from "../components/ui/page-header.js";
import { StatCard } from "../components/ui/stat-card.js";
import { StatusBadge } from "../components/ui/status-badge.js";

/** Nombres canónicos de las 7 etapas del flujo institucional */
const NOMBRES_ETAPAS: Record<number, string> = {
  1: "Verificación Inicial de Documentos",
  2: "Presentación del Borrador de Tesis",
  3: "Evaluación del Expediente",
  4: "Programación y Sustentación",
  5: "Validaciones Institucionales",
  6: "Aprobaciones Institucionales",
  7: "Registro y Emisión del Título",
};

/** Determina la etapa numérica a la que pertenece un elemento del checklist */
function etapaDeDocumento(c: { requeridoEn: string | null; etapa: string }): number {
  if (c.requeridoEn) {
    const match = /^E(\d+)_/i.exec(c.requeridoEn);
    if (match?.[1]) return parseInt(match[1], 10);
  }
  return c.etapa === "E1" ? 1 : 2;
}

/** Expediente del tesista en sesión (?vista=mis, portal alumno legacy). */
function useMiExpedienteId(): string | null | undefined {
  const lista = useListarExpedientes({ q: "", estado: "", orden: "recientes", vista: "mis" });
  if (lista.isPending) return undefined;
  if (lista.isError) return null;
  return lista.data.items[0]?.id ?? null;
}

/** §5 Dashboard del Tesista: avance horizontal por etapas, subida documental e historial de observaciones. */
export function MiTramitePage() {
  const id = useMiExpedienteId();
  const query = useExpedienteDetalle(id ?? "", id !== undefined && id !== null);

  const [etapaSeleccionada, setEtapaSeleccionada] = useState<number>(1);

  // Sincronizar la etapa seleccionada inicialmente con la etapa actual del expediente
  useEffect(() => {
    if (query.data?.avance.etapaActual) {
      setEtapaSeleccionada(query.data.avance.etapaActual);
    }
  }, [query.data?.avance.etapaActual]);

  if (id === null) {
    return (
      <AppShell activo="/mi-tramite">
        <PageHeader titulo="Mi trámite de titulación" />
        <EmptyState
          titulo="Sin expediente asociado"
          descripcion="Aún no tienes un expediente asociado a tu identidad. Acércate a mesa de partes para iniciar tu trámite."
        />
      </AppShell>
    );
  }
  if (id === undefined || query.isPending) {
    return (
      <AppShell activo="/mi-tramite">
        <output className="space-y-3" aria-label="Cargando">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white" />
          ))}
        </output>
      </AppShell>
    );
  }
  if (query.isError) {
    return (
      <AppShell activo="/mi-tramite">
        <PageHeader titulo="Mi trámite de titulación" />
        <EmptyState
          titulo="No se pudo cargar tu trámite"
          descripcion="Ocurrió un problema al obtener tu expediente."
          accion={
            <button
              className="text-sm font-semibold text-navy-800 underline underline-offset-2"
              onClick={() => void query.refetch()}
              type="button"
            >
              Reintentar
            </button>
          }
        />
      </AppShell>
    );
  }

  const d = query.data;

  // Agrupación de subetapas por etapa
  const porEtapa = new Map<number, typeof d.subetapas>();
  for (const s of d.subetapas) {
    const arr = porEtapa.get(s.etapa) ?? [];
    arr.push(s);
    porEtapa.set(s.etapa, arr);
  }
  const listaEtapas = [1, 2, 3, 4, 5, 6, 7];

  const activa = d.subetapas.find((s) => s.estado === "EN_CURSO") ?? null;
  const generadoPorTipo = new Map(d.generados.map((g) => [g.tipo, g]));

  const ultimaObservacion =
    d.estado === "OBSERVADO"
      ? [...d.mensajes].reverse().find((m) => /Observaci|Similitud/i.test(m.texto))
      : undefined;

  // Filtrado de documentos pertenecientes a la etapa seleccionada (solo los que sube el alumno)
  const docsEtapa = d.checklist.filter((c) => etapaDeDocumento(c) === etapaSeleccionada);
  const docsTesista = docsEtapa.filter((c) => esDocumentoTesista(c.tipo));

  // Observaciones correspondientes a la etapa seleccionada (para etapas sin carga documental)
  const observacionesDeEstaEtapa = d.mensajes.filter((m) => {
    const txt = m.texto.toLowerCase();
    const coincideEtapa =
      (etapaSeleccionada === 1 && (txt.includes("plan") || txt.includes("inscripci") || txt.includes("e1"))) ||
      (etapaSeleccionada === 2 && (txt.includes("borrador") || txt.includes("anexo") || txt.includes("e2"))) ||
      (etapaSeleccionada === 3 && (txt.includes("jurado") || txt.includes("dictamen") || txt.includes("e3"))) ||
      (etapaSeleccionada === 4 && (txt.includes("sustenta") || txt.includes("fecha") || txt.includes("e4"))) ||
      (etapaSeleccionada === 5 && (txt.includes("similitud") || txt.includes("turnitin") || txt.includes("repositorio") || txt.includes("e5"))) ||
      (etapaSeleccionada === 6 && (txt.includes("secretar") || txt.includes("consejo") || txt.includes("comisi") || txt.includes("e6"))) ||
      (etapaSeleccionada === 7 && (txt.includes("título") || txt.includes("titulo") || txt.includes("sunedu") || txt.includes("colaci") || txt.includes("e7")));
    return (
      coincideEtapa ||
      (d.estado === "OBSERVADO" &&
        d.avance.etapaActual === etapaSeleccionada &&
        /Observaci|Similitud|Rechaz/i.test(m.texto))
    );
  });

  // Subetapas de la etapa seleccionada
  const subetapasDeEstaEtapa = porEtapa.get(etapaSeleccionada) ?? [];
  const hechosEstaEtapa = subetapasDeEstaEtapa.filter((s) => s.estado === "FINALIZADO").length;
  const totalEstaEtapa = subetapasDeEstaEtapa.length;

  return (
    <AppShell activo="/mi-tramite">
      <PageHeader
        titulo="Mi trámite de titulación"
        descripcion="Seguimiento personal de tu expediente y entrega de documentos."
        insignia={
          <>
            <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-bold text-navy-950">
              {d.codigo}
            </span>
            <StatusBadge estado={d.estado} />
          </>
        }
      />

      {/* Tarjetas de Métricas Generales */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          etiqueta="Expediente"
          valor={<span className="text-xl">{d.codigo}</span>}
          icono={<FileBadge size={20} />}
          acento="bg-navy-950"
        />
        <StatCard
          etiqueta="Etapa actual"
          valor={`Etapa ${d.avance.etapaActual}`}
          icono={<Flag size={20} />}
          acento="bg-dorado-500"
          pie={d.avance.subetapaActual ?? "Sin seguimiento"}
        />
        <StatCard
          etiqueta="Progreso"
          valor={`${d.avance.pct}%`}
          icono={<Gauge size={20} />}
          acento="bg-verde-inst-700"
          pie={`${d.avance.marcados} de ${d.avance.total} subetapas`}
        />
        <StatCard
          etiqueta="Mensajes y avisos"
          valor={d.mensajes.length}
          icono={<MessagesSquare size={20} />}
          acento="bg-slate-300"
          pie="Historial institucional"
        />
      </div>

      {/* Alerta de Observación General Vigente */}
      {d.estado === "OBSERVADO" && (
        <section
          className="flex gap-3 rounded-xl border border-yellow-300 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-xs"
          aria-label="Observación vigente"
        >
          <MessageSquareWarning size={20} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <div className="space-y-1">
            <p className="font-bold text-amber-950">
              Tu expediente tiene una observación por subsanar
            </p>
            {ultimaObservacion && (
              <p className="rounded-lg bg-white/70 p-2.5 text-xs text-slate-800 border border-amber-200">
                {ultimaObservacion.texto}
              </p>
            )}
            <p className="text-xs text-amber-800">
              Revisa la etapa correspondiente, consulta las observaciones de cada documento mediante
              el botón <strong>«Observaciones»</strong> y vuelve a subir los archivos subsanados.
            </p>
          </div>
        </section>
      )}

      {/* Subetapa en curso con indicador de plazo */}
      {activa && (
        <Card className="border-l-4 border-l-dorado-500">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 md:px-5">
            <div>
              <p className="text-xs font-bold tracking-wider text-grafito-600 uppercase">
                Subetapa en curso
              </p>
              <p className="text-sm font-bold text-navy-950">
                {activa.etapa}.{activa.orden} {activa.nombre}
              </p>
              <p className="text-xs text-grafito-600">
                Plazo reglamentario: {activa.plazo ?? "—"}
                {activa.vencimiento ? ` · vence el ${activa.vencimiento}` : ""}
              </p>
            </div>
            {activa.semaforo && activa.diasRestantes !== null && (
              <SemaforoBadge estado={activa.semaforo} dias={activa.diasRestantes} />
            )}
          </div>
        </Card>
      )}

      {d.estado === "APTO_SUSTENTACION" && <PropuestaFechasCard expedienteId={d.id} />}

      {/* ============================================================== */}
      {/* NAVEGACIÓN HORIZONTAL DE ETAPAS (Tabs / Stepper interactivo)   */}
      {/* ============================================================== */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-navy-950">
              Avance del trámite por etapas
            </h2>
            <p className="text-xs text-grafito-600">
              Selecciona una etapa para revisar sus subetapas y cargar la documentación
              correspondiente.
            </p>
          </div>
        </div>

        {/* Barra horizontal con scroll responsivo */}
        <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
          {listaEtapas.map((num) => {
            const subs = porEtapa.get(num) ?? [];
            const hechos = subs.filter((s) => s.estado === "FINALIZADO").length;
            const esActiva = num === d.avance.etapaActual;
            const esCompleta = subs.length > 0 && hechos === subs.length;
            const estaSeleccionada = etapaSeleccionada === num;

            return (
              <button
                key={num}
                type="button"
                onClick={() => setEtapaSeleccionada(num)}
                className={`flex min-w-[210px] flex-1 flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                  estaSeleccionada
                    ? "border-navy-900 bg-white ring-2 ring-navy-900/15 shadow-sm"
                    : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      estaSeleccionada
                        ? "bg-navy-900 text-white"
                        : esCompleta
                          ? "bg-emerald-100 text-emerald-800"
                          : esActiva
                            ? "bg-dorado-500 text-navy-950"
                            : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {num}
                  </span>

                  {/* Estado de la etapa */}
                  {esCompleta ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={11} />
                      Completa
                    </span>
                  ) : esActiva ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-dorado-100 px-1.5 py-0.5 text-[10px] font-bold text-navy-950 border border-dorado-300 animate-pulse">
                      <Clock size={11} />
                      En curso
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                      <Lock size={10} />
                      Pendiente
                    </span>
                  )}
                </div>

                <div className="mt-2.5 min-w-0">
                  <p
                    className={`truncate text-xs font-bold ${
                      estaSeleccionada ? "text-navy-950" : "text-slate-700"
                    }`}
                  >
                    Etapa {num}
                  </p>
                  <p className="truncate text-[11px] text-grafito-600">
                    {NOMBRES_ETAPAS[num] ?? `Etapa ${num}`}
                  </p>
                </div>

                <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-slate-200/50 text-[10px] font-semibold text-slate-500">
                  <span>Progreso:</span>
                  <span className="tabular-nums font-bold text-navy-900">
                    {hechos}/{subs.length || "—"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ============================================================== */}
      {/* SUBSECCIÓN DE LA ETAPA SELECCIONADA                             */}
      {/* ============================================================== */}
      <Card className="border border-slate-200 shadow-xs">
        <div className="border-b border-slate-200/80 bg-slate-50/60 p-4 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-navy-900 px-2 py-0.5 text-xs font-bold text-white">
                  Etapa {etapaSeleccionada}
                </span>
                <h3 className="text-base font-bold text-navy-950">
                  {NOMBRES_ETAPAS[etapaSeleccionada] ?? `Etapa ${etapaSeleccionada}`}
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-grafito-600">
                {subetapasDeEstaEtapa[0]?.responsable
                  ? `Área responsable: ${subetapasDeEstaEtapa[0].responsable} · `
                  : ""}
                Progreso de la etapa:{" "}
                <strong>
                  {hechosEstaEtapa} de {totalEstaEtapa} subetapas completadas
                </strong>
              </p>
            </div>
            {etapaSeleccionada === d.avance.etapaActual && (
              <span className="inline-flex items-center gap-1 rounded-full bg-dorado-100 px-2.5 py-1 text-xs font-bold text-navy-950 border border-dorado-300">
                <Clock size={13} />
                Etapa activa del expediente
              </span>
            )}
          </div>

          {/* Lista compacta de subetapas de la etapa */}
          {subetapasDeEstaEtapa.length > 0 && (
            <div className="mt-3.5 space-y-1.5 rounded-xl bg-white p-3 border border-slate-200">
              <p className="text-[11px] font-bold uppercase tracking-wider text-grafito-600">
                Subetapas correspondientes a esta etapa:
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {subetapasDeEstaEtapa.map((s) => (
                  <div
                    key={`${s.etapa}.${s.orden}`}
                    className={`flex items-center justify-between gap-2 rounded-lg p-2 text-xs border ${
                      s.estado === "FINALIZADO"
                        ? "border-emerald-100 bg-emerald-50/40 text-slate-800"
                        : s.estado === "EN_CURSO"
                          ? "border-dorado-300 bg-dorado-50/50 font-semibold text-navy-950 shadow-xs"
                          : "border-slate-100 bg-slate-50/60 text-slate-600"
                    }`}
                  >
                    <span className="truncate">
                      <strong className="tabular-nums">
                        {s.etapa}.{s.orden}
                      </strong>{" "}
                      {s.nombre}
                    </span>
                    <StatusBadge estado={s.estado} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* DOCUMENTACIÓN / OBSERVACIONES DE LA ETAPA SELECCIONADA         */}
        {/* ============================================================== */}
        <div className="p-4 md:p-5 space-y-6">
          {docsTesista.length > 0 ? (
            /* 1. DOCUMENTOS A PRESENTAR POR EL ALUMNO (con observaciones en cada tarjeta) */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                <div>
                  <h4 className="text-sm font-bold text-navy-950 flex items-center gap-1.5">
                    <FileText size={16} className="text-navy-800" />
                    Documentos a presentar por el alumno ({docsTesista.length})
                  </h4>
                  <p className="text-xs text-grafito-600">
                    Archivos de tu autoría, solicitudes y declaraciones juradas que debes firmar y
                    adjuntar en PDF. En caso de recibir observaciones a un documento, se mostrarán directamente en su tarjeta.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                {docsTesista.map((c) => (
                  <DocumentoCard
                    key={c.tipo}
                    documentoId={c.documentoId}
                    estado={c.estado}
                    expedienteId={d.id}
                    faltantes={c.documentoId ? [] : ["Falta adjuntar el archivo"]}
                    nombre={c.nombre}
                    tipo={c.tipo}
                    version={c.version}
                    requeridoEn={c.requeridoEn}
                    subetapaActiva={d.subetapaActiva?.clave ?? null}
                    formato={generadoPorTipo.get(c.tipo) ?? null}
                    etiquetaEtapa={`Etapa ${etapaSeleccionada}`}
                    permitirSubir={true}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* 2. ETAPA SIN CARGA DOCUMENTAL: APARTADO EXCLUSIVO DE OBSERVACIONES Y ESTADO */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                <div>
                  <h4 className="text-sm font-bold text-navy-950 flex items-center gap-1.5">
                    <MessageSquare size={16} className="text-navy-800" />
                    Observaciones y estado de revisión de la Etapa {etapaSeleccionada}
                  </h4>
                  <p className="text-xs text-grafito-600">
                    En esta etapa no se requiere que subas documentación personal. El trámite se procesa internamente por el jurado o la facultad.
                  </p>
                </div>
              </div>

              {/* Si hay observaciones vigentes para esta etapa */}
              {observacionesDeEstaEtapa.length > 0 ? (
                <div className="space-y-3">
                  {observacionesDeEstaEtapa.map((obs) => (
                    <div
                      key={obs.id}
                      className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-sm text-amber-950 shadow-xs space-y-2"
                    >
                      <div className="flex items-start gap-2.5">
                        <MessageSquareWarning size={20} className="text-amber-700 shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-1">
                          <p className="font-bold text-amber-950">Observación emitida por el área / jurado</p>
                          <p className="rounded-lg bg-white/90 p-3 text-xs text-slate-800 border border-amber-200 leading-relaxed font-medium">
                            {obs.texto}
                          </p>
                          <p className="text-[11px] text-amber-800 pt-0.5">
                            Fecha de notificación:{" "}
                            {new Date(obs.createdAt).toLocaleString("es-PE", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-grafito-600 space-y-1.5">
                  <CheckCircle2 size={24} className="mx-auto text-emerald-600 mb-1" />
                  <p className="font-semibold text-slate-800 text-sm">
                    Sin observaciones en la Etapa {etapaSeleccionada}
                  </p>
                  <p className="text-[12px] text-slate-500 max-w-md mx-auto">
                    {etapaSeleccionada === d.avance.etapaActual
                      ? "Esta etapa se encuentra en curso bajo revisión de los jurados o del área correspondiente. Si se registra alguna observación, se notificará en este apartado."
                      : etapaSeleccionada < d.avance.etapaActual
                        ? "Esta etapa fue completada satisfactoriamente sin observaciones pendientes."
                        : "Esta etapa aún no ha iniciado. Podrás consultar su estado cuando tu expediente avance a ella."}
                  </p>
                </div>
              )}

              {/* En Etapa 4, si está apto para sustentar, mostrar el selector de fechas */}
              {etapaSeleccionada === 4 && d.estado === "APTO_SUSTENTACION" && (
                <div className="pt-2">
                  <PropuestaFechasCard expedienteId={d.id} />
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ============================================================== */}
      {/* MENSAJES Y ACTUALIZACIONES DEL EXPEDIENTE                      */}
      {/* ============================================================== */}
      <Card>
        <CardEncabezado
          titulo="Actualizaciones y mensajes del trámite"
          descripcion="Comunicaciones emitidas por la administración y avisos institucionales"
        />
        <div className="p-4 md:px-5">
          {d.mensajes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-grafito-600">
              <MessageSquare size={24} className="mx-auto text-slate-400 mb-1.5" />
              <p className="font-medium text-slate-700">Sin mensajes ni observaciones generales</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Las comunicaciones oficiales y avisos de mesa de partes aparecerán en esta sección.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {[...d.mensajes].reverse().map((m) => (
                <li
                  className="rounded-xl border-l-4 border-l-dorado-500 bg-slate-50/80 p-3.5 border border-slate-200/60 shadow-2xs"
                  key={m.id}
                >
                  <p className="text-sm font-medium text-navy-950 leading-relaxed">{m.texto}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-grafito-600">
                    <span>Aviso del expediente</span>
                    <span>
                      {new Date(m.createdAt).toLocaleString("es-PE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
