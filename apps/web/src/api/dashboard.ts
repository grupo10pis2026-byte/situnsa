import {
  type DashboardTallerDTO,
  DashboardTallerDTOSchema,
  type FiltrosDashboard,
} from "@pis/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { descargarArchivoProtegido } from "./expedientes.js";
import { getApi } from "./taller.js";

export type { DashboardTallerDTO, FiltrosDashboard };

function parametros(f: FiltrosDashboard): string {
  const p = new URLSearchParams();
  if (f.tallerId) p.set("tallerId", f.tallerId);
  if (f.periodo) p.set("periodo", f.periodo);
  if (f.grupoId) p.set("grupoId", f.grupoId);
  return p.toString();
}

/** Adenda 1.2 N2: indicadores del taller (o de todos) con los filtros activos. */
export function useDashboardTaller(f: FiltrosDashboard) {
  const q = parametros(f);
  return useQuery({
    queryKey: ["dashboard-taller", q],
    placeholderData: keepPreviousData,
    queryFn: () =>
      getApi(
        `/api/dashboard-taller?${q}`,
        DashboardTallerDTOSchema,
        "No se pudo cargar el dashboard",
      ),
  });
}

/** PDF con los mismos filtros y números. */
export function descargarDashboardPdf(f: FiltrosDashboard): Promise<void> {
  return descargarArchivoProtegido(
    `${apiBaseUrl}/api/dashboard-taller/pdf?${parametros(f)}`,
    "dashboard-taller.pdf",
  );
}
