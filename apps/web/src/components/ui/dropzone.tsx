import { cva } from "class-variance-authority";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import { type DragEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "../../utils/cn.js";
import { generarMiniatura } from "../../utils/miniatura-archivo.js";

/**
 * Dropzone: campo de carga de UN archivo con área amplia para soltar.
 * Estados: vacío · arrastrando · cargado (con miniatura de la 1.ª página) · error.
 * La validación de negocio (formato/peso) la decide la vista vía `onArchivo`
 * y la reporta con `error`; el componente solo presenta.
 */

type EstadoZona = "vacio" | "arrastrando" | "cargado" | "error";

const tarjeta = cva(
  "flex flex-col rounded-xl border bg-white p-3.5 shadow-card transition-colors",
  {
    variants: {
      estado: {
        vacio: "border-slate-200",
        arrastrando: "border-navy-800",
        cargado: "border-verde-inst-700/40",
        error: "border-red-300",
      },
    },
  },
);

const zona = cva(
  "group relative flex min-h-36 w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-navy-800 focus-visible:ring-offset-2",
  {
    variants: {
      estado: {
        vacio: "border-slate-300 bg-slate-50/60 hover:border-navy-800/60 hover:bg-navy-100/30",
        arrastrando: "scale-[1.01] border-navy-800 bg-navy-100/50",
        cargado: "border-verde-inst-700/50 bg-verde-inst-100/40",
        error: "border-red-300 bg-red-50/60 hover:border-red-400",
      },
    },
  },
);

function formatearPeso(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Miniatura del archivo cargado; se regenera solo si cambia el archivo. */
function useMiniatura(archivo: File | null): { url: string | null; cargando: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!archivo) {
      setUrl(null);
      return;
    }
    let vigente = true;
    let generada: string | null = null;
    setCargando(true);
    void generarMiniatura(archivo).then((u) => {
      generada = u;
      if (vigente) {
        setUrl(u);
        setCargando(false);
      } else if (u) {
        URL.revokeObjectURL(u);
      }
    });
    return () => {
      vigente = false;
      if (generada) URL.revokeObjectURL(generada);
    };
  }, [archivo]);

  return { url, cargando };
}

export interface DropzoneProps {
  /** Nombre visible del documento. */
  etiqueta: string;
  requerido?: boolean;
  /** Atributo `accept` del input (MIME o extensiones). */
  aceptar: string;
  /** Texto corto de restricciones, p. ej. "PDF · máx. 20 MB". */
  restricciones: string;
  archivo: File | null;
  onArchivo: (archivo: File | null) => void;
  error?: string | null;
  /** Guía desplegable (formato, enlaces, soporte). */
  ayuda?: ReactNode;
  /** Icono del estado vacío: documento o fotografía. */
  tipo?: "documento" | "foto";
  className?: string;
}

export function Dropzone({
  etiqueta,
  requerido = false,
  aceptar,
  restricciones,
  archivo,
  onArchivo,
  error,
  ayuda,
  tipo = "documento",
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const idAyuda = useId();
  const idError = useId();
  const [arrastrando, setArrastrando] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const { url: miniatura, cargando } = useMiniatura(archivo);

  const estado: EstadoZona = arrastrando
    ? "arrastrando"
    : error
      ? "error"
      : archivo
        ? "cargado"
        : "vacio";

  function seleccionar() {
    inputRef.current?.click();
  }

  function alSoltar(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onArchivo(file);
  }

  function alSalir(e: DragEvent<HTMLButtonElement>) {
    // dragleave también se dispara al pasar sobre hijos: solo salir si deja la zona.
    const destino = e.relatedTarget;
    if (destino instanceof Node && e.currentTarget.contains(destino)) return;
    setArrastrando(false);
  }

  const IconoVacio = tipo === "foto" ? ImageIcon : FileText;

  return (
    <section aria-label={`Documento: ${etiqueta}`} className={cn(tarjeta({ estado }), className)}>
      {/* Encabezado: nombre + obligatoriedad + ayuda */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <p className="text-xs leading-snug font-bold text-navy-950">{etiqueta}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {ayuda ? (
            <button
              aria-controls={idAyuda}
              aria-expanded={ayudaAbierta}
              className="rounded p-0.5 text-slate-400 transition-colors hover:text-navy-950"
              onClick={() => setAyudaAbierta((v) => !v)}
              title="Ver guía y formato"
              type="button"
            >
              <HelpCircle size={15} />
            </button>
          ) : null}
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-bold",
              requerido ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600",
            )}
          >
            {requerido ? "Obligatorio" : "Opcional"}
          </span>
        </div>
      </div>

      {ayuda && ayudaAbierta ? (
        <div
          className="mb-2.5 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700"
          id={idAyuda}
        >
          {ayuda}
        </div>
      ) : null}

      {/* Área de soltado (toda clicable y operable con teclado) */}
      <button
        aria-describedby={error ? idError : undefined}
        aria-label={
          archivo
            ? `${etiqueta}: ${archivo.name} cargado. Pulse para reemplazar.`
            : `${etiqueta}: arrastre el archivo o pulse para seleccionarlo.`
        }
        className={zona({ estado })}
        onClick={seleccionar}
        onDragEnter={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={alSalir}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={alSoltar}
        type="button"
      >
        {archivo && !arrastrando ? (
          <>
            {miniatura ? (
              <img
                alt={`Vista previa de ${archivo.name}`}
                className="absolute inset-0 h-full w-full object-cover object-top"
                src={miniatura}
              />
            ) : (
              <span className="flex flex-col items-center gap-1.5 text-verde-inst-700">
                {cargando ? <Loader2 className="animate-spin" size={26} /> : <FileText size={28} />}
                <span className="text-[11px] font-medium">
                  {cargando ? "Generando vista previa…" : "Vista previa no disponible"}
                </span>
              </span>
            )}
            <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-verde-inst-700 text-white shadow-elevado">
              <CheckCircle2 size={15} />
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-navy-950/75 py-1.5 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <RefreshCw size={12} /> Haga clic o suelte otro archivo para reemplazar
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-4 py-5">
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                estado === "arrastrando"
                  ? "bg-navy-800 text-white"
                  : estado === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-white text-navy-800 shadow-card",
              )}
            >
              {estado === "arrastrando" ? (
                <UploadCloud size={22} />
              ) : estado === "error" ? (
                <AlertCircle size={22} />
              ) : (
                <IconoVacio size={20} />
              )}
            </span>
            <span className="text-xs font-semibold text-navy-950">
              {estado === "arrastrando" ? "Suelte para cargar" : "Arrastre el archivo aquí"}
            </span>
            {estado !== "arrastrando" && (
              <span className="text-[11px] text-grafito-600">
                o <span className="font-semibold text-navy-800 underline">haga clic</span> para
                seleccionarlo
              </span>
            )}
            <span className="mt-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {restricciones}
            </span>
          </span>
        )}
      </button>

      <input
        accept={aceptar}
        className="hidden"
        onChange={(e) => {
          // Cancelar el diálogo no debe quitar el archivo ya cargado.
          const file = e.target.files?.[0];
          if (file) onArchivo(file);
          // Permite volver a elegir el mismo archivo tras quitarlo.
          e.target.value = "";
        }}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />

      {/* Pie: archivo cargado o error */}
      {error ? (
        <p
          className="mt-2 flex items-start gap-1 text-[11px] font-medium text-red-700"
          id={idError}
        >
          <AlertCircle className="mt-px shrink-0" size={13} /> {error}
        </p>
      ) : archivo ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] text-verde-inst-700">
            <span className="block truncate font-semibold" title={archivo.name}>
              {archivo.name}
            </span>
            <span className="text-slate-500">{formatearPeso(archivo.size)}</span>
          </p>
          <button
            className="inline-flex shrink-0 items-center gap-1 rounded p-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-50"
            onClick={() => onArchivo(null)}
            title="Quitar archivo"
            type="button"
          >
            <X size={13} /> Quitar
          </button>
        </div>
      ) : null}
    </section>
  );
}
