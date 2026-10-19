import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAnalizarDocumento } from "../../api/analisis-documental.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Card } from "../ui/card.js";

/**
 * Panel de DocumentoCard en /expedientes/$id y /mi-tramite para PLAN_ESTRUCTURADO.
 * Consume POST /api/documentos/:id/analisis mediante useAnalizarDocumento.
 * Muestra el resumen compacto de carátula/título y delega el informe detallado
 * con observaciones y fragmentos al modal emergente.
 */
export function AnalisisDocumentalPanel({
  documentoId,
  onVerDetalles,
}: {
  documentoId: string;
  onVerDetalles?: () => void;
}) {
  const analisis = useAnalizarDocumento(documentoId);
  const resultado = analisis.data?.documentoId === documentoId ? analisis.data : null;

  return (
    <Card className="mt-3 space-y-3.5 p-4 bg-slate-50/50 border-slate-200">
      <div>
        <p className="font-bold text-slate-900 text-sm">
          Revisión estructural: Carátula, Presentación y Resumen
        </p>
        <p className="text-xs text-grafito-600 mt-0.5">
          Verificación automática de páginas 1–6 según el formato oficial FIPS - UNSA (Tesis /
          Trabajo Académico).
        </p>
      </div>

      <div>
        <Button
          variante="contorno"
          tamano="sm"
          type="button"
          disabled={analisis.isPending}
          onClick={() => analisis.mutate(false)}
        >
          {analisis.isPending
            ? "Analizando…"
            : resultado
              ? "Volver a analizar"
              : "Verificar estructura y carátula"}
        </Button>
      </div>

      <div aria-live="polite" aria-busy={analisis.isPending}>
        {analisis.isPending && (
          <p className="text-xs font-medium text-slate-600 animate-pulse">
            Procesando las páginas del documento…
          </p>
        )}
        {analisis.error && (
          <p role="alert" className="text-xs font-semibold text-red-700">
            {analisis.error.message}
          </p>
        )}
        {resultado && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-900">Versión {resultado.version}</span>
              <span>·</span>
              <span
                className={cn(
                  "font-bold px-2 py-0.5 rounded",
                  resultado.estado === "COMPLETADO"
                    ? "bg-green-100 text-green-800"
                    : resultado.estado === "PARCIAL"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-200 text-slate-700",
                )}
              >
                {resultado.estado === "COMPLETADO"
                  ? "Análisis completado"
                  : resultado.estado === "PARCIAL"
                    ? "Análisis parcial"
                    : "Documento no evaluable"}
              </span>
              <span>·</span>
              <span>
                Páginas analizadas:{" "}
                <strong>{resultado.paginasAnalizadas.join(", ") || "No disponibles"}</strong>
              </span>
            </div>

            <div className="rounded-lg bg-white p-3 border border-slate-200 space-y-1.5 text-xs">
              <p>
                <strong className="text-slate-700">Título registrado:</strong>{" "}
                <span className="text-slate-900">{resultado.tituloRegistrado}</span>
              </p>
              <p>
                <strong className="text-slate-700">Título detectado:</strong>{" "}
                <span className="text-slate-900">
                  {resultado.tituloDetectado ?? "No identificado en carátula"}
                </span>
              </p>
              {resultado.similitudTitulo !== null && (
                <p>
                  <strong className="text-slate-700">Similitud textual:</strong>{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      resultado.similitudTitulo === 100 ? "text-green-700" : "text-amber-700",
                    )}
                  >
                    {resultado.similitudTitulo}%
                  </span>
                </p>
              )}
            </div>

            {onVerDetalles && (
              <div className="pt-1">
                <Button
                  variante="contorno"
                  tamano="sm"
                  type="button"
                  onClick={onVerDetalles}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 border font-medium text-xs py-2 shadow-xs transition-colors",
                    resultado.hallazgos.length > 0
                      ? "border-amber-300 bg-amber-50/70 text-amber-900 hover:bg-amber-100"
                      : "border-emerald-300 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100",
                  )}
                >
                  {resultado.hallazgos.length > 0 ? (
                    <>
                      <AlertTriangle size={15} className="text-amber-700 shrink-0" />
                      <span>Ver informe completo y {resultado.hallazgos.length} observaciones</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                      <span>Ver informe completo y controles normativos (Conforme)</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
