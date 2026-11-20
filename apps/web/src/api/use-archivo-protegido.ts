import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorDeRespuesta } from "./errores.js";
import { apiFetch } from "./session.js";

/**
 * Descarga un archivo protegido (Bearer) y expone un object URL para
 * mostrarlo en la misma pantalla (iframe/img). El Blob queda en la caché de
 * React Query, así alternar entre documentos no vuelve a descargarlos; el
 * object URL se crea por montaje y se libera al desmontar o cambiar de URL.
 */
export function useArchivoProtegido(url: string | null) {
  const consulta = useQuery({
    queryKey: ["archivo-protegido", url],
    enabled: url !== null,
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<Blob> => {
      const res = await apiFetch(url ?? "");
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar el documento");
      return res.blob();
    },
  });

  const [objetoUrl, setObjetoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!consulta.data) {
      setObjetoUrl(null);
      return;
    }
    const u = URL.createObjectURL(consulta.data);
    setObjetoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [consulta.data]);

  return {
    objetoUrl,
    tipoMime: consulta.data?.type ?? null,
    cargando: consulta.isFetching && !consulta.data,
    error: consulta.error instanceof Error ? consulta.error.message : null,
  };
}
