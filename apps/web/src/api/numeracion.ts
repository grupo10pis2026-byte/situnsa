import {
  type FiltroRegistros,
  type ImportacionDTO,
  ImportacionDTOSchema,
  type ListaRegistrosDTO,
  ListaRegistrosDTOSchema,
  type NumeracionExpedienteDTO,
  NumeracionExpedienteDTOSchema,
  type TipoNumeracionDTO,
} from "@pis/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta } from "./errores.js";
import { expedienteKey } from "./expedientes.js";
import { apiFetch } from "./session.js";

/** Registro de oficios y decretos (Excel maestro del área). */

const claveRegistro = ["numeracion"] as const;
const claveExpediente = (id: string) => ["numeracion", "expediente", id] as const;

export function useRegistros(filtro: FiltroRegistros) {
  return useQuery({
    queryKey: [...claveRegistro, "registros", filtro],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ListaRegistrosDTO> => {
      const qs = new URLSearchParams({
        tipo: filtro.tipo,
        estado: filtro.estado,
        pagina: String(filtro.pagina),
        ...(filtro.q ? { q: filtro.q } : {}),
      });
      const res = await apiFetch(`${apiBaseUrl}/api/numeracion/registros?${qs}`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar el registro");
      return ListaRegistrosDTOSchema.parse(await res.json());
    },
  });
}

export function useImportarRegistro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportacionDTO> => {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch(`${apiBaseUrl}/api/numeracion/importar`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo importar el Excel");
      return ImportacionDTOSchema.parse(await res.json());
    },
    // La importación puede vincular y re-sincronizar expedientes.
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useNumeracionExpediente(expedienteId: string) {
  return useQuery({
    queryKey: claveExpediente(expedienteId),
    queryFn: async (): Promise<NumeracionExpedienteDTO> => {
      const res = await apiFetch(`${apiBaseUrl}/api/expedientes/${expedienteId}/numeracion`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar el oficio y el decreto");
      return NumeracionExpedienteDTOSchema.parse(await res.json());
    },
  });
}

/** Vincular (numero) o desvincular (numero = null) el oficio circular / decreto. */
export function useCambiarVinculo(expedienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tipo: TipoNumeracionDTO;
      numero: string | null;
    }): Promise<NumeracionExpedienteDTO> => {
      const res = await apiFetch(
        `${apiBaseUrl}/api/expedientes/${expedienteId}/numeracion/${input.tipo}`,
        input.numero === null
          ? { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ numero: input.numero }),
            },
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo actualizar el vínculo");
      return NumeracionExpedienteDTOSchema.parse(await res.json());
    },
    onSuccess: (data) => {
      qc.setQueryData(claveExpediente(expedienteId), data);
      // nroOficio / nroDecreto del expediente cambiaron.
      qc.invalidateQueries({ queryKey: expedienteKey(expedienteId) });
      qc.invalidateQueries({ queryKey: claveRegistro });
    },
  });
}
