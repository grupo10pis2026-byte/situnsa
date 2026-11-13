import {
  type AceptarSolicitudInput,
  type ActualizarDatosMenoresInput,
  type EstadoConformidadDocumento,
  type FiltrosSolicitudesQuery,
  type KpisSolicitudes,
  type ObservarSolicitudInput,
  type RechazarSolicitudInput,
  type SolicitudDetalleDTO,
  SolicitudDetalleDTOSchema,
  type SolicitudResumen,
  type SubsanarSolicitudPayload,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta, mensajeDeCuerpo } from "./errores.js";
import { apiFetch } from "./session.js";

export const solicitudesKey = ["solicitudes"] as const;
export const solicitudKey = (id: string) => ["solicitud", id] as const;

export const leerMensajeError = mensajeDeCuerpo;

/* -------------------------------------------------------------------------- */
/* HOOKS ADMINISTRATIVOS                                                      */
/* -------------------------------------------------------------------------- */

export interface ListarSolicitudesRespuesta {
  items: SolicitudResumen[];
  meta: { total: number; page: number; limit: number };
  kpis: KpisSolicitudes;
}

export function useListarSolicitudes(f: FiltrosSolicitudesQuery) {
  const page = f.page ?? 1;
  const limit = f.limit ?? 20;
  const params = new URLSearchParams();
  if (f.modalidad) params.set("modalidad", f.modalidad);
  if (f.via) params.set("via", f.via);
  if (f.estado) params.set("estado", f.estado);
  if (f.programa) params.set("programa", f.programa);
  if (f.q) params.set("q", f.q);
  if (f.desde) params.set("desde", f.desde);
  if (f.hasta) params.set("hasta", f.hasta);
  params.set("page", String(page));
  params.set("limit", String(limit));

  return useQuery({
    queryKey: [
      ...solicitudesKey,
      f.modalidad ?? "",
      f.via ?? "",
      f.estado ?? "",
      f.programa ?? "",
      f.q ?? "",
      f.desde ?? "",
      f.hasta ?? "",
      page,
      limit,
    ],
    queryFn: async (): Promise<ListarSolicitudesRespuesta> => {
      const res = await apiFetch(`${apiBaseUrl}/api/v1/solicitudes?${params}`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar la bandeja de solicitudes");
      return (await res.json()) as ListarSolicitudesRespuesta;
    },
  });
}

export function useSolicitudDetalle(id: string, enabled = true) {
  return useQuery({
    queryKey: solicitudKey(id),
    enabled: Boolean(id) && enabled,
    queryFn: async (): Promise<SolicitudDetalleDTO> => {
      const res = await apiFetch(`${apiBaseUrl}/api/v1/solicitudes/${id}`);
      if (!res.ok)
        throw await errorDeRespuesta(res, "No se pudo cargar el detalle de la solicitud");
      const data = (await res.json()) as { solicitud: unknown };
      return SolicitudDetalleDTOSchema.parse(data.solicitud);
    },
  });
}

export function useSugerirCodigoSet() {
  return useQuery({
    queryKey: ["sugerir-codigo-set"],
    queryFn: async (): Promise<string> => {
      const res = await apiFetch(`${apiBaseUrl}/api/v1/solicitudes/sugerir-codigo-set`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo calcular el código SET");
      const data = (await res.json()) as { codigoSugerido: string };
      return data.codigoSugerido;
    },
  });
}

export function useActualizarDatosMenores(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ActualizarDatosMenoresInput) => {
      const res = await apiFetch(`${apiBaseUrl}/api/v1/solicitudes/${id}/datos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudieron actualizar los datos");
      return (await res.json()) as { ok: true; mensaje: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: solicitudKey(id) });
      void queryClient.invalidateQueries({ queryKey: solicitudesKey });
    },
  });
}

export function useActualizarConformidadDocumento(solicitudId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      documentoId,
      estadoConformidad,
    }: {
      documentoId: string;
      estadoConformidad: EstadoConformidadDocumento;
    }) => {
      const res = await apiFetch(
        `${apiBaseUrl}/api/v1/solicitudes/${solicitudId}/documentos/${documentoId}/conformidad`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estadoConformidad }),
        },
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo actualizar la conformidad");
      return (await res.json()) as { ok: true; estadoConformidad: EstadoConformidadDocumento };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: solicitudKey(solicitudId) });
      void queryClient.invalidateQueries({ queryKey: solicitudesKey });
    },
  });
}

export function useObservarSolicitud(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ObservarSolicitudInput) => {
      const res = await apiFetch(`${apiBaseUrl}/api/v1/solicitudes/${id}/observar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo observar la solicitud");
      return (await res.json()) as { ok: true; mensaje: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: solicitudKey(id) });
      void queryClient.invalidateQueries({ queryKey: solicitudesKey });
    },
  });
}

export function useRechazarSolicitud(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RechazarSolicitudInput) => {
      const res = await apiFetch(`${apiBaseUrl}/api/v1/solicitudes/${id}/rechazar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo rechazar la solicitud");
      return (await res.json()) as { ok: true; mensaje: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: solicitudKey(id) });
      void queryClient.invalidateQueries({ queryKey: solicitudesKey });
    },
  });
}

export function useAceptarSolicitud(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AceptarSolicitudInput) => {
      const res = await apiFetch(`${apiBaseUrl}/api/v1/solicitudes/${id}/aceptar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo aceptar la solicitud");
      return (await res.json()) as { ok: true; expedienteId: string; codigoSet: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: solicitudKey(id) });
      void queryClient.invalidateQueries({ queryKey: solicitudesKey });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* ACCIONES PÚBLICAS                                                          */
/* -------------------------------------------------------------------------- */

export async function crearSolicitudPublica(formData: FormData): Promise<{
  ok: true;
  id: string;
  codigo: string;
}> {
  const res = await fetch(`${apiBaseUrl}/api/v1/public/solicitudes`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw await errorDeRespuesta(res, "No se pudo enviar la solicitud");
  return (await res.json()) as { ok: true; id: string; codigo: string };
}

export interface SolicitudSubsanacionPublica {
  codigo: string;
  titulo: string;
  programa: string;
  via: string;
  modalidad: string;
  motivoObservacion: string;
  fechaLimiteSubsanacion: string;
  esPlazoVencido: boolean;
  participantes: Array<{
    orden: number;
    nombres: string;
    apellidos: string;
    dni: string;
    email: string;
    telefono: string | null;
  }>;
  documentos: Array<{
    id: string;
    tipo: string;
    nombreOriginal: string;
    estadoConformidad: string;
  }>;
}

export function useConsultarPorTokenSubsanacion(token: string) {
  return useQuery({
    queryKey: ["subsanar", token],
    enabled: Boolean(token),
    queryFn: async (): Promise<SolicitudSubsanacionPublica> => {
      const res = await fetch(`${apiBaseUrl}/api/v1/public/subsanar/${token}`);
      if (!res.ok)
        throw await errorDeRespuesta(res, "No se pudo cargar la información para subsanación");
      const data = (await res.json()) as { solicitud: SolicitudSubsanacionPublica };
      return data.solicitud;
    },
  });
}

export function useSubsanarConToken(token: string) {
  return useMutation({
    mutationFn: async (payload: SubsanarSolicitudPayload) => {
      const res = await fetch(`${apiBaseUrl}/api/v1/public/subsanar/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo enviar la subsanación");
      return (await res.json()) as { ok: true; mensaje: string };
    },
  });
}

export function documentoSolicitudUrl(solicitudId: string, documentoId: string): string {
  return `${apiBaseUrl}/api/v1/solicitudes/${solicitudId}/documentos/${documentoId}/descargar`;
}
