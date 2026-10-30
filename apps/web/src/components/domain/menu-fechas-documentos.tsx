import type { ActualizarDatosInput, ExpedienteDetalleDTO } from "@pis/contracts";
import { horaLimpia } from "@pis/domain/dist/documentos/etiquetas.js";
import { Calendar, Clock, FileText, PanelRightClose, PanelRightOpen, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type GuardadoEstado, useActualizarDatos } from "../../api/expedientes.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Card } from "../ui/card.js";
import { controlClase, Field } from "../ui/field.js";
import { InputFechaLatina } from "../ui/input-fecha-latina.js";

interface DefinicionFechaDoc {
  clave: keyof ActualizarDatosInput;
  label: string;
  documento: string;
  etapa: "E1" | "E2";
  tipoControl?: "fecha" | "hora";
}

const FECHAS_DOCUMENTOS: DefinicionFechaDoc[] = [
  // Etapa 01
  {
    clave: "fechaApertura",
    label: "Fecha de Decreto de Aprobación",
    documento: "Decreto de Aprobación de Plan (Anexo 05)",
    etapa: "E1",
  },
  {
    clave: "fechaPresentacion",
    label: "Fecha de Observaciones del Plan",
    documento: "Dictamen de Observaciones de Plan (Anexo 06)",
    etapa: "E1",
  },
  {
    clave: "fechaCircular",
    label: "Fecha de Oficio Circular de Terna",
    documento: "Oficio Circular a Jurados (Anexo 07)",
    etapa: "E1",
  },
  {
    clave: "fechaSolicitud",
    label: "Fecha de Solicitud de Inscripción",
    documento: "Solicitud de Inscripción (Anexo 04 / 17)",
    etapa: "E1",
  },
  // Etapa 02
  {
    clave: "fechaDecanal",
    label: "Fecha Resolución Decanal",
    documento: "Resolución Decanal de Jurados",
    etapa: "E2",
  },
  {
    clave: "fechaDictamen",
    label: "Fecha de Dictamen de Jurados",
    documento: "Acta de Dictamen de Jurados",
    etapa: "E2",
  },
  {
    clave: "fechaSustentacion",
    label: "Fecha de Sustentación",
    documento: "Acta de Sustentación e Invitación Pública",
    etapa: "E2",
  },
  {
    clave: "horaSustentacion",
    label: "Hora de Sustentación",
    documento: "Acta de Sustentación e Invitación",
    etapa: "E2",
    tipoControl: "hora",
  },
  {
    clave: "fechaConformidad",
    label: "Fecha de Conformidad del Asesor",
    documento: "Acta de Conformidad / Informe Asesor (Anexo 08)",
    etapa: "E2",
  },
  {
    clave: "fechaObservacionesBorrador",
    label: "Fecha de Observaciones Borrador",
    documento: "Observaciones al Borrador de Tesis",
    etapa: "E2",
  },
  {
    clave: "fechaSimilitud",
    label: "Fecha de Informe de Similitud",
    documento: "Informe de Similitud Turnitin",
    etapa: "E2",
  },
  {
    clave: "fechaInvitacionPublica",
    label: "Fecha de Invitación Pública",
    documento: "Invitación Pública Oficial",
    etapa: "E2",
  },
  {
    clave: "fechaImpresion",
    label: "Fecha de Autorización de Impresión",
    documento: "Autorización de Impresión",
    etapa: "E2",
  },
  {
    clave: "fechaPublicacion",
    label: "Fecha de Autorización de Repositorio",
    documento: "Autorización de Publicación en Repositorio",
    etapa: "E2",
  },
  {
    clave: "fechaOficioOti",
    label: "Fecha de Oficio para OTI",
    documento: "Oficio para OTI Similitud",
    etapa: "E2",
  },
  {
    clave: "fechaOficioUgi",
    label: "Fecha de Oficio para Repositorio",
    documento: "Oficio para Repositorio Institucional",
    etapa: "E2",
  },
  {
    clave: "fechaNombramientoJurados",
    label: "Fecha de Nombramiento de Jurados",
    documento: "Decreto de Nombramiento de Jurados",
    etapa: "E2",
  },
];

/**
 * Menú desplegable lateral derecho con todas las fechas de los documentos
 * relativas al expediente específico. Permite modificarlas in-situ con autoguardado.
 */
export function MenuFechasDocumentos({
  detalle,
  onCambio,
}: {
  detalle: ExpedienteDetalleDTO;
  onCambio?: () => void;
}) {
  const [abierto, setAbierto] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [estadoGuardado, setEstadoGuardado] = useState<GuardadoEstado>("sincronizado");

  // Extraer valores iniciales desde datosAdmin de este expediente
  const admin = detalle.datosAdmin as unknown as Record<string, string | null | undefined>;
  const getVal = (k: string) => admin[k] ?? "";

  const [valores, setValores] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const def of FECHAS_DOCUMENTOS) {
      inicial[def.clave] = getVal(def.clave);
    }
    return inicial;
  });

  const tokenRef = useRef(detalle.updatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutate = useActualizarDatos(detalle.id);

  // Sincronizar si cambia el expediente cargado
  useEffect(() => {
    const adminActual = detalle.datosAdmin as unknown as Record<string, string | null | undefined>;
    const actual: Record<string, string> = {};
    for (const def of FECHAS_DOCUMENTOS) {
      actual[def.clave] = adminActual[def.clave] ?? "";
    }
    setValores(actual);
    tokenRef.current = detalle.updatedAt;
  }, [detalle]);

  function handleChange(clave: keyof ActualizarDatosInput, valor: string) {
    setValores((prev) => ({ ...prev, [clave]: valor }));
    if (timer.current) clearTimeout(timer.current);
    setEstadoGuardado("editando");

    timer.current = setTimeout(() => {
      setEstadoGuardado("guardando");
      mutate.mutate(
        { [clave]: valor, expectedUpdatedAt: tokenRef.current } as ActualizarDatosInput,
        {
          onSuccess: (data) => {
            tokenRef.current = data.updatedAt;
            setEstadoGuardado("sincronizado");
            onCambio?.();
          },
          onError: () => {
            setEstadoGuardado("error");
          },
        },
      );
    }, 650);
  }

  // Filtrado de fechas
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return FECHAS_DOCUMENTOS;
    return FECHAS_DOCUMENTOS.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.documento.toLowerCase().includes(q) ||
        f.clave.toLowerCase().includes(q),
    );
  }, [busqueda]);

  const etapa1 = filtradas.filter((f) => f.etapa === "E1");
  const etapa2 = filtradas.filter((f) => f.etapa === "E2");

  // Conteo de fechas completadas para este expediente
  const completadas = useMemo(() => {
    return FECHAS_DOCUMENTOS.filter((f) => Boolean(valores[f.clave]?.trim())).length;
  }, [valores]);

  if (!abierto) {
    return (
      <div className="shrink-0 print:hidden">
        <Button
          tamano="sm"
          variante="contorno"
          onClick={() => setAbierto(true)}
          className="group flex items-center gap-2 border-slate-300 bg-white shadow-sm hover:border-navy-700 hover:text-navy-900"
          title="Desplegar menú de fechas de documentos"
          aria-expanded={false}
          aria-label="Abrir menú de fechas de documentos"
          type="button"
        >
          <Calendar
            size={15}
            className="text-dorado-600 transition-transform group-hover:scale-110"
          />
          <span className="font-semibold text-xs">Fechas de Documentos</span>
          <span className="rounded-full bg-dorado-50 px-2 py-0.5 text-[11px] font-bold text-dorado-800 tabular-nums border border-dorado-200">
            {completadas}/{FECHAS_DOCUMENTOS.length}
          </span>
          <PanelRightOpen size={14} className="text-grafito-500" />
        </Button>
      </div>
    );
  }

  return (
    <aside
      className="w-full lg:w-84 xl:w-96 shrink-0 print:hidden transition-all duration-200"
      aria-label="Menú desplegable de fechas de documentos"
    >
      <Card className="sticky top-20 border-slate-200/90 shadow-card">
        {/* Cabecera del menú */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-dorado-50 border border-dorado-200 text-dorado-700">
              <Calendar size={16} />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-navy-950">
                  Fechas de Documentos
                </h3>
                <span className="rounded-full bg-dorado-100 px-1.5 py-0.2 text-[10px] font-bold text-dorado-900 tabular-nums">
                  {completadas}/{FECHAS_DOCUMENTOS.length}
                </span>
              </div>
              <p className="text-[11px] text-grafito-500 font-mono">Exp. {detalle.codigo}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Indicador de estado de guardado */}
            <span
              className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                estadoGuardado === "guardando"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : estadoGuardado === "error"
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-green-50 text-green-700 border-green-200",
              )}
            >
              {estadoGuardado === "guardando"
                ? "Guardando..."
                : estadoGuardado === "error"
                  ? "Error"
                  : "Sincronizado"}
            </span>

            <Button
              tamano="sm"
              variante="fantasma"
              onClick={() => setAbierto(false)}
              className="h-7 w-7 p-0 text-grafito-600 hover:text-navy-950"
              title="Ocultar menú de fechas"
              aria-expanded={true}
              aria-label="Ocultar panel de fechas"
              type="button"
            >
              <PanelRightClose size={15} />
            </Button>
          </div>
        </div>

        {/* Barra de búsqueda rápida */}
        <div className="border-b border-slate-100 p-2.5 bg-white">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 text-grafito-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar fecha o documento..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className={cn(controlClase, "h-8 pl-8 text-xs")}
            />
          </div>
        </div>

        {/* Lista de fechas agrupadas con scroll */}
        <div className="max-h-[calc(100vh-16rem)] overflow-y-auto p-4 space-y-5">
          {filtradas.length === 0 ? (
            <div className="p-4 text-center text-xs text-grafito-500">
              No se encontraron fechas que coincidan con &quot;{busqueda}&quot;
            </div>
          ) : (
            <>
              {/* GRUPO ETAPA 01 */}
              {etapa1.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1">
                    <FileText size={13} className="text-navy-700" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-navy-950">
                      Etapa 01 · Plan y Jurado de Terna
                    </span>
                  </div>
                  <div className="space-y-3.5 pl-1">
                    {etapa1.map((def) => (
                      <CampoFecha
                        key={def.clave}
                        def={def}
                        valor={valores[def.clave] ?? ""}
                        onChange={(val) => handleChange(def.clave, val)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* GRUPO ETAPA 02 */}
              {etapa2.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1">
                    <FileText size={13} className="text-dorado-600" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-navy-950">
                      Etapa 02 · Borrador, Dictamen y Sustentación
                    </span>
                  </div>
                  <div className="space-y-3.5 pl-1">
                    {etapa2.map((def) => (
                      <CampoFecha
                        key={def.clave}
                        def={def}
                        valor={valores[def.clave] ?? ""}
                        onChange={(val) => handleChange(def.clave, val)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </aside>
  );
}

function CampoFecha({
  def,
  valor,
  onChange,
}: {
  def: DefinicionFechaDoc;
  valor: string;
  onChange: (val: string) => void;
}) {
  const controlId = useId();

  return (
    <div className="rounded-lg border border-slate-200/90 bg-slate-50/50 p-2.5 transition-colors hover:border-slate-300">
      <Field etiqueta={def.label} htmlFor={controlId} ayuda={def.documento} className="text-xs">
        {def.tipoControl === "hora" ? (
          <div className="relative flex items-center mt-1">
            <Clock size={13} className="absolute left-2.5 text-grafito-400 pointer-events-none" />
            <input
              id={controlId}
              type="time"
              value={horaLimpia(valor)}
              onChange={(e) => onChange(e.target.value)}
              className={cn(controlClase, "h-8 pl-8 text-xs")}
            />
          </div>
        ) : (
          <div className="mt-1">
            <InputFechaLatina
              id={controlId}
              value={valor}
              onChange={onChange}
              ariaLabel={def.label}
            />
          </div>
        )}
      </Field>
    </div>
  );
}
