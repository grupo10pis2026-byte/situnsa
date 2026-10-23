import type { EstadoConformidadDocumento } from "@pis/contracts";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileCheck,
  FileText,
  FileX,
  History,
  Pencil,
  Sparkles,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { abrirArchivoProtegido } from "../api/expedientes.js";
import {
  documentoSolicitudUrl,
  useActualizarConformidadDocumento,
  useActualizarDatosMenores,
  useSolicitudDetalle,
} from "../api/solicitudes.js";
import { ModalAceptarExpediente } from "../components/domain/solicitudes/modal-aceptar-expediente.js";
import { ModalObservarSolicitud } from "../components/domain/solicitudes/modal-observar-solicitud.js";
import { ModalRechazarSolicitud } from "../components/domain/solicitudes/modal-rechazar-solicitud.js";
import { AppShell } from "../components/layout/app-shell.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { Dialogo } from "../components/ui/dialog.js";
import { Field, ReadonlyField } from "../components/ui/field.js";
import { StatusBadge } from "../components/ui/status-badge.js";

export function SolicitudDetallePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();

  const { data: sol, isLoading, error, refetch } = useSolicitudDetalle(id);
  const conformidadMutation = useActualizarConformidadDocumento(id);
  const actualizarDatosMutation = useActualizarDatosMenores(id);

  // Estados de modales
  const [modalObservar, setModalObservar] = useState(false);
  const [modalRechazar, setModalRechazar] = useState(false);
  const [modalAceptar, setModalAceptar] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);

  // Estado del modal de edición de datos menores
  const [tituloEdit, setTituloEdit] = useState("");
  const [telefonoP1Edit, setTelefonoP1Edit] = useState("");
  const [ciudadP1Edit, setCiudadP1Edit] = useState("");
  const [direccionP1Edit, setDireccionP1Edit] = useState("");
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  function abrirEdicion() {
    if (!sol) return;
    setTituloEdit(sol.titulo);
    const p1 = sol.participantes[0];
    setTelefonoP1Edit(p1?.telefono ?? "");
    setCiudadP1Edit(p1?.ciudad ?? "");
    setDireccionP1Edit(p1?.direccion ?? "");
    setErrorEdicion(null);
    setModalEditar(true);
  }

  async function handleGuardarEdicion() {
    if (!sol) return;
    setErrorEdicion(null);
    const p1 = sol.participantes[0];
    try {
      await actualizarDatosMutation.mutateAsync({
        titulo: tituloEdit.trim() !== sol.titulo ? tituloEdit.trim() : undefined,
        participantes: p1
          ? [
              {
                id: p1.id,
                telefono: telefonoP1Edit.trim() || undefined,
                ciudad: ciudadP1Edit.trim() || undefined,
                direccion: direccionP1Edit.trim() || undefined,
              },
            ]
          : undefined,
      });
      setModalEditar(false);
      void refetch();
    } catch (err: unknown) {
      setErrorEdicion(err instanceof Error ? err.message : "Error al guardar los cambios");
    }
  }

  async function cambiarConformidad(documentoId: string, estado: EstadoConformidadDocumento) {
    await conformidadMutation.mutateAsync({
      documentoId,
      estadoConformidad: estado,
    });
  }

  if (isLoading) {
    return (
      <AppShell activo="/solicitudes">
        <div className="p-8 text-center text-sm text-grafito-600">
          Cargando detalle de la solicitud...
        </div>
      </AppShell>
    );
  }

  if (error || !sol) {
    return (
      <AppShell activo="/solicitudes">
        <div className="p-8 text-center text-sm text-red-600">
          No se pudo cargar la solicitud. Verifique el identificador o sus permisos de acceso.
        </div>
      </AppShell>
    );
  }

  const p1 = sol.participantes.find((p) => p.orden === 1);
  const p2 = sol.participantes.find((p) => p.orden === 2);
  const cerrada = sol.estado === "ACEPTADA" || sol.estado === "RECHAZADA";
  const checklistAprobado =
    sol.documentos.length > 0 && sol.documentos.every((d) => d.estadoConformidad === "CONFORME");

  return (
    <AppShell activo="/solicitudes">
      <div className="space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Cabecera y Barra de Acciones */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/solicitudes">
              <Button tamano="sm" variante="contorno">
                <ArrowLeft size={14} /> Volver
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-xl font-bold text-navy-950">{sol.codigo}</h1>
                <StatusBadge estado={sol.estado} />
                {sol.esPlazoVencido && sol.estado === "OBSERVADA" && (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                    Plazo Vencido
                  </span>
                )}
              </div>
              <p className="text-xs text-grafito-600">
                {sol.via === "REGULAR" ? "Vía Regular" : "Taller de Tesis"} · {sol.modalidad} ·{" "}
                Recibido el {new Date(sol.fechaRecepcion).toLocaleDateString("es-PE")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!cerrada && (
              <>
                <Button onClick={abrirEdicion} tamano="sm" variante="contorno">
                  <Pencil size={14} /> Corregir Datos
                </Button>
                <Button onClick={() => setModalObservar(true)} tamano="sm" variante="contorno">
                  <AlertTriangle className="text-orange-600" size={14} /> Observar
                </Button>
                <Button onClick={() => setModalRechazar(true)} tamano="sm" variante="peligro">
                  <FileX size={14} /> Rechazar
                </Button>
                <Button
                  disabled={!checklistAprobado}
                  onClick={() => setModalAceptar(true)}
                  tamano="sm"
                  title={
                    !checklistAprobado
                      ? "Todos los documentos deben estar en estado CONFORME para aceptar la solicitud (ninguno PENDIENTE u OBSERVADO)"
                      : undefined
                  }
                  variante="exito"
                >
                  <Sparkles size={14} /> Aceptar y Crear SET
                </Button>
              </>
            )}

            {sol.expedienteId && (
              <Link params={{ id: sol.expedienteId }} to="/expedientes/$id">
                <Button tamano="sm" variante="primario">
                  <ExternalLink size={14} /> Ver Expediente {sol.expedienteCodigo ?? "SET"}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Motivo de observación o rechazo si existen */}
        {sol.motivoObservacion && (
          <Card className="border-orange-200 bg-orange-50/70 p-4 text-xs text-orange-950">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 shrink-0 text-orange-600" size={16} />
              <div>
                <p className="font-bold">Observación Activa:</p>
                <p className="mt-0.5 whitespace-pre-line text-orange-900 leading-relaxed font-medium">
                  {sol.motivoObservacion}
                </p>
                {sol.fechaLimiteSubsanacion && (
                  <p className="mt-1 font-semibold text-orange-800">
                    Fecha límite para subsanación: {sol.fechaLimiteSubsanacion}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {sol.motivoRechazo && (
          <Card className="border-red-200 bg-red-50/70 p-4 text-xs text-red-950">
            <div className="flex items-start gap-2.5">
              <XCircle className="mt-0.5 shrink-0 text-red-600" size={16} />
              <div>
                <p className="font-bold">Fundamento Reglamentario de Rechazo:</p>
                <p className="mt-0.5 whitespace-pre-line text-red-900 leading-relaxed font-medium">
                  {sol.motivoRechazo}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Distribución Principal en 2 Columnas */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Columna Izquierda (2 spans) */}
          <div className="space-y-5 lg:col-span-2">
            {/* Card Datos del Plan */}
            <Card className="p-5 shadow-card space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                Información Académica
              </h2>
              <ReadonlyField etiqueta="Título del Plan" valor={sol.titulo} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ReadonlyField etiqueta="Programa" valor={sol.programa} className="sm:col-span-2" />
                <ReadonlyField
                  etiqueta="Año de Egreso"
                  valor={sol.anioEgreso ? String(sol.anioEgreso) : "—"}
                />
              </div>
            </Card>

            {/* Card Participante 1 */}
            {p1 && (
              <Card className="p-5 shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-navy-800" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                      Tesista Titular
                    </h2>
                  </div>
                  {p1.poseeCuentaPrevia && (
                    <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-bold">
                      Cuenta Previa Detectada
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ReadonlyField etiqueta="Nombres" valor={p1.nombres} />
                  <ReadonlyField etiqueta="Apellidos" valor={p1.apellidos} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ReadonlyField etiqueta="DNI" valor={p1.dni} />
                  <ReadonlyField etiqueta="CUI" valor={p1.cui ?? "—"} />
                  <ReadonlyField etiqueta="Teléfono" valor={p1.telefono ?? "—"} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ReadonlyField etiqueta="Correo Electrónico" valor={p1.email} />
                  <ReadonlyField etiqueta="Ciudad" valor={p1.ciudad ?? "—"} />
                </div>

                <ReadonlyField etiqueta="Dirección" valor={p1.direccion ?? "—"} />
              </Card>
            )}

            {/* Card Participante 2 si existe */}
            {p2 && (
              <Card className="p-5 shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-navy-800" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                      Segundo Tesista (Co-Tesista)
                    </h2>
                  </div>
                  {p2.poseeCuentaPrevia && (
                    <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-bold">
                      Cuenta Previa Detectada
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ReadonlyField etiqueta="Nombres" valor={p2.nombres} />
                  <ReadonlyField etiqueta="Apellidos" valor={p2.apellidos} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ReadonlyField etiqueta="DNI" valor={p2.dni} />
                  <ReadonlyField etiqueta="CUI" valor={p2.cui ?? "—"} />
                  <ReadonlyField etiqueta="Teléfono" valor={p2.telefono ?? "—"} />
                </div>

                <ReadonlyField etiqueta="Correo Electrónico" valor={p2.email} />
              </Card>
            )}

            {/* Checklist Documentario (RF-02xx[008]) */}
            <Card className="p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                    Checklist Documentario
                  </h2>
                  <p className="text-[11px] text-grafito-500">
                    Verifique cada requisito adjunto y marque su estado de conformidad.
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-navy-950">
                  {sol.documentos.filter((d) => d.estadoConformidad === "CONFORME").length} /{" "}
                  {sol.documentos.length} conformes
                </span>
              </div>

              <div className="space-y-3">
                {sol.documentos.map((doc) => (
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
                    key={doc.id}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <FileText size={16} />
                      </span>
                      <div className="min-w-0 text-xs">
                        <p className="font-bold text-navy-950 truncate">{doc.nombreOriginal}</p>
                        <p className="text-grafito-500 text-[11px]">
                          {doc.tipo} · {Math.round(doc.pesoBytes / 1024)} KB · Versión {doc.version}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className="rounded p-1 text-slate-500 hover:text-navy-950 hover:bg-slate-100 transition-colors"
                        onClick={() =>
                          void abrirArchivoProtegido(documentoSolicitudUrl(sol.id, doc.id))
                        }
                        title="Ver documento adjunto"
                        type="button"
                      >
                        <ExternalLink size={16} />
                      </button>

                      <StatusBadge estado={doc.estadoConformidad} />

                      {!cerrada && (
                        <div className="flex items-center gap-1 border-l pl-2 border-slate-200">
                          <button
                            className="rounded p-1 text-slate-400 hover:text-verde-inst-700 hover:bg-verde-inst-50"
                            disabled={conformidadMutation.isPending}
                            onClick={() => void cambiarConformidad(doc.id, "CONFORME")}
                            title="Marcar Conforme"
                            type="button"
                          >
                            <FileCheck size={16} />
                          </button>
                          <button
                            className="rounded p-1 text-slate-400 hover:text-orange-600 hover:bg-orange-50"
                            disabled={conformidadMutation.isPending}
                            onClick={() => void cambiarConformidad(doc.id, "OBSERVADO")}
                            title="Marcar Observado"
                            type="button"
                          >
                            <AlertTriangle size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Columna Derecha (Trazabilidad e Historial) */}
          <div className="space-y-5">
            <Card className="p-5 shadow-card space-y-4">
              <div className="flex items-center gap-2">
                <History size={16} className="text-navy-800" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                  Trazabilidad de la Solicitud
                </h2>
              </div>

              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {sol.trazabilidad.map((h) => (
                  <div className="relative text-xs" key={h.id}>
                    <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-navy-800 shadow-sm" />
                    <div className="rounded-lg bg-slate-50/80 p-2.5 border border-slate-200/80">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-navy-950 uppercase text-[10px]">
                          {h.accion}
                        </span>
                        <span className="text-[10px] text-grafito-400">
                          {new Date(h.fechaHora).toLocaleDateString("es-PE", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-grafito-700 leading-snug">
                        {h.detalle ?? "Evento registrado"}
                      </p>
                      <p className="mt-1 text-[10px] font-mono text-grafito-500">
                        Actor: {h.actor}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Modales de Gestión */}
      <ModalObservarSolicitud
        abierto={modalObservar}
        codigoSolicitud={sol.codigo}
        onAbierto={setModalObservar}
        onExito={() => void refetch()}
        solicitudId={sol.id}
      />

      <ModalRechazarSolicitud
        abierto={modalRechazar}
        codigoSolicitud={sol.codigo}
        onAbierto={setModalRechazar}
        onExito={() => void refetch()}
        solicitudId={sol.id}
      />

      <ModalAceptarExpediente
        abierto={modalAceptar}
        onAbierto={setModalAceptar}
        onExito={(expId) => {
          void navigate({ to: `/expedientes/${expId}` });
        }}
        solicitud={sol}
      />

      {/* Modal de Edición de Datos Menores */}
      <Dialogo
        abierto={modalEditar}
        ancho="max-w-lg"
        descripcion="Corrija errores tipográficos o actualice datos de contacto antes de aprobar."
        onAbierto={setModalEditar}
        titulo="Corrección de Datos de la Solicitud"
      >
        <div className="space-y-4 text-xs">
          {errorEdicion && (
            <div className="rounded-lg bg-red-50 p-2.5 text-red-700 font-medium">
              {errorEdicion}
            </div>
          )}

          <Field etiqueta="Título del Plan">
            <textarea
              className="w-full rounded-lg border border-slate-300 p-2 text-xs shadow-card focus:border-navy-800 focus:outline-none"
              rows={3}
              value={tituloEdit}
              onChange={(e) => setTituloEdit(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field etiqueta="Teléfono del Tesista">
              <input
                className="h-8 w-full rounded-lg border border-slate-300 px-2 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                value={telefonoP1Edit}
                onChange={(e) => setTelefonoP1Edit(e.target.value)}
              />
            </Field>
            <Field etiqueta="Ciudad">
              <input
                className="h-8 w-full rounded-lg border border-slate-300 px-2 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                value={ciudadP1Edit}
                onChange={(e) => setCiudadP1Edit(e.target.value)}
              />
            </Field>
          </div>

          <Field etiqueta="Dirección">
            <input
              className="h-8 w-full rounded-lg border border-slate-300 px-2 text-xs shadow-card focus:border-navy-800 focus:outline-none"
              value={direccionP1Edit}
              onChange={(e) => setDireccionP1Edit(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button
              disabled={actualizarDatosMutation.isPending}
              onClick={() => setModalEditar(false)}
              tamano="sm"
              variante="contorno"
            >
              Cancelar
            </Button>
            <Button
              disabled={actualizarDatosMutation.isPending}
              onClick={() => void handleGuardarEdicion()}
              tamano="sm"
              variante="primario"
            >
              {actualizarDatosMutation.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>
      </Dialogo>
    </AppShell>
  );
}
