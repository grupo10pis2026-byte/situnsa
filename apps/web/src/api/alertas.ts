import {
  type AlertasTallerDTO,
  AlertasTallerDTOSchema,
  type AlertaTallerDTO,
  AlertaTallerDTOSchema,
  type ReportesTallerDTO,
  ReportesTallerDTOSchema,
  type RetiroInput,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiBaseUrl } from "./client.js";
import { descargarArchivoProtegido } from "./expedientes.js";
import { getApi, sendApi } from "./taller.js";

export type { AlertasTallerDTO, AlertaTallerDTO, ReportesTallerDTO };

export const ETIQUETA_ALERTA: Record<string, string> = {
  FALTAS_CONSECUTIVAS: "Faltas consecutivas",
  PLAN_NO_PRESENTADO: "Plan no presentado",
  AVANCE_INCUMPLIDO: "Avance incumplido",
};

export function useAlertasTaller(f: { tallerId?: string; estado?: string }) {
  const p = new URLSearchParams();
  if (f.tallerId) p.set("tallerId", f.tallerId);
  if (f.estado) p.set("estado", f.estado);
  return useQuery({
    queryKey: ["alertas-taller", p.toString()],
    queryFn: () =>
      getApi(
        `/api/alertas-taller?${p.toString()}`,
        AlertasTallerDTOSchema,
        "No se pudo cargar las alertas",
      ),
  });
}

export function useDescartarAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; motivo: string }) =>
      sendApi(
        `/api/alertas-taller/${v.id}/descartar`,
        "POST",
        { motivo: v.motivo },
        AlertaTallerDTOSchema,
        "No se pudo descartar",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas-taller"] }),
  });
}

export function useRegistrarRetiro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tallerId: string; datos: RetiroInput }) =>
      sendApi(
        `/api/talleres/${v.tallerId}/retiros`,
        "POST",
        v.datos,
        z.object({ ok: z.literal(true) }),
        "No se pudo registrar el retiro",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alertas-taller"] });
      qc.invalidateQueries({ queryKey: ["taller"] });
    },
  });
}

export function useReportesTaller(tallerId: string | null) {
  return useQuery({
    queryKey: ["taller", tallerId ?? "", "reportes"],
    enabled: tallerId !== null,
    queryFn: () =>
      getApi(
        `/api/talleres/${tallerId}/reportes`,
        ReportesTallerDTOSchema,
        "No se pudo cargar los reportes",
      ),
  });
}

export function descargarReporte(tallerId: string, hito: string, formato: "pdf" | "xlsx") {
  return descargarArchivoProtegido(
    `${apiBaseUrl}/api/talleres/${tallerId}/reportes/${hito}?formato=${formato}`,
    `reporte.${formato}`,
  );
}
