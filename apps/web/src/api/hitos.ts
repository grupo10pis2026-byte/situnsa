import {
  type AprobarPlanInput,
  type EntregasProyectoDTO,
  EntregasProyectoDTOSchema,
  type HitoDetalleDTO,
  type MatrizHitosDTO,
  MatrizHitosDTOSchema,
  type PlanTallerDTO,
  PlanTallerDTOSchema,
  type PreviaAprobacionDTO,
  PreviaAprobacionDTOSchema,
  type TipoHitoDTO,
  type VersionEntregaDTO,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta } from "./errores.js";
import { descargarArchivoProtegido } from "./expedientes.js";
import { apiFetch } from "./session.js";
import { getApi, sendApi } from "./taller.js";

export type {
  AprobarPlanInput,
  EntregasProyectoDTO,
  HitoDetalleDTO,
  MatrizHitosDTO,
  PlanTallerDTO,
  PreviaAprobacionDTO,
  TipoHitoDTO,
  VersionEntregaDTO,
};

export const ETIQUETA_ESTADO_HITO: Record<string, string> = {
  NO_HABILITADO: "No habilitado",
  HABILITADO: "Habilitado",
  ENTREGADO: "Entregado",
  APROBADO: "Aprobado",
  OBSERVADO: "Observado",
  NO_ENTREGADO: "No entregado",
};

export const ETIQUETA_ESTADO_VERSION: Record<string, string> = {
  ENTREGADA: "Por revisar",
  CONFORME: "Conforme",
  OBSERVADA: "Observada",
};

// ── Plan (P6/P7) ───────────────────────────────────────────────────────
export function usePlanTaller(tallerId: string) {
  return useQuery({
    queryKey: ["taller", tallerId, "plan"],
    queryFn: () =>
      getApi(`/api/talleres/${tallerId}/plan`, PlanTallerDTOSchema, "No se pudo cargar el plan"),
  });
}

export function useEditarSemanaPlan(tallerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { semana: number; contenido: string; indicaciones: string | null }) =>
      sendApi(
        `/api/talleres/${tallerId}/plan/${v.semana}`,
        "PATCH",
        { contenido: v.contenido, indicaciones: v.indicaciones },
        PlanTallerDTOSchema,
        "No se pudo guardar la semana",
      ),
    onSuccess: (dto) => qc.setQueryData(["taller", tallerId, "plan"], dto),
  });
}

// ── Matriz (P6) ────────────────────────────────────────────────────────
export function useMatrizHitos(tallerId: string) {
  return useQuery({
    queryKey: ["taller", tallerId, "hitos"],
    queryFn: () =>
      getApi(
        `/api/talleres/${tallerId}/hitos`,
        MatrizHitosDTOSchema,
        "No se pudo cargar los hitos",
      ),
  });
}

export function useHabilitarColumna(tallerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tipo: TipoHitoDTO) =>
      sendApi(
        `/api/talleres/${tallerId}/hitos/${tipo}/habilitar`,
        "POST",
        {},
        MatrizHitosDTOSchema,
        "No se pudo habilitar el hito",
      ),
    onSuccess: (dto) => {
      qc.setQueryData(["taller", tallerId, "hitos"], dto);
      qc.invalidateQueries({ queryKey: ["proyecto"] });
    },
  });
}

export function descargarZipHito(tallerId: string, tipo: TipoHitoDTO): Promise<void> {
  return descargarArchivoProtegido(
    `${apiBaseUrl}/api/talleres/${tallerId}/hitos/${tipo}/zip`,
    `${tipo}.zip`,
  );
}

// ── Entregas de un proyecto (P6b/P7) ───────────────────────────────────
export function useEntregasProyecto(proyectoId: string | null) {
  return useQuery({
    queryKey: ["proyecto", proyectoId ?? "", "entregas"],
    enabled: proyectoId !== null,
    queryFn: () =>
      getApi(
        `/api/proyectos/${proyectoId}/entregas`,
        EntregasProyectoDTOSchema,
        "No se pudo cargar las entregas",
      ),
  });
}

export type OperacionHito =
  | { tipo: "habilitar"; hitoId: string }
  | { tipo: "fecha"; hitoId: string; fechaLimite: string }
  | { tipo: "reabrir"; hitoId: string; fechaLimite: string }
  | {
      tipo: "revisar";
      entregaId: string;
      resultado: "CONFORME" | "OBSERVADA";
      observaciones: string | null;
    }
  | { tipo: "aprobarPlan"; datos: AprobarPlanInput }
  | { tipo: "subir"; hitoId: string; archivo: File; comentario: string };

async function operar(proyectoId: string, op: OperacionHito): Promise<EntregasProyectoDTO> {
  const S = EntregasProyectoDTOSchema;
  switch (op.tipo) {
    case "habilitar":
      return sendApi(`/api/hitos/${op.hitoId}/habilitar`, "POST", {}, S, "No se pudo habilitar");
    case "fecha":
      return sendApi(
        `/api/hitos/${op.hitoId}/fecha`,
        "PATCH",
        { fechaLimite: op.fechaLimite },
        S,
        "No se pudo cambiar la fecha",
      );
    case "reabrir":
      return sendApi(
        `/api/hitos/${op.hitoId}/reabrir`,
        "POST",
        { fechaLimite: op.fechaLimite },
        S,
        "No se pudo habilitar la nueva entrega",
      );
    case "revisar":
      return sendApi(
        `/api/entregas/${op.entregaId}/revisar`,
        "POST",
        { resultado: op.resultado, observaciones: op.observaciones },
        S,
        "No se pudo guardar la revisión",
      );
    case "aprobarPlan":
      return sendApi(
        `/api/proyectos/${proyectoId}/aprobar-plan`,
        "POST",
        op.datos,
        S,
        "No se pudo aprobar el plan",
      );
    case "subir": {
      const datos = new FormData();
      // El comentario va antes del archivo (el servidor lo lee junto al archivo).
      if (op.comentario.trim()) datos.append("comentario", op.comentario.trim());
      datos.append("file", op.archivo);
      const res = await apiFetch(`${apiBaseUrl}/api/hitos/${op.hitoId}/entregas`, {
        method: "POST",
        body: datos,
      });
      if (!res.ok) throw await errorDeRespuesta(res, "No se pudo subir el archivo");
      return S.parse(await res.json());
    }
  }
}

export function useOperarHito(proyectoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (op: OperacionHito) => operar(proyectoId, op),
    onSuccess: (dto) => {
      qc.setQueryData(["proyecto", proyectoId, "entregas"], dto);
      qc.invalidateQueries({ queryKey: ["taller", dto.proyecto.tallerId] });
      qc.invalidateQueries({ queryKey: ["proyecto", proyectoId] });
      qc.invalidateQueries({ queryKey: ["mi-taller"] });
    },
  });
}

export function usePreviaAprobacion(proyectoId: string, abierto: boolean) {
  return useQuery({
    queryKey: ["proyecto", proyectoId, "aprobar-plan"],
    enabled: abierto,
    queryFn: () =>
      getApi(
        `/api/proyectos/${proyectoId}/aprobar-plan`,
        PreviaAprobacionDTOSchema,
        "No se pudo cargar la aprobación",
      ),
  });
}

export function descargarVersion(v: VersionEntregaDTO): Promise<void> {
  return descargarArchivoProtegido(`${apiBaseUrl}/api/entregas/${v.id}/archivo`, v.nombreArchivo);
}
