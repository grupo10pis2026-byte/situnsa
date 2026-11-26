import {
  type ActualizarFormatoBody,
  type EditarFormatoBody,
  type EditarFormatoResultadoDTO,
  EditarFormatoResultadoDTOSchema,
  type EtapaFormato,
  type FormatoDTO,
  FormatoDTOSchema,
  type FormatoPublicoDTO,
  type FormatoVersionDTO,
  FormatoVersionDTOSchema,
  type ListaFormatosDTO,
  ListaFormatosDTOSchema,
  type ListaFormatosPublicosDTO,
  ListaFormatosPublicosDTOSchema,
  type SubirFormatoResultadoDTO,
  SubirFormatoResultadoDTOSchema,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { ApiError, errorDeRespuesta } from "./errores.js";
import { apiFetch } from "./session.js";

/** Gestión de formatos: plantillas DOCX institucionales con versiones. */

const clave = ["formatos"] as const;
const claveVersiones = (variante: number, tipo: string) =>
  ["formatos", "versiones", variante, tipo] as const;

export function useFormatos() {
  return useQuery({
    queryKey: clave,
    queryFn: async (): Promise<ListaFormatosDTO> => {
      const res = await apiFetch(`${apiBaseUrl}/api/formatos`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar los formatos");
      return ListaFormatosDTOSchema.parse(await res.json());
    },
  });
}

export function useVersionesFormato(formato: Pick<FormatoDTO, "variante" | "tipo"> | null) {
  return useQuery({
    queryKey: claveVersiones(formato?.variante ?? 0, formato?.tipo ?? ""),
    enabled: formato !== null,
    queryFn: async (): Promise<FormatoVersionDTO[]> => {
      const res = await apiFetch(
        `${apiBaseUrl}/api/formatos/${formato?.variante}/${formato?.tipo}/versiones`,
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar el historial");
      return FormatoVersionDTOSchema.array().parse(await res.json());
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: clave });
}

export function useSubirFormato() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: {
      variante: number;
      tipo: string;
      file: File;
      nota: string;
    }): Promise<SubirFormatoResultadoDTO> => {
      const form = new FormData();
      // El campo de texto va antes del archivo (multipart se lee en orden).
      if (input.nota.trim()) form.append("nota", input.nota.trim());
      form.append("file", input.file);
      const res = await apiFetch(`${apiBaseUrl}/api/formatos/${input.variante}/${input.tipo}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo subir el formato");
      return SubirFormatoResultadoDTOSchema.parse(await res.json());
    },
    onSuccess: invalidar,
  });
}

/** Agrega un formato nuevo (con su primera versión) a una etapa de la variante. */
export function useAgregarFormato() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: {
      variante: number;
      etapa: EtapaFormato;
      nombre: string;
      file: File;
      nota: string;
    }): Promise<SubirFormatoResultadoDTO> => {
      const form = new FormData();
      // Los campos de texto van antes del archivo (multipart se lee en orden).
      form.append("nombre", input.nombre.trim());
      form.append("etapa", input.etapa);
      if (input.nota.trim()) form.append("nota", input.nota.trim());
      form.append("file", input.file);
      const res = await apiFetch(`${apiBaseUrl}/api/formatos/${input.variante}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo agregar el formato");
      return SubirFormatoResultadoDTOSchema.parse(await res.json());
    },
    onSuccess: invalidar,
  });
}

/** Mueve un formato a otra etapa o renombra un formato agregado. */
export function useActualizarFormato() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: {
      formato: Pick<FormatoDTO, "variante" | "tipo">;
      cambios: ActualizarFormatoBody;
    }): Promise<FormatoDTO> => {
      const res = await apiFetch(
        `${apiBaseUrl}/api/formatos/${input.formato.variante}/${input.formato.tipo}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.cambios),
        },
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo actualizar el formato");
      return FormatoDTOSchema.parse(await res.json());
    },
    onSuccess: invalidar,
  });
}

/** Restaura un formato eliminado en su etapa. */
export function useReactivarFormato() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (f: Pick<FormatoDTO, "variante" | "tipo">): Promise<FormatoDTO> => {
      const res = await apiFetch(`${apiBaseUrl}/api/formatos/${f.variante}/${f.tipo}/reactivar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo restaurar el formato");
      return FormatoDTOSchema.parse(await res.json());
    },
    onSuccess: invalidar,
  });
}

/** Elimina un formato del catálogo de su variante (restaurable). */
export function useEliminarFormato() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (f: Pick<FormatoDTO, "variante" | "tipo">): Promise<void> => {
      const res = await apiFetch(`${apiBaseUrl}/api/formatos/${f.variante}/${f.tipo}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo eliminar el formato");
    },
    onSuccess: invalidar,
  });
}

/**
 * Edición en línea (buscar y reemplazar). Con `aplicar: false` solo simula y
 * no invalida el catálogo; al aplicar crea una versión nueva activa.
 */
export function useEditarFormato() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: {
      formato: Pick<FormatoDTO, "variante" | "tipo">;
      cuerpo: EditarFormatoBody;
    }): Promise<EditarFormatoResultadoDTO> => {
      const res = await apiFetch(
        `${apiBaseUrl}/api/formatos/${input.formato.variante}/${input.formato.tipo}/editar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.cuerpo),
        },
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo editar el formato");
      return EditarFormatoResultadoDTOSchema.parse(await res.json());
    },
    onSuccess: async (r) => {
      if (r.resultado) await invalidar();
    },
    // 409: otra versión quedó vigente; recargar el catálogo para reabrir sobre ella.
    onError: async (e) => {
      if (e instanceof ApiError && e.status === 409) await invalidar();
    },
  });
}

export function useActivarVersion() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (versionId: string): Promise<FormatoDTO> => {
      const res = await apiFetch(`${apiBaseUrl}/api/formatos/versiones/${versionId}/activar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo activar la versión");
      return FormatoDTOSchema.parse(await res.json());
    },
    onSuccess: invalidar,
  });
}

export function useRestaurarBase() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (f: Pick<FormatoDTO, "variante" | "tipo">): Promise<FormatoDTO> => {
      const res = await apiFetch(
        `${apiBaseUrl}/api/formatos/${f.variante}/${f.tipo}/restaurar-base`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo restaurar la plantilla base");
      return FormatoDTOSchema.parse(await res.json());
    },
    onSuccess: invalidar,
  });
}

export function formatoVigenteUrl(f: Pick<FormatoDTO, "variante" | "tipo">): string {
  return `${apiBaseUrl}/api/formatos/${f.variante}/${f.tipo}/descargar`;
}

export function versionFormatoUrl(versionId: string): string {
  return `${apiBaseUrl}/api/formatos/versiones/${versionId}/descargar`;
}

/** PDF de la plantilla vigente (etiquetas visibles), para el visor in-situ. */
export function formatoVistaPreviaUrl(f: Pick<FormatoDTO, "variante" | "tipo">): string {
  return `${apiBaseUrl}/api/formatos/${f.variante}/${f.tipo}/vista-previa`;
}

export function versionVistaPreviaUrl(versionId: string): string {
  return `${apiBaseUrl}/api/formatos/versiones/${versionId}/vista-previa`;
}

/**
 * Formatos de Mesa de Partes con archivo disponible (ruta pública, sin
 * sesión): el wizard ofrece su descarga junto a cada requisito.
 */
export function useFormatosMesaDePartes(variante: 1 | 2) {
  return useQuery({
    queryKey: ["formatos", "mesa-de-partes", variante] as const,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<ListaFormatosPublicosDTO> => {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/public/formatos-mesa-de-partes?variante=${variante}`,
      );
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar los formatos");
      return ListaFormatosPublicosDTOSchema.parse(await res.json());
    },
  });
}

/** Descarga pública del formato vigente de Mesa de Partes (enlace directo, sin Bearer). */
export function formatoMesaDePartesUrl(f: Pick<FormatoPublicoDTO, "variante" | "tipo">): string {
  return `${apiBaseUrl}/api/v1/public/formatos-mesa-de-partes/${f.variante}/${f.tipo}/descargar`;
}
