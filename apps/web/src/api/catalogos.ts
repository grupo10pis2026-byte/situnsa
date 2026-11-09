import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { apiFetch } from "./session.js";

export interface Programa {
  codigo: string;
  nombre: string;
}

/** Catálogos §18: cache de sesión (solo se invalidan si cambian). */
export function useProgramas() {
  return useQuery({
    queryKey: ["programas"],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async (): Promise<Programa[]> => {
      const res = await apiFetch(`${apiBaseUrl}/api/programas`);
      if (!res.ok) throw new Error("No se pudieron cargar los programas");
      return ((await res.json()) as { items: Programa[] }).items;
    },
  });
}
