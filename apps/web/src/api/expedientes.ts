import {
  type ActualizarDatosInput,
  type DocumentoRevisionDTO,
  DocumentoRevisionDTOSchema,
  type ExpedienteDetalleDTO,
  ExpedienteDetalleDTOSchema,
  type InscribirPlanInput,
  InscribirPlanSchema,
  type ObservacionDocumentoDTO,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { ApiError, errorDeRespuesta, mensajeDeCuerpo } from "./errores.js";
import { apiFetch } from "./session.js";

export const expedienteKey = (id: string) => ["expediente", id] as const;
export const expedientesKey = ["expedientes"] as const;
export const documentoRevisionKey = (id: string) => ["documento-revision", id] as const;

/** Lee el mensaje legible de un error API (envelope nuevo `{error.mensaje}` o legacy `{message}`). */
export const leerMensajeError = mensajeDeCuerpo;

async function leerDetalle(res: Response): Promise<ExpedienteDetalleDTO> {
  if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar el expediente");
  return ExpedienteDetalleDTOSchema.parse(await res.json());
}

/** Detalle (Datos + checklist + seguimiento + mensajes), validado contra el contrato. */
export function useExpedienteDetalle(id: string, enabled = true) {
  return useQuery({
    queryKey: expedienteKey(id),
    enabled,
    queryFn: async (): Promise<ExpedienteDetalleDTO> =>
      leerDetalle(await apiFetch(`${apiBaseUrl}/api/expedientes/${id}`)),
  });
}

async function leerRevisionDocumento(res: Response): Promise<DocumentoRevisionDTO | null> {
  if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar la revisión del documento");
  const body = await res.json();
  return body === null ? null : DocumentoRevisionDTOSchema.parse(body);
}

/** GET /api/documentos/:id/revision. */
export function useRevisionDocumento(documentoId: string | null | undefined) {
  return useQuery({
    queryKey: documentoRevisionKey(documentoId ?? "__sin-documento__"),
    enabled: !!documentoId,
    queryFn: async (): Promise<DocumentoRevisionDTO | null> => {
      if (!documentoId) return null;
      return leerRevisionDocumento(
        await apiFetch(`${apiBaseUrl}/api/documentos/${documentoId}/revision`),
      );
    },
  });
}

export interface FiltrosDashboard {
  q: string;
  estado: string;
  orden: string;
  vista?: string;
  page?: number;
  limit?: number;
}

export interface ItemExpediente {
  id: string;
  codigo: string;
  tesista: string;
  dni: string;
  programa: string;
  etapaActual: number;
  subetapaActual: string | null;
  estado: string;
  avancePct: number;
  updatedAt: string;
}

/** Dashboard §4: tabla + indicadores en una sola lectura (paginado page/limit). */
export function useListarExpedientes(f: FiltrosDashboard) {
  const page = f.page ?? 1;
  const limit = f.limit ?? 20;
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.estado) params.set("estado", f.estado);
  if (f.orden) params.set("orden", f.orden);
  if (f.vista) params.set("vista", f.vista);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return useQuery({
    queryKey: [...expedientesKey, f.q, f.estado, f.orden, f.vista ?? "", page, limit],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/api/expedientes?${params}`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar el listado");
      return (await res.json()) as {
        items: ItemExpediente[];
        resumen: { total: number; enCurso: number; finalizados: number; sinIniciar: number };
        total: number;
        page: number;
        limit: number;
      };
    },
  });
}

export type GuardadoEstado =
  | "sincronizado"
  | "editando"
  | "guardando"
  | "guardado"
  | "error"
  | "conflicto";

/** Autoguardado §6: PATCH con concurrencia optimista; 409 de versión → conflicto. */
export function useActualizarDatos(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ActualizarDatosInput): Promise<ExpedienteDetalleDTO> => {
      const res = await apiFetch(`${apiBaseUrl}/api/expedientes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as {
          updatedAt?: string;
          error?: { codigo?: string };
        } | null;
        const mensaje = mensajeDeCuerpo(body, "Conflicto de versión");
        // 409 por datos duplicados (correo de otra persona) es un error normal.
        if (body?.error?.codigo !== "CONFLICTO_CONCURRENCIA") throw new ApiError(409, mensaje);
        const err = new Error(mensaje) as Error & { conflicto: boolean; updatedAt: string };
        err.conflicto = true;
        err.updatedAt = body?.updatedAt ?? "";
        throw err;
      }
      return leerDetalle(res);
    },
    onSuccess: (data) => {
      qc.setQueryData(expedienteKey(id), data);
      qc.invalidateQueries({ queryKey: expedientesKey });
    },
  });
}

/** §10 Registro: valida en cliente (Zod) y crea REGISTRADO. */
export function useInscribir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InscribirPlanInput): Promise<{ id: string; codigo: string }> => {
      const body = InscribirPlanSchema.parse(input);
      const res = await apiFetch(`${apiBaseUrl}/api/expedientes/inscribir-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo registrar");
      const out = (await res.json()) as { id: string; codigo: string };
      qc.invalidateQueries({ queryKey: expedientesKey });
      return out;
    },
  });
}

/** §12 Validar: REGISTRADO → EN_PLAN; si ya validado, acceso directo. */
export function useValidar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<ExpedienteDetalleDTO> => {
      const res = await apiFetch(`${apiBaseUrl}/api/expedientes/${id}/validar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await leerDetalle(res);
      qc.setQueryData(expedienteKey(id), data);
      qc.invalidateQueries({ queryKey: expedientesKey });
      return data;
    },
  });
}

async function postJson<T>(ruta: string, body: unknown, respaldo: string): Promise<T> {
  const res = await apiFetch(`${apiBaseUrl}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorDeRespuesta(res, respaldo);
  return (await res.json()) as T;
}

/** OBSERVADO → estado de origen (el área verificó la subsanación). */
export function useLevantarObservacion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (comentario?: string) =>
      postJson<{ id: string; estado: string }>(
        `/api/expedientes/${id}/levantar-observacion`,
        comentario ? { comentario } : {},
        "No se pudo levantar la observación",
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expedienteKey(id) });
      qc.invalidateQueries({ queryKey: expedientesKey });
    },
  });
}

/** Reenvía a los participantes el enlace de su portal (activación/restablecimiento). */
export function useEnviarAcceso(id: string) {
  return useMutation({
    mutationFn: () =>
      postJson<{ enviados: number; destinatarios: string[] }>(
        `/api/expedientes/${id}/enviar-acceso`,
        {},
        "No se pudo enviar el acceso",
      ),
  });
}

export interface FormatoGenerado {
  id: string;
  tipo: string;
  nombre: string;
  version: number;
  pendientes: string[];
}

/** "INSERTAR DATOS EN DOCUMENTOS": genera o regenera los formatos PDF de la etapa con soporte para overrides. */
export function useGenerarDocumentos(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      param:
        | "E1"
        | "E2"
        | "E6"
        | {
            etapa: "E1" | "E2" | "E6";
            tipo?: string | undefined;
            overrides?: Record<string, string> | undefined;
          },
    ) => {
      const body = typeof param === "string" ? { etapa: param } : param;
      return postJson<{ generados: FormatoGenerado[] }>(
        `/api/expedientes/${id}/documentos/generar`,
        body,
        "No se pudieron generar los documentos",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expedienteKey(id) });
    },
  });
}

/** Mensaje administrativo §5. */
export function usePublicarMensaje(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (texto: string) => {
      await postJson(
        `/api/expedientes/${id}/mensajes`,
        { texto },
        "No se pudo publicar el mensaje",
      );
      qc.invalidateQueries({ queryKey: expedienteKey(id) });
    },
  });
}

export interface SubirResult {
  id: string;
  tipo: string;
  version: number;
}

/** ELIMINAR REGISTRO: borrado lógico → ANULADO. */
export function useAnular(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (motivo?: string): Promise<ExpedienteDetalleDTO> => {
      const res = await apiFetch(`${apiBaseUrl}/api/expedientes/${id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo ?? "" }),
      });
      const data = await leerDetalle(res);
      qc.setQueryData(expedienteKey(id), data);
      qc.invalidateQueries({ queryKey: expedientesKey });
      return data;
    },
  });
}

/** Upload multipart real (ruta nativa Fastify, ver documentos.routes). */
export function useSubirDocumento(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, file }: { tipo: string; file: File }): Promise<SubirResult> => {
      const form = new FormData();
      form.append("expedienteId", id);
      form.append("tipo", tipo);
      form.append("file", file);
      const res = await apiFetch(`${apiBaseUrl}/api/documentos/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw await errorDeRespuesta(res, "Error al subir");
      return (await res.json()) as SubirResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expedienteKey(id) });
      qc.invalidateQueries({ queryKey: expedientesKey });
    },
  });
}

export function documentoDescargaUrl(documentoId: string): string {
  return `${apiBaseUrl}/api/documentos/${documentoId}/descargar`;
}

export function formatoDescargaUrl(generadoId: string): string {
  return `${apiBaseUrl}/api/documentos-generados/${generadoId}/descargar`;
}

export function formatoPdfUrl(generadoId: string, descargar?: boolean): string {
  return `${apiBaseUrl}/api/documentos-generados/${generadoId}/pdf${descargar ? "?descargar=1" : ""}`;
}

export interface UsuarioConcurrente {
  id: string;
  nombre: string;
  rol: string;
  activoHaceSegundos: number;
}

export async function reportarPresenciaExpediente(
  expedienteId: string,
  nombre?: string,
): Promise<UsuarioConcurrente[]> {
  try {
    const res = await apiFetch(`${apiBaseUrl}/api/expedientes/${expedienteId}/presencia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { concurrentes?: UsuarioConcurrente[] };
    return data.concurrentes ?? [];
  } catch {
    return [];
  }
}

/**
 * Abre un PDF protegido en una pestaña nueva. Un `<a href>` no envía el
 * Bearer (vive solo en memoria) y la API respondía 401: se descarga con
 * `apiFetch` y se abre como objeto local.
 */
export async function descargarArchivoProtegido(url: string, nombre: string): Promise<void> {
  const res = await apiFetch(url);
  if (!res.ok) throw await errorDeRespuesta(res, "No se pudo descargar el archivo");
  const disp = res.headers.get("Content-Disposition") ?? "";
  let sugerido: string | undefined;
  const matchUtf8 = /filename\*=(?:UTF-8'')?([^;\r\n]+)/i.exec(disp);
  if (matchUtf8?.[1]) {
    try {
      sugerido = decodeURIComponent(matchUtf8[1].replace(/^["']|["']$/g, ""));
    } catch {
      sugerido = matchUtf8[1];
    }
  }
  if (!sugerido) {
    const matchSimple = /filename="?([^";\r\n]+)"?/i.exec(disp);
    if (matchSimple?.[1]) {
      try {
        sugerido = decodeURIComponent(matchSimple[1]);
      } catch {
        sugerido = matchSimple[1];
      }
    }
  }
  const objeto = URL.createObjectURL(await res.blob());
  const enlace = document.createElement("a");
  enlace.href = objeto;
  enlace.download = sugerido || nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(objeto), 60_000);
}

export async function abrirArchivoProtegido(url: string): Promise<void> {
  // La pestaña se abre antes del await para que el navegador no la bloquee.
  const ventana = window.open("", "_blank");
  try {
    const res = await apiFetch(url);
    if (!res.ok) throw await errorDeRespuesta(res, "No se pudo abrir el documento");
    const blob = await res.blob();
    const objeto = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = objeto;
    else window.location.assign(objeto);
    setTimeout(() => URL.revokeObjectURL(objeto), 60_000);
  } catch (e) {
    ventana?.close();
    throw e;
  }
}

export async function obtenerBlobArchivoProtegido(
  url: string,
): Promise<{ blobUrl: string; blob: Blob }> {
  const res = await apiFetch(url);
  if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar el documento");
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, blob };
}

export const observacionesDocumentoKey = (expedienteId: string, tipo: string) =>
  ["expedientes", expedienteId, "documentos", tipo, "observaciones"] as const;

/** Historial de observaciones para un tipo de documento específico. */
export function useObservacionesDocumento(expedienteId: string, tipo: string, habilitado = true) {
  return useQuery({
    queryKey: observacionesDocumentoKey(expedienteId, tipo),
    queryFn: async (): Promise<ObservacionDocumentoDTO[]> => {
      const res = await apiFetch(
        `${apiBaseUrl}/api/expedientes/${expedienteId}/documentos/${tipo}/observaciones`,
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo obtener las observaciones");
      return (await res.json()) as ObservacionDocumentoDTO[];
    },
    enabled: Boolean(expedienteId && tipo && habilitado),
  });
}

/** Registra una nueva observación administrativa para el documento. */
export function useCrearObservacionDocumento(expedienteId: string, tipo: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      texto: string;
      documentoId?: string;
    }): Promise<ObservacionDocumentoDTO> => {
      const res = await apiFetch(
        `${apiBaseUrl}/api/expedientes/${expedienteId}/documentos/${tipo}/observaciones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo registrar la observación");
      return (await res.json()) as ObservacionDocumentoDTO;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: observacionesDocumentoKey(expedienteId, tipo) });
      qc.invalidateQueries({ queryKey: expedienteKey(expedienteId) });
      qc.invalidateQueries({ queryKey: expedientesKey });
    },
  });
}

/** Marca una observación como resuelta por el tesista o revisor. */
export function useResolverObservacionDocumento(expedienteId: string, tipo: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (observacionId: string): Promise<ObservacionDocumentoDTO> => {
      const res = await apiFetch(
        `${apiBaseUrl}/api/expedientes/${expedienteId}/documentos/${tipo}/observaciones/${observacionId}/resolver`,
        {
          method: "PATCH",
        },
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo marcar como resuelta");
      return (await res.json()) as ObservacionDocumentoDTO;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: observacionesDocumentoKey(expedienteId, tipo) });
      qc.invalidateQueries({ queryKey: expedienteKey(expedienteId) });
    },
  });
}
