import {
  type AceptarSolicitudInput,
  type ActualizarDatosMenoresInput,
  type EstadoConformidadDocumento,
  type FiltrosSolicitudesQuery,
  type KpisSolicitudes,
  type MiSolicitudDTO,
  MiSolicitudDTOSchema,
  type ObservarSolicitudInput,
  type RechazarSolicitudInput,
  type SolicitudDetalleDTO,
  SolicitudDetalleDTOSchema,
  type SolicitudResumen,
  SubsanacionPortalRespuestaSchema,
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

/* -------------------------------------------------------------------------- */
/* PORTAL DEL TESISTA                                                         */
/* -------------------------------------------------------------------------- */

export const miSolicitudKey = ["mi-solicitud"] as const;

/** Solicitud propia (null si el tesista no tiene ninguna). */
export function useMiSolicitud(habilitado = true) {
  return useQuery({
    queryKey: miSolicitudKey,
    enabled: habilitado,
    queryFn: async (): Promise<MiSolicitudDTO | null> => {
      const res = await apiFetch(`${apiBaseUrl}/api/v1/mi-solicitud`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar tu solicitud");
      const body = (await res.json()) as { solicitud: unknown };
      return body.solicitud === null ? null : MiSolicitudDTOSchema.parse(body.solicitud);
    },
  });
}

/** Reenvía la solicitud observada con los documentos reemplazados (multipart). */
export function useSubsanarMiSolicitud(solicitudId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (archivos: ReadonlyMap<string, File>) => {
      const fd = new FormData();
      for (const [documentoId, file] of archivos) fd.append(`archivo_${documentoId}`, file);
      const res = await apiFetch(`${apiBaseUrl}/api/v1/mi-solicitud/${solicitudId}/subsanar`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo enviar la subsanación");
      return SubsanacionPortalRespuestaSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: miSolicitudKey });
    },
  });
}

export function documentoSolicitudUrl(solicitudId: string, documentoId: string): string {
  return `${apiBaseUrl}/api/v1/solicitudes/${solicitudId}/documentos/${documentoId}/descargar`;
}
