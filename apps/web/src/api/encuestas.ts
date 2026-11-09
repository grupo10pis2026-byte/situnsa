import {
  type EncuestaAlumnoDTO,
  EncuestaAlumnoDTOSchema,
  type ResponderEncuestaInput,
  type ResultadosEncuestaDTO,
  ResultadosEncuestaDTOSchema,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApi, sendApi } from "./taller.js";

export type { EncuestaAlumnoDTO, ResultadosEncuestaDTO };

export function useMiEncuesta() {
  return useQuery({
    queryKey: ["encuesta"],
    queryFn: () =>
      getApi("/api/encuesta", EncuestaAlumnoDTOSchema, "No se pudo cargar la encuesta"),
  });
}

export function useResponderEncuesta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ResponderEncuestaInput) =>
      sendApi("/api/encuesta", "POST", v, EncuestaAlumnoDTOSchema, "No se pudo enviar la encuesta"),
    onSuccess: (dto) => qc.setQueryData(["encuesta"], dto),
  });
}

export function useResultadosEncuesta(periodo: string) {
  return useQuery({
    queryKey: ["encuestas-resultados", periodo],
    queryFn: () =>
      getApi(
        `/api/encuestas/resultados${periodo ? `?periodo=${encodeURIComponent(periodo)}` : ""}`,
        ResultadosEncuestaDTOSchema,
        "No se pudo cargar los resultados",
      ),
  });
}
