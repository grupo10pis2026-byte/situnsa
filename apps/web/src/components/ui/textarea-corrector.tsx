import {
  aplicarSugerencia,
  type SugerenciaTitulo,
} from "@pis/domain/dist/solicitud/revision-titulo.js";
import { CheckCircle2, Loader2, SpellCheck2, X } from "lucide-react";
import {
  type FocusEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../../utils/cn.js";
import { claveSugerencia, useCorrectorTitulo } from "../../utils/use-corrector-titulo.js";

/**
 * TextareaCorrector (CR-MOD-OBT-001 §3): textarea con corrector ortográfico
 * (ES/EN) y de formato tipo Google Forms. Subraya lo corregible y, al poner el
 * cursor o hacer clic sobre lo subrayado, ofrece cambiarlo o ignorarlo.
 * Nunca cambia el texto por su cuenta.
 *
 * Técnica: un `div` espejo con el mismo texto y tipografía queda DETRÁS del
 * textarea (fondo transparente) y pinta los subrayados; el textarea crece con
 * el contenido para que ambos ocupen exactamente lo mismo.
 */

/** Tipografía y caja compartidas por textarea y espejo (deben coincidir). */
const CAJA =
  "w-full rounded-lg border p-2.5 text-xs leading-relaxed font-sans tracking-normal whitespace-pre-wrap break-words";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onChange: (valor: string) => void;
};

function marcas(texto: string, sugerencias: SugerenciaTitulo[]): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  sugerencias.forEach((s, i) => {
    if (s.inicio > cursor) out.push(texto.slice(cursor, s.inicio));
    out.push(
      <mark
        className={cn(
          "rounded-sm text-transparent underline decoration-wavy decoration-[1.5px] underline-offset-[3px] [text-decoration-skip-ink:none]",
          s.tipo === "ortografia"
            ? "bg-transparent decoration-red-600"
            : "bg-blue-100/70 decoration-blue-600",
        )}
        data-i={i}
        key={`${s.inicio}-${s.fin}-${s.tipo}`}
      >
        {texto.slice(s.inicio, s.fin)}
      </mark>,
    );
    cursor = s.fin;
  });
  out.push(texto.slice(cursor));
  // El espejo necesita un carácter final para reproducir un salto de línea al final.
  out.push("​");
  return out;
}

export function TextareaCorrector({ value, onChange, className, rows = 3, ...rest }: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const espejoRef = useRef<HTMLDivElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(false);
  const [ignoradas, setIgnoradas] = useState<ReadonlySet<string>>(() => new Set());
  const [abierta, setAbierta] = useState<{ s: SugerenciaTitulo; top: number; left: number } | null>(
    null,
  );
  const { sugerencias, estado } = useCorrectorTitulo(value, { activo, ignoradas });

  // Auto-alto: sin barra de desplazamiento, el espejo coincide línea a línea.
  // biome-ignore lint/correctness/useExhaustiveDependencies: debe recalcularse con cada cambio del texto.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  /** Abre el popover si el cursor está dentro de un rango subrayado. */
  function evaluarCursor() {
    const el = areaRef.current;
    if (!el || el.selectionStart !== el.selectionEnd) {
      setAbierta(null);
      return;
    }
    const pos = el.selectionStart;
    const i = sugerencias.findIndex((s) => pos >= s.inicio && pos <= s.fin);
    const s = sugerencias[i];
    const marca = espejoRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    const ancho = contenedorRef.current?.clientWidth ?? 300;
    if (!s || !marca) {
      setAbierta(null);
      return;
    }
    setAbierta({
      s,
      top: marca.offsetTop + marca.offsetHeight + 6,
      left: Math.max(0, Math.min(marca.offsetLeft, ancho - 272)),
    });
  }

  function aplicar(s: SugerenciaTitulo, reemplazo: string) {
    const r = aplicarSugerencia(value, s, reemplazo);
    onChange(r.texto);
    setAbierta(null);
    requestAnimationFrame(() => {
      areaRef.current?.focus();
      areaRef.current?.setSelectionRange(r.cursor, r.cursor);
    });
  }

  function ignorar(s: SugerenciaTitulo) {
    setIgnoradas((prev) => new Set(prev).add(claveSugerencia(value, s)));
    setAbierta(null);
    areaRef.current?.focus();
  }

  /** Cierra el popover cuando el foco sale del campo y de la propia sugerencia. */
  function alSalir(e: FocusEvent<HTMLElement>) {
    const destino = e.relatedTarget;
    if (destino instanceof Node && contenedorRef.current?.contains(destino)) return;
    setAbierta(null);
  }

  const total = sugerencias.length;

  return (
    <div>
      <div className="relative rounded-lg bg-white" ref={contenedorRef}>
        <div
          aria-hidden="true"
          className={cn(
            CAJA,
            "pointer-events-none absolute inset-0 overflow-hidden border-transparent text-transparent",
          )}
          ref={espejoRef}
        >
          {marcas(value, sugerencias)}
        </div>
        <textarea
          {...rest}
          className={cn(
            CAJA,
            "relative block resize-none overflow-hidden border-slate-300 bg-transparent text-grafito-900 shadow-card placeholder:text-slate-400 focus:border-navy-800 focus:outline-none",
            className,
          )}
          lang="es"
          onBlur={(e) => {
            alSalir(e);
            rest.onBlur?.(e);
          }}
          onChange={(e) => {
            setAbierta(null);
            onChange(e.target.value);
          }}
          onClick={evaluarCursor}
          onFocus={(e) => {
            setActivo(true);
            rest.onFocus?.(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && abierta) {
              e.preventDefault();
              setAbierta(null);
            }
            rest.onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") evaluarCursor();
          }}
          ref={areaRef}
          rows={rows}
          spellCheck={false}
          value={value}
        />

        {abierta && (
          <div
            className="absolute z-20 w-[268px] rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-flotante"
            role="dialog"
            aria-label="Sugerencia de corrección"
            onBlur={alSalir}
            style={{ top: abierta.top, left: abierta.left }}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="leading-snug text-grafito-900">
                <span
                  className={cn(
                    "mr-1.5 inline-block rounded px-1.5 py-px text-[10px] font-bold uppercase",
                    abierta.s.tipo === "ortografia"
                      ? "bg-red-50 text-red-700"
                      : "bg-blue-50 text-blue-700",
                  )}
                >
                  {abierta.s.tipo === "ortografia" ? "Ortografía" : "Formato"}
                </span>
                {abierta.s.mensaje}
              </p>
              <button
                aria-label="Cerrar sugerencia"
                className="rounded p-0.5 text-slate-400 hover:text-navy-950"
                onClick={() => setAbierta(null)}
                onMouseDown={(e) => e.preventDefault()}
                type="button"
              >
                <X size={13} />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {abierta.s.reemplazos.map((r) => (
                <button
                  className="truncate rounded-md bg-navy-950/5 px-2.5 py-1.5 text-left font-semibold text-navy-950 transition-colors hover:bg-navy-950 hover:text-white"
                  key={r || "__vacio"}
                  onClick={() => aplicar(abierta.s, r)}
                  onMouseDown={(e) => e.preventDefault()}
                  title={r === "" ? "Eliminar" : `Cambiar a: ${r}`}
                  type="button"
                >
                  {r === "" ? "Eliminar" : r.trim() === "" ? "Usar un solo espacio" : r}
                </button>
              ))}
              <button
                className="rounded-md px-2.5 py-1.5 text-left text-grafito-600 transition-colors hover:bg-slate-100"
                onClick={() => ignorar(abierta.s)}
                onMouseDown={(e) => e.preventDefault()}
                type="button"
              >
                Ignorar
              </button>
            </div>
          </div>
        )}
      </div>

      {activo && (
        <p aria-live="polite" className="mt-1 flex items-center gap-1 text-[11px] text-grafito-600">
          {estado === "cargando" ? (
            <>
              <Loader2 className="animate-spin" size={12} /> Cargando corrector…
            </>
          ) : total > 0 ? (
            <>
              <SpellCheck2 className="text-blue-700" size={12} />
              {total === 1 ? "1 sugerencia" : `${total} sugerencias`} · haga clic en lo subrayado
              para revisarla
            </>
          ) : estado === "error" ? (
            "Corrector ortográfico no disponible; se revisa solo el formato."
          ) : estado === "listo" ? (
            <>
              <CheckCircle2 className="text-verde-inst-700" size={12} /> Sin sugerencias
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
