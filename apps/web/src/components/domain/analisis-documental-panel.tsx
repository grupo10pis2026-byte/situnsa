import { useAnalizarDocumento } from "../../api/analisis-documental.js";
import { Button } from "../ui/button.js";
import { Card } from "../ui/card.js";

/** Se remonta por documentoId: una respuesta de v1 no se muestra en v2. */
export function AnalisisDocumentalPanel({ documentoId }: { documentoId: string }) {
  const analisis = useAnalizarDocumento(documentoId);
  const resultado = analisis.data?.documentoId === documentoId ? analisis.data : null;
  return (
    <Card className="mt-3 space-y-3 p-4">
      <p className="font-semibold">Carátula y resumen</p>
      <p className="text-sm text-grafito-600">
        Revisión orientativa de las páginas 1–3. El visto bueno académico corresponde al
        responsable.
      </p>
      <p className="text-sm text-grafito-600">
        Revisión de ortografía y redacción con IA pendiente de activación. Este análisis comprueba
        los datos de la carátula y la presencia del resumen.
      </p>
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
              : "Analizar carátula y resumen"}
        </Button>
      </div>
      <div aria-live="polite" aria-busy={analisis.isPending}>
        {analisis.isPending && <p className="text-sm">Procesando el documento…</p>}
        {analisis.error && (
          <p role="alert" className="text-sm">
            {analisis.error.message}
          </p>
        )}
        {resultado && (
          <div className="space-y-3 text-sm">
            <p>
              Versión {resultado.version} ·{" "}
              {resultado.estado === "COMPLETADO"
                ? "Análisis completado"
                : resultado.estado === "PARCIAL"
                  ? "Análisis parcial"
                  : "Documento no evaluable"}
            </p>
            <p>Páginas: {resultado.paginasAnalizadas.join(", ") || "No disponibles"}</p>
            <p>Título registrado: {resultado.tituloRegistrado}</p>
            <p>Título detectado: {resultado.tituloDetectado ?? "No identificado"}</p>
            {resultado.similitudTitulo !== null && (
              <p>Similitud informativa: {resultado.similitudTitulo}%</p>
            )}
            <ul className="space-y-1">
              {resultado.controles.map((control) => (
                <li key={control.tipo}>
                  {control.estado === "CONFORME"
                    ? "Conforme"
                    : control.estado === "NO_EVALUABLE"
                      ? "No evaluable"
                      : "Advertencia"}
                  : {control.mensaje}
                </li>
              ))}
            </ul>
            {!!resultado.hallazgos.length && (
              <ul className="space-y-2">
                {resultado.hallazgos.map((hallazgo, indice) => (
                  <li key={`${hallazgo.tipo}-${indice}`}>
                    <p>
                      {hallazgo.severidad === "INFO" ? "Información" : "Advertencia"}
                      {hallazgo.pagina ? ` · Página ${hallazgo.pagina}` : ""}: {hallazgo.mensaje}
                    </p>
                    {hallazgo.evidencia && <p>Fragmento: {hallazgo.evidencia}</p>}
                    {hallazgo.sugerencia && <p>Sugerencia: {hallazgo.sugerencia}</p>}
                  </li>
                ))}
              </ul>
            )}
            {!resultado.hallazgos.length && resultado.estado === "COMPLETADO" && (
              <p>No se encontraron diferencias en los controles realizados.</p>
            )}
            {resultado.editorial === "NO_DISPONIBLE" && (
              <p>Revisión editorial no disponible. Se conservan los controles del documento.</p>
            )}
            {resultado.editorial === "NO_SOLICITADA" && (
              <p>Ortografía y redacción no evaluadas con IA.</p>
            )}
            {resultado.resumen && (
              <details>
                <summary>Ver resumen extraído</summary>
                <p className="mt-2 whitespace-pre-wrap">{resultado.resumen}</p>
              </details>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
