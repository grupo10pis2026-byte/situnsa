import { useAnalizarDocumento } from "../../api/analisis-documental.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Card } from "../ui/card.js";
import { ItemHallazgo } from "./item-hallazgo.js";

/**
 * Panel de DocumentoCard en /expedientes/$id y /mi-tramite para PLAN_ESTRUCTURADO.
 * Consume POST /api/documentos/:id/analisis mediante useAnalizarDocumento.
 * Se remonta por documentoId: una respuesta de v1 no se muestra en v2.
 * Muestra controles y resumen; la revisión de IA permanece sin solicitar.
 */
export function AnalisisDocumentalPanel({ documentoId }: { documentoId: string }) {
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

            {/* Lista de controles de verificación */}
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Puntos de control normativo:
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {resultado.controles.map((control) => (
                  <li
                    key={control.tipo}
                    className={cn(
                      "flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                      control.estado === "CONFORME"
                        ? "border-green-200 bg-green-50/80 text-green-900"
                        : control.estado === "NO_EVALUABLE"
                          ? "border-slate-200 bg-slate-100/70 text-slate-700"
                          : "border-amber-200 bg-amber-50/80 text-amber-900",
                    )}
                  >
                    <span className="font-bold shrink-0">
                      {control.estado === "CONFORME"
                        ? "✓"
                        : control.estado === "NO_EVALUABLE"
                          ? "–"
                          : "⚠"}
                    </span>
                    <span>{control.mensaje}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Inconsistencias con etiquetas diferenciables, fragmento detectado y valor esperado */}
            {!!resultado.hallazgos.length && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-bold text-red-900 uppercase tracking-wider">
                  Inconsistencias y observaciones detectadas ({resultado.hallazgos.length}):
                </p>
                <ul className="space-y-3">
                  {resultado.hallazgos.map((hallazgo, indice) => (
                    <ItemHallazgo
                      key={`${hallazgo.tipo}-${indice}`}
                      campo={hallazgo.tipo}
                      mensaje={hallazgo.mensaje}
                      severidad={hallazgo.severidad}
                      pagina={hallazgo.pagina}
                      esperado={hallazgo.esperado ?? hallazgo.sugerencia}
                      encontrado={hallazgo.encontrado ?? hallazgo.evidencia}
                    />
                  ))}
                </ul>
              </div>
            )}

            {!resultado.hallazgos.length && resultado.estado === "COMPLETADO" && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 font-medium">
                ✓ No se identificaron discrepancias en la carátula, presentación ni estructura del
                resumen.
              </div>
            )}

            {resultado.resumen && (
              <details className="text-xs rounded-lg border border-slate-200 bg-white p-2.5">
                <summary className="font-semibold text-slate-700 cursor-pointer">
                  Ver resumen extraído ({resultado.resumenCompleto ? "Completo" : "Parcial"})
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-slate-800 bg-slate-50 p-2 rounded border border-slate-100 font-mono text-[11px]">
                  {resultado.resumen}
                </p>
              </details>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
