import { AnalisisDocumentoResponseSchema } from "@pis/contracts";
import { useMutation } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta } from "./errores.js";
import { apiFetch } from "./session.js";

export function useAnalizarDocumento(documentoId: string) {
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
  });
}
