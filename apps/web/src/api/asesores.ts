import {
  type AsesorDTO,
  AsesorDTOSchema,
  type CrearAsesorInput,
  type EditarAsesorInput,
  EspecialidadResumenSchema,
  type PerfilAsesorDTO,
  PerfilAsesorDTOSchema,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta } from "./errores.js";
import { apiFetch } from "./session.js";

/** P15 Lista de asesores y P10 Perfil (spec v1.0). */

export type { AsesorDTO, PerfilAsesorDTO };

const LISTA = ["asesores"] as const;
const perfilClave = (id: string) => ["asesores", "perfil", id] as const;

export function useAsesores() {
  return useQuery({
    queryKey: LISTA,
    queryFn: async (): Promise<AsesorDTO[]> => {
      const res = await apiFetch(`${apiBaseUrl}/api/asesores`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudieron cargar los asesores");
      return z.object({ items: z.array(AsesorDTOSchema) }).parse(await res.json()).items;
    },
  });
}

export function useEspecialidades() {
  return useQuery({
    queryKey: ["especialidades"],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/api/especialidades`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudieron cargar las especialidades");
      return z.object({ items: z.array(EspecialidadResumenSchema) }).parse(await res.json()).items;
    },
  });
}

async function enviar(ruta: string, metodo: string, cuerpo: unknown): Promise<unknown> {
  const res = await apiFetch(`${apiBaseUrl}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw await errorDeRespuesta(res, "No se pudo guardar");
  return res.json();
}

export function useCrearAsesor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CrearAsesorInput): Promise<AsesorDTO> =>
      AsesorDTOSchema.parse(await enviar("/api/asesores", "POST", input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LISTA });
      void qc.invalidateQueries({ queryKey: ["especialidades"] });
    },
  });
}

export function useEditarAsesor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: string;
      cambios: EditarAsesorInput;
    }): Promise<AsesorDTO> =>
      AsesorDTOSchema.parse(await enviar(`/api/asesores/${id}`, "PATCH", cambios)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LISTA });
    },
  });
}

export function usePerfilAsesor(id: string) {
  return useQuery({
    queryKey: perfilClave(id),
    queryFn: async (): Promise<PerfilAsesorDTO> => {
      const res = await apiFetch(`${apiBaseUrl}/api/asesores/${id}/perfil`);
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar el perfil");
      return PerfilAsesorDTOSchema.parse(await res.json());
    },
  });
}

export type OperacionPerfil =
  | { tipo: "agregarEspecialidad"; nombre: string }
  | { tipo: "quitarEspecialidad"; especialidadId: string }
  | { tipo: "eliminarArchivo"; archivoId: string }
  | { tipo: "subirArchivo"; archivo: File };

async function operarPerfil(id: string, op: OperacionPerfil): Promise<PerfilAsesorDTO> {
  switch (op.tipo) {
    case "agregarEspecialidad":
      return PerfilAsesorDTOSchema.parse(
        await enviar(`/api/asesores/${id}/especialidades`, "POST", { nombre: op.nombre }),
      );
    case "quitarEspecialidad":
      return PerfilAsesorDTOSchema.parse(
        await enviar(`/api/asesores/${id}/especialidades/${op.especialidadId}`, "DELETE", {}),
      );
    case "eliminarArchivo":
      return PerfilAsesorDTOSchema.parse(
        await enviar(`/api/asesores/${id}/archivos/${op.archivoId}`, "DELETE", {}),
      );
    case "subirArchivo": {
      const datos = new FormData();
      datos.append("file", op.archivo);
      const res = await apiFetch(`${apiBaseUrl}/api/asesores/${id}/archivos`, {
        method: "POST",
        body: datos,
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo subir el archivo");
      return PerfilAsesorDTOSchema.parse(await res.json());
    }
  }
}

/** Una mutación para todo P10: la respuesta es el perfil actualizado. */
export function useEditarPerfilAsesor(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (op: OperacionPerfil) => operarPerfil(id, op),
    onSuccess: (perfil) => {
      qc.setQueryData(perfilClave(id), perfil);
      void qc.invalidateQueries({ queryKey: LISTA });
      void qc.invalidateQueries({ queryKey: ["especialidades"] });
    },
  });
}

export function archivoAsesorUrl(asesorId: string, archivoId: string): string {
  return `${apiBaseUrl}/api/asesores/${asesorId}/archivos/${archivoId}`;
}
