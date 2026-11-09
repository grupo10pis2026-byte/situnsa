import {
  type ComprobanteDTO,
  type FiltrosPagos,
  type MiPensionDTO,
  type MisPagosDTO,
  MisPagosDTOSchema,
  type PagosTallerDTO,
  PagosTallerDTOSchema,
  type PensionFilaDTO,
  PensionFilaDTOSchema,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta } from "./errores.js";
import { abrirArchivoProtegido } from "./expedientes.js";
import { apiFetch } from "./session.js";
import { getApi, sendApi } from "./taller.js";

export type {
  ComprobanteDTO,
  FiltrosPagos,
  MiPensionDTO,
  MisPagosDTO,
  PagosTallerDTO,
  PensionFilaDTO,
};

export const ETIQUETA_PENSION: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_REVISION: "En revisión",
  VALIDADA: "Pagada",
  OBSERVADA: "Observada",
  VENCIDA: "Vencida",
};

export function usePagosTaller(f: FiltrosPagos) {
  const p = new URLSearchParams();
  if (f.tallerId) p.set("tallerId", f.tallerId);
  if (f.estado) p.set("estado", f.estado);
  if (f.deudores) p.set("deudores", f.deudores);
  if (f.q) p.set("q", f.q);
  return useQuery({
    queryKey: ["pagos-taller", p.toString()],
    queryFn: () =>
      getApi(
        `/api/pagos-taller?${p.toString()}`,
        PagosTallerDTOSchema,
        "No se pudo cargar los pagos",
      ),
  });
}

export type OperacionPago =
  | { tipo: "validar"; comprobanteId: string }
  | { tipo: "observar"; comprobanteId: string; motivo: string }
  | { tipo: "pagoDirecto"; pensionId: string; observacion: string | null };

export function useOperarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (op: OperacionPago) => {
      if (op.tipo === "validar")
        return sendApi(
          `/api/comprobantes/${op.comprobanteId}/validar`,
          "POST",
          {},
          PensionFilaDTOSchema,
          "No se pudo validar",
        );
      if (op.tipo === "observar")
        return sendApi(
          `/api/comprobantes/${op.comprobanteId}/observar`,
          "POST",
          { motivo: op.motivo },
          PensionFilaDTOSchema,
          "No se pudo observar",
        );
      return sendApi(
        `/api/pensiones-alumno/${op.pensionId}/pago-directo`,
        "POST",
        { observacion: op.observacion },
        PensionFilaDTOSchema,
        "No se pudo registrar el pago",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pagos-taller"] });
      qc.invalidateQueries({ queryKey: ["taller"] });
    },
  });
}

export function useMisPagos() {
  return useQuery({
    queryKey: ["mis-pagos"],
    queryFn: () => getApi("/api/mis-pagos", MisPagosDTOSchema, "No se pudo cargar tus pagos"),
  });
}

export function useSubirComprobante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { pensionId: string; archivo: File }) => {
      const datos = new FormData();
      datos.append("file", v.archivo);
      const res = await apiFetch(`${apiBaseUrl}/api/pensiones-alumno/${v.pensionId}/comprobante`, {
        method: "POST",
        body: datos,
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo subir el comprobante");
      return MisPagosDTOSchema.parse(await res.json());
    },
    onSuccess: (dto) => {
      qc.setQueryData(["mis-pagos"], dto);
      qc.invalidateQueries({ queryKey: ["mi-taller"] });
    },
  });
}

export function verComprobante(c: ComprobanteDTO): Promise<void> {
  return abrirArchivoProtegido(`${apiBaseUrl}/api/comprobantes/${c.id}/archivo`);
}
