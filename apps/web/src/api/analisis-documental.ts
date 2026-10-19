/**
 * Hook utilizado por components/domain/analisis-documental-panel.tsx.
 * Ruta del servidor: POST /api/documentos/:id/analisis; contrato de @pis/contracts, sesión mediante apiFetch.
 */
import { AnalisisDocumentoResponseSchema } from "@pis/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta } from "./errores.js";
import { apiFetch } from "./session.js";

/**
 * Cliente de POST /api/documentos/:id/analisis para AnalisisDocumentalPanel.
 * apiFetch incorpora la sesión; el esquema compartido valida la respuesta del servidor.
 * revisionEditorial=false ejecuta únicamente los controles locales solicitados.
 */
export function useAnalizarDocumento(documentoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["analisis-documental", documentoId],
    mutationFn: async (revisionEditorial: boolean) => {
      const response = await apiFetch(`${apiBaseUrl}/api/documentos/${documentoId}/analisis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionEditorial }),
      });
      if (!response.ok) throw await errorDeRespuesta(response, "No se pudo analizar el documento");
      return AnalisisDocumentoResponseSchema.parse(await response.json());
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documentos", documentoId, "revision"] });
    },
  });
}
