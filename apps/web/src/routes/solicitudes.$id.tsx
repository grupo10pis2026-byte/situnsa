import type { EstadoConformidadDocumento, Modalidad } from "@pis/contracts";
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
  Save,
  Sparkles,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { Field, ReadonlyField } from "../components/ui/field.js";
import { StatusBadge } from "../components/ui/status-badge.js";
import { Tab, TabPanel, Tabs, TabsLista } from "../components/ui/tabs.js";

function formatoModalidad(m: Modalidad | string): string {
  if (m === "TESIS") return "Modalidad de Tesis";
  if (m === "TRABAJO_ACADEMICO") return "Modalidad de Trabajo Académico";
  if (m === "ARTICULO") return "Tesis o Artículo en Revista Indexada";
  return m;
}

export function SolicitudDetallePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();

  const { data: sol, isLoading, error, refetch } = useSolicitudDetalle(id);
  const conformidadMutation = useActualizarConformidadDocumento(id);
  const actualizarDatosMutation = useActualizarDatosMenores(id);

  // Pestaña activa
  const [tab, setTab] = useState("datos");

  // Estados de modales de acción
  const [modalObservar, setModalObservar] = useState(false);
  const [modalRechazar, setModalRechazar] = useState(false);
  const [modalAceptar, setModalAceptar] = useState(false);

  // Estado de edición inline
  const [editando, setEditando] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  // Campos editables
  const [tituloEdit, setTituloEdit] = useState("");
  const [p1Nombres, setP1Nombres] = useState("");
  const [p1Apellidos, setP1Apellidos] = useState("");
  const [p1Cui, setP1Cui] = useState("");
  const [p1Telefono, setP1Telefono] = useState("");
  const [p1Ciudad, setP1Ciudad] = useState("");
  const [p1Direccion, setP1Direccion] = useState("");

  const [p2Nombres, setP2Nombres] = useState("");
  const [p2Apellidos, setP2Apellidos] = useState("");
  const [p2Cui, setP2Cui] = useState("");
  const [p2Telefono, setP2Telefono] = useState("");
  const [p2Ciudad, setP2Ciudad] = useState("");
  const [p2Direccion, setP2Direccion] = useState("");

  // Sincronizar estado local al cargar la solicitud
  useEffect(() => {
    if (!sol) return;
    setTituloEdit(sol.titulo);
    const p1 = sol.participantes.find((p) => p.orden === 1);
    const p2 = sol.participantes.find((p) => p.orden === 2);

    if (p1) {
      setP1Nombres(p1.nombres);
      setP1Apellidos(p1.apellidos);
      setP1Cui(p1.cui ?? "");
      setP1Telefono(p1.telefono ?? "");
      setP1Ciudad(p1.ciudad ?? "");
      setP1Direccion(p1.direccion ?? "");
    }
    if (p2) {
      setP2Nombres(p2.nombres);
      setP2Apellidos(p2.apellidos);
      setP2Cui(p2.cui ?? "");
      setP2Telefono(p2.telefono ?? "");
      setP2Ciudad(p2.ciudad ?? "");
      setP2Direccion(p2.direccion ?? "");
    }
  }, [sol]);

  function cancelarEdicion() {
    if (!sol) return;
    setTituloEdit(sol.titulo);
    const p1 = sol.participantes.find((p) => p.orden === 1);
    const p2 = sol.participantes.find((p) => p.orden === 2);
    if (p1) {
      setP1Nombres(p1.nombres);
      setP1Apellidos(p1.apellidos);
      setP1Cui(p1.cui ?? "");
      setP1Telefono(p1.telefono ?? "");
      setP1Ciudad(p1.ciudad ?? "");
      setP1Direccion(p1.direccion ?? "");
    }
    if (p2) {
      setP2Nombres(p2.nombres);
      setP2Apellidos(p2.apellidos);
      setP2Cui(p2.cui ?? "");
      setP2Telefono(p2.telefono ?? "");
      setP2Ciudad(p2.ciudad ?? "");
      setP2Direccion(p2.direccion ?? "");
    }
    setErrorEdicion(null);
    setEditando(false);
  }

  async function handleGuardarEdicionInline() {
    if (!sol) return;
    setErrorEdicion(null);

    const p1 = sol.participantes.find((p) => p.orden === 1);
    const p2 = sol.participantes.find((p) => p.orden === 2);

    // Validar teléfonos si están presentes
    if (p1Telefono.trim() && !/^\d{9}$/.test(p1Telefono.trim())) {
      setErrorEdicion("El teléfono del Participante 1 debe tener 9 dígitos numéricos");
      return;
    }
    if (p2 && p2Telefono.trim() && !/^\d{9}$/.test(p2Telefono.trim())) {
      setErrorEdicion("El teléfono del Participante 2 debe tener 9 dígitos numéricos");
      return;
    }

    try {
      const participantesPayload = [];
      if (p1) {
        participantesPayload.push({
          id: p1.id,
          nombres: p1Nombres.trim() || undefined,
          apellidos: p1Apellidos.trim() || undefined,
          cui: p1Cui.trim() || undefined,
          telefono: p1Telefono.trim() || undefined,
          ciudad: p1Ciudad.trim() || undefined,
          direccion: p1Direccion.trim() || undefined,
        });
      }
      if (p2) {
        participantesPayload.push({
          id: p2.id,
          nombres: p2Nombres.trim() || undefined,
          apellidos: p2Apellidos.trim() || undefined,
          cui: p2Cui.trim() || undefined,
          telefono: p2Telefono.trim() || undefined,
          ciudad: p2Ciudad.trim() || undefined,
          direccion: p2Direccion.trim() || undefined,
        });
      }

      await actualizarDatosMutation.mutateAsync({
        titulo: tituloEdit.trim() !== sol.titulo ? tituloEdit.trim() : undefined,
        participantes: participantesPayload.length > 0 ? participantesPayload : undefined,
      });

      setEditando(false);
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
        <div className="p-12 text-center text-sm text-grafito-600">
          Cargando detalle de la solicitud...
        </div>
      </AppShell>
    );
  }

  if (error || !sol) {
    return (
      <AppShell activo="/solicitudes">
        <div className="p-12 text-center text-sm text-red-600">
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

  const conformesCount = sol.documentos.filter((d) => d.estadoConformidad === "CONFORME").length;

  return (
    <AppShell activo="/solicitudes">
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Cabecera y Barra de Acciones */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/solicitudes">
              <Button tamano="sm" variante="contorno">
                <ArrowLeft size={14} /> Volver
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-mono text-xl font-bold text-navy-950">{sol.codigo}</h1>
                <StatusBadge estado={sol.estado} />
                {sol.esPlazoVencido && sol.estado === "OBSERVADA" && (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                    Plazo Vencido
                  </span>
                )}
              </div>
              <p className="text-xs text-grafito-600 mt-0.5">
                {formatoModalidad(sol.modalidad)} · Recibido el{" "}
                {new Date(sol.fechaRecepcion).toLocaleDateString("es-PE")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!cerrada && !editando && (
              <>
                <Button onClick={() => setEditando(true)} tamano="sm" variante="contorno">
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
                      ? "Todos los documentos deben estar en estado CONFORME para aceptar la solicitud"
                      : undefined
                  }
                  variante="exito"
                >
                  <Sparkles size={14} /> Aceptar y Crear SET
                </Button>
              </>
            )}

            {!cerrada && editando && (
              <>
                <Button onClick={cancelarEdicion} tamano="sm" variante="contorno">
                  <X size={14} /> Cancelar
                </Button>
                <Button
                  disabled={actualizarDatosMutation.isPending}
                  onClick={() => void handleGuardarEdicionInline()}
                  tamano="sm"
                  variante="primario"
                >
                  <Save size={14} />{" "}
                  {actualizarDatosMutation.isPending ? "Guardando..." : "Guardar Cambios"}
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

        {/* Notificación de observación o rechazo activo */}
        {sol.motivoObservacion && (
          <Card className="border-orange-200 bg-orange-50/70 p-4 text-xs text-orange-950">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 shrink-0 text-orange-600" size={16} />
              <div>
                <p className="font-bold">Observación Activa para el Estudiante:</p>
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

        {errorEdicion && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {errorEdicion}
          </div>
        )}

        {/* Pestañas organizadas al estilo de Expediente */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsLista aria-label="Pestañas de la solicitud">
            <Tab value="datos">Datos de la Solicitud</Tab>
            <Tab value="documentos" contador={`${conformesCount}/${sol.documentos.length}`}>
              Documentos Adjuntos
            </Tab>
            <Tab value="historial">Trazabilidad</Tab>
          </TabsLista>

          {/* PANEL 1: DATOS */}
          <TabPanel value="datos" className="pt-4 space-y-6">
            {/* Card Información Académica */}
            <Card className="p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                  Información Académica
                </h2>
                {editando && (
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    Modo Edición Activo
                  </span>
                )}
              </div>

              {editando ? (
                <Field etiqueta="Título del Plan o Trabajo">
                  <textarea
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-grafito-900 shadow-card focus:border-navy-800 focus:outline-none"
                    rows={3}
                    value={tituloEdit}
                    onChange={(e) => setTituloEdit(e.target.value)}
                  />
                </Field>
              ) : (
                <ReadonlyField etiqueta="Título del Plan o Trabajo" valor={sol.titulo} />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadonlyField etiqueta="Modalidad" valor={formatoModalidad(sol.modalidad)} />
                <ReadonlyField etiqueta="Programa" valor={sol.programa} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadonlyField
                  etiqueta="Año de Egreso"
                  valor={sol.anioEgreso ? String(sol.anioEgreso) : "—"}
                />
                <ReadonlyField
                  etiqueta="Cantidad de Participantes"
                  valor={sol.cantidadTesistas === 1 ? "1 Participante" : "2 Participantes"}
                />
              </div>
            </Card>

            {/* Card Participante 1 */}
            {p1 && (
              <Card className="p-6 shadow-card space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-navy-800" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                      Participante 1
                    </h2>
                  </div>
                  {p1.poseeCuentaPrevia && (
                    <span className="rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-[10px] font-bold">
                      Cuenta Previa Detectada
                    </span>
                  )}
                </div>

                {/* Formulario en 2 columnas pares */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {editando ? (
                    <>
                      <Field etiqueta="Nombres">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                          value={p1Nombres}
                          onChange={(e) => setP1Nombres(e.target.value)}
                        />
                      </Field>
                      <Field etiqueta="Apellidos">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                          value={p1Apellidos}
                          onChange={(e) => setP1Apellidos(e.target.value)}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <ReadonlyField etiqueta="Nombres" valor={p1.nombres} />
                      <ReadonlyField etiqueta="Apellidos" valor={p1.apellidos} />
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReadonlyField etiqueta="DNI" valor={p1.dni} />
                  {editando ? (
                    <Field etiqueta="CUI (8 dígitos)">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono shadow-card focus:border-navy-800 focus:outline-none"
                        maxLength={8}
                        value={p1Cui}
                        onChange={(e) => setP1Cui(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      />
                    </Field>
                  ) : (
                    <ReadonlyField etiqueta="CUI" valor={p1.cui ?? "—"} />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReadonlyField etiqueta="Correo Electrónico Institucional" valor={p1.email} />
                  {editando ? (
                    <Field etiqueta="Teléfono / Celular (9 dígitos)">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                        maxLength={9}
                        value={p1Telefono}
                        onChange={(e) =>
                          setP1Telefono(e.target.value.replace(/\D/g, "").slice(0, 9))
                        }
                      />
                    </Field>
                  ) : (
                    <ReadonlyField etiqueta="Teléfono / Celular" valor={p1.telefono ?? "—"} />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {editando ? (
                    <>
                      <Field etiqueta="Dirección">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                          value={p1Direccion}
                          onChange={(e) => setP1Direccion(e.target.value)}
                        />
                      </Field>
                      <Field etiqueta="Ciudad">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                          value={p1Ciudad}
                          onChange={(e) => setP1Ciudad(e.target.value)}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <ReadonlyField etiqueta="Dirección" valor={p1.direccion ?? "—"} />
                      <ReadonlyField etiqueta="Ciudad" valor={p1.ciudad ?? "—"} />
                    </>
                  )}
                </div>
              </Card>
            )}

            {/* Card Participante 2 si existe */}
            {p2 && (
              <Card className="p-6 shadow-card space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-navy-800" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                      Participante 2
                    </h2>
                  </div>
                  {p2.poseeCuentaPrevia && (
                    <span className="rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 text-[10px] font-bold">
                      Cuenta Previa Detectada
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {editando ? (
                    <>
                      <Field etiqueta="Nombres">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                          value={p2Nombres}
                          onChange={(e) => setP2Nombres(e.target.value)}
                        />
                      </Field>
                      <Field etiqueta="Apellidos">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                          value={p2Apellidos}
                          onChange={(e) => setP2Apellidos(e.target.value)}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <ReadonlyField etiqueta="Nombres" valor={p2.nombres} />
                      <ReadonlyField etiqueta="Apellidos" valor={p2.apellidos} />
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReadonlyField etiqueta="DNI" valor={p2.dni} />
                  {editando ? (
                    <Field etiqueta="CUI (8 dígitos)">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-mono shadow-card focus:border-navy-800 focus:outline-none"
                        maxLength={8}
                        value={p2Cui}
                        onChange={(e) => setP2Cui(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      />
                    </Field>
                  ) : (
                    <ReadonlyField etiqueta="CUI" valor={p2.cui ?? "—"} />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReadonlyField etiqueta="Correo Electrónico Institucional" valor={p2.email} />
                  {editando ? (
                    <Field etiqueta="Teléfono / Celular (9 dígitos)">
                      <input
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                        maxLength={9}
                        value={p2Telefono}
                        onChange={(e) =>
                          setP2Telefono(e.target.value.replace(/\D/g, "").slice(0, 9))
                        }
                      />
                    </Field>
                  ) : (
                    <ReadonlyField etiqueta="Teléfono / Celular" valor={p2.telefono ?? "—"} />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {editando ? (
                    <>
                      <Field etiqueta="Dirección">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                          value={p2Direccion}
                          onChange={(e) => setP2Direccion(e.target.value)}
                        />
                      </Field>
                      <Field etiqueta="Ciudad">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-xs shadow-card focus:border-navy-800 focus:outline-none"
                          value={p2Ciudad}
                          onChange={(e) => setP2Ciudad(e.target.value)}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      <ReadonlyField etiqueta="Dirección" valor={p2.direccion ?? "—"} />
                      <ReadonlyField etiqueta="Ciudad" valor={p2.ciudad ?? "—"} />
                    </>
                  )}
                </div>
              </Card>
            )}

            {/* Botones de acción al final si está en edición inline */}
            {editando && (
              <div className="flex justify-end gap-3 pt-2">
                <Button onClick={cancelarEdicion} variante="contorno">
                  Cancelar
                </Button>
                <Button
                  disabled={actualizarDatosMutation.isPending}
                  onClick={() => void handleGuardarEdicionInline()}
                  variante="primario"
                >
                  <Save size={15} />{" "}
                  {actualizarDatosMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </div>
            )}
          </TabPanel>

          {/* PANEL 2: DOCUMENTOS */}
          <TabPanel value="documentos" className="pt-4">
            <Card className="p-6 shadow-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                    Checklist Documentario
                  </h2>
                  <p className="text-[11px] text-grafito-500">
                    Verifique cada requisito y marque su conformidad para habilitar la apertura del
                    expediente.
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-navy-950">
                  {conformesCount} / {sol.documentos.length} conformes
                </span>
              </div>

              <div className="space-y-3">
                {sol.documentos.map((doc) => (
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-colors"
                    key={doc.id}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <FileText size={18} />
                      </span>
                      <div className="min-w-0 text-xs">
                        <p className="font-bold text-navy-950 truncate">{doc.nombreOriginal}</p>
                        <p className="text-grafito-500 text-[11px] mt-0.5">
                          {doc.tipo} · {Math.round(doc.pesoBytes / 1024)} KB · Versión {doc.version}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        className="rounded p-1.5 text-slate-500 hover:text-navy-950 hover:bg-slate-100 transition-colors"
                        onClick={() =>
                          void abrirArchivoProtegido(documentoSolicitudUrl(sol.id, doc.id))
                        }
                        title="Abrir y verificar documento"
                        type="button"
                      >
                        <ExternalLink size={16} />
                      </button>

                      <StatusBadge estado={doc.estadoConformidad} />

                      {!cerrada && (
                        <div className="flex items-center gap-1 border-l pl-2 border-slate-200 ml-1">
                          <button
                            className="rounded p-1 text-slate-400 hover:text-verde-inst-700 hover:bg-verde-inst-50 transition-colors"
                            disabled={conformidadMutation.isPending}
                            onClick={() => void cambiarConformidad(doc.id, "CONFORME")}
                            title="Marcar Conforme"
                            type="button"
                          >
                            <FileCheck size={17} />
                          </button>
                          <button
                            className="rounded p-1 text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                            disabled={conformidadMutation.isPending}
                            onClick={() => void cambiarConformidad(doc.id, "OBSERVADO")}
                            title="Marcar Observado"
                            type="button"
                          >
                            <AlertTriangle size={17} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabPanel>

          {/* PANEL 3: TRAZABILIDAD */}
          <TabPanel value="historial" className="pt-4">
            <Card className="p-6 shadow-card space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <History size={16} className="text-navy-800" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-grafito-600">
                  Trazabilidad de la Solicitud
                </h2>
              </div>

              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {sol.trazabilidad.map((h) => (
                  <div className="relative text-xs" key={h.id}>
                    <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-navy-800 shadow-sm" />
                    <div className="rounded-xl bg-slate-50/80 p-3 border border-slate-200/80">
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
          </TabPanel>
        </Tabs>
      </div>

      {/* Modales de Gestión Administrativa */}
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
    </AppShell>
  );
}
