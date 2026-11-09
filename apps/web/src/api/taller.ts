import {
  AsistenciaSesionDTOSchema,
  type CalendarioPropuestoDTO,
  CalendarioPropuestoDTOSchema,
  CandidatoTallerDTOSchema,
  type CrearTallerInput,
  type DatosTallerInput,
  ProyectosTallerDTOSchema,
  SesionesTallerDTOSchema,
  type TallerDetalleDTO,
  TallerDetalleDTOSchema,
  type TallerDTO,
  TallerDTOSchema,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta } from "./errores.js";
import { apiFetch } from "./session.js";

export type {
  CalendarioPropuestoDTO,
  CrearTallerInput,
  DatosTallerInput,
  TallerDetalleDTO,
  TallerDTO,
};

const ItemsTaller = z.object({ items: z.array(TallerDTOSchema) });

async function get<T>(path: string, schema: z.ZodType<T>, respaldo: string): Promise<T> {
  const res = await apiFetch(`${apiBaseUrl}${path}`);
  if (!res.ok) throw await errorDeRespuesta(res, respaldo);
  return schema.parse(await res.json()) as T;
}

async function send<T>(
  path: string,
  method: string,
  body: unknown,
  schema: z.ZodType<T>,
  respaldo: string,
): Promise<T> {
  const res = await apiFetch(`${apiBaseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorDeRespuesta(res, respaldo);
  return schema.parse(await res.json()) as T;
}

export interface FiltrosTaller {
  periodo?: string;
  estado?: string;
  asesorDni?: string;
}

/** P1 Lista (filtros combinables). */
export function useTalleres(f: FiltrosTaller) {
  const params = new URLSearchParams();
  if (f.periodo) params.set("periodo", f.periodo);
  if (f.estado) params.set("estado", f.estado);
  if (f.asesorDni) params.set("asesorDni", f.asesorDni);
  return useQuery({
    queryKey: ["talleres", f.periodo ?? "", f.estado ?? "", f.asesorDni ?? ""],
    queryFn: () =>
      get(`/api/talleres?${params}`, ItemsTaller, "No se pudieron cargar los talleres"),
  });
}

/** Estados en que el taller está vigente (abierto, completo o en curso). */
export const ESTADOS_VIGENTES = ["ABIERTO_INSCRIPCIONES", "COMPLETO", "EN_CURSO"] as const;

export function esVigente(estado: string): boolean {
  return (ESTADOS_VIGENTES as readonly string[]).includes(estado);
}

/** Etiquetas de estado del taller (spec v1.0 §6). */
export const ETIQUETA_ESTADO_TALLER: Record<string, string> = {
  ABIERTO_INSCRIPCIONES: "Abierto a inscripciones",
  COMPLETO: "Completo",
  EN_CURSO: "En curso",
  FINALIZADO: "Finalizado",
  CANCELADO: "Cancelado",
};

export function useCrearTaller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearTallerInput) =>
      send("/api/talleres", "POST", input, TallerDetalleDTOSchema, "No se pudo crear el taller"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["talleres"] });
      qc.invalidateQueries({ queryKey: ["asesores"] });
    },
  });
}

/** P2: valores iniciales del formulario (parámetros del taller). */
export function useDefectosTaller() {
  return useQuery({
    queryKey: ["talleres", "defectos"],
    queryFn: () =>
      get(
        "/api/talleres/defectos",
        z.object({
          cupoProyectos: z.number(),
          numeroSesiones: z.number(),
          montoPension: z.number(),
        }),
        "No se pudieron cargar los valores iniciales",
      ),
  });
}

/** P2: calendario propuesto (sin guardar), con feriados y fechas sugeridas. */
export function useProponerCalendario() {
  return useMutation({
    mutationFn: (input: {
      inicio: string;
      fin: string;
      dias: Array<{ dia: number; horaInicio: string; horaFin: string }>;
      numeroSesiones: number;
    }) =>
      send(
        "/api/talleres/calendario",
        "POST",
        input,
        CalendarioPropuestoDTOSchema,
        "No se pudo proponer el calendario",
      ),
  });
}

/** P3 Detalle. */
export function useTaller(id: string | null) {
  return useQuery({
    queryKey: ["taller", id ?? ""],
    enabled: !!id,
    queryFn: () =>
      get(`/api/talleres/${id}`, TallerDetalleDTOSchema, "No se pudo cargar el taller"),
  });
}

export function useEditarTaller(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosTallerInput): Promise<TallerDetalleDTO> =>
      send(`/api/talleres/${id}`, "PATCH", datos, TallerDetalleDTOSchema, "No se pudo guardar"),
    onSuccess: (d) => {
      qc.setQueryData(["taller", id], d);
      qc.invalidateQueries({ queryKey: ["talleres"] });
    },
  });
}

export function useCambiarAsesor(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { asesorId: string; motivo: string }) =>
      send(
        `/api/talleres/${id}/asesor`,
        "POST",
        input,
        TallerDetalleDTOSchema,
        "No se pudo cambiar el asesor",
      ),
    onSuccess: (d) => {
      qc.setQueryData(["taller", id], d);
      qc.invalidateQueries({ queryKey: ["talleres"] });
      qc.invalidateQueries({ queryKey: ["asesores"] });
    },
  });
}

export function useCancelarTaller(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (motivo: string) =>
      send(
        `/api/talleres/${id}/cancelar`,
        "POST",
        { motivo },
        TallerDetalleDTOSchema,
        "No se pudo cancelar",
      ),
    onSuccess: (d) => {
      qc.setQueryData(["taller", id], d);
      qc.invalidateQueries({ queryKey: ["talleres"] });
      qc.invalidateQueries({ queryKey: ["asesores"] });
    },
  });
}

const DIAS_CORTO = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** "Sáb y Dom 09:00" (P1: días y hora de inicio). */
const DIAS_LARGO = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Día ISO (1=Lun) de una fecha AAAA-MM-DD en hora de Perú. */
function diaIso(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00-05:00`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/** "Sáb 17/10" (P4/P5/P7/P8/P9: fecha corta con día). */
export function fechaCorta(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return fecha;
  const corto = DIAS_CORTO[diaIso(fecha)] ?? "";
  return `${corto} ${m[3]}/${m[2]}`;
}

/** "31/10" (P6/P7: día y mes). */
export function diaMes(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return fecha;
  return `${m[3]}/${m[2]}`;
}

/** "sáb 17/10/2026" (P2: vista previa). */
export function fechaLarga(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return fecha;
  const largo = DIAS_LARGO[diaIso(fecha)] ?? "";
  return `${largo.toLowerCase()} ${m[3]}/${m[2]}/${m[1]}`;
}

/** "12 días" / "1 día" de atraso respecto a hoy en Lima (P9). */
export function atrasoTexto(vencimiento: string): string {
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dias = Math.max(
    0,
    Math.round(
      (Date.parse(`${hoy}T00:00:00-05:00`) - Date.parse(`${vencimiento}T00:00:00-05:00`)) /
        86_400_000,
    ),
  );
  return dias === 1 ? "1 día" : `${dias} días`;
}

// ── Proyectos del taller (P3 Alumnos y D1, spec v1.0) ──────────────────

export type { CandidatoTallerDTO, ProyectosTallerDTO } from "@pis/contracts";

export function useProyectos(tallerId: string) {
  return useQuery({
    queryKey: ["taller", tallerId, "proyectos"],
    queryFn: () =>
      get(
        `/api/talleres/${tallerId}/proyectos`,
        ProyectosTallerDTOSchema,
        "No se pudieron cargar los proyectos",
      ),
  });
}

/** D1: datos del alumno por DNI (nombre, chips y motivo). Solo con 8 dígitos. */
export function useCandidato(tallerId: string, dni: string) {
  const valido = /^\d{8}$/.test(dni);
  return useQuery({
    queryKey: ["taller", tallerId, "candidato", dni],
    enabled: valido,
    queryFn: () =>
      get(
        `/api/talleres/${tallerId}/candidato?dni=${dni}`,
        CandidatoTallerDTOSchema,
        "No se pudo consultar el DNI",
      ),
  });
}

export function useAsignarProyecto(tallerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { dni1: string; dni2: string | null; grupoHorarioId: string | null }) =>
      send(
        `/api/talleres/${tallerId}/proyectos`,
        "POST",
        input,
        ProyectosTallerDTOSchema,
        "No se pudo asignar",
      ),
    onSuccess: (lista) => {
      qc.setQueryData(["taller", tallerId, "proyectos"], lista);
      qc.invalidateQueries({ queryKey: ["taller", tallerId] });
      qc.invalidateQueries({ queryKey: ["talleres"] });
    },
  });
}

// ── Sesiones, asistencia y grupos de horario (P4, P5, D2) ──────────────

export type { AsistenciaSesionDTO, SesionesTallerDTO } from "@pis/contracts";

export function useSesionesTaller(tallerId: string) {
  return useQuery({
    queryKey: ["taller", tallerId, "sesiones"],
    queryFn: () =>
      get(
        `/api/talleres/${tallerId}/sesiones`,
        SesionesTallerDTOSchema,
        "No se pudieron cargar las sesiones",
      ),
  });
}

export function useAsistenciaSesion(sesionId: string | null) {
  return useQuery({
    queryKey: ["sesion", sesionId ?? "", "asistencia"],
    enabled: sesionId !== null,
    queryFn: () =>
      get(
        `/api/sesiones/${sesionId}/asistencia`,
        AsistenciaSesionDTOSchema,
        "No se pudo cargar la asistencia",
      ),
  });
}

function refrescarTaller(qc: ReturnType<typeof useQueryClient>, tallerId: string) {
  qc.invalidateQueries({ queryKey: ["taller", tallerId] });
  qc.invalidateQueries({ queryKey: ["talleres"] });
}

export function useGuardarAsistencia(sesionId: string, tallerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      grupoId: string | null;
      marcas: Array<{
        alumnoId: string;
        estado: "PRESENTE" | "FALTA" | "JUSTIFICADA";
        motivo: string | null;
      }>;
    }) =>
      send(
        `/api/sesiones/${sesionId}/asistencia`,
        "POST",
        input,
        AsistenciaSesionDTOSchema,
        "No se pudo guardar la asistencia",
      ),
    onSuccess: (dto) => {
      qc.setQueryData(["sesion", sesionId, "asistencia"], dto);
      refrescarTaller(qc, tallerId);
    },
  });
}

type CuerpoSesion = { fecha: string; horaInicio: string; horaFin: string; motivo: string };

export function useProgramarSesion(tallerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      op:
        | { tipo: "agregar"; datos: CuerpoSesion }
        | { tipo: "reprogramar"; sesionId: string; datos: CuerpoSesion }
        | { tipo: "cancelar"; sesionId: string; motivo: string },
    ) => {
      if (op.tipo === "agregar")
        return send(
          `/api/talleres/${tallerId}/sesiones`,
          "POST",
          op.datos,
          SesionesTallerDTOSchema,
          "No se pudo agregar la sesión",
        );
      if (op.tipo === "reprogramar")
        return send(
          `/api/sesiones/${op.sesionId}/reprogramar`,
          "POST",
          op.datos,
          SesionesTallerDTOSchema,
          "No se pudo reprogramar",
        );
      return send(
        `/api/sesiones/${op.sesionId}/cancelar`,
        "POST",
        { motivo: op.motivo },
        SesionesTallerDTOSchema,
        "No se pudo cancelar",
      );
    },
    onSuccess: (dto) => {
      qc.setQueryData(["taller", tallerId, "sesiones"], dto);
      refrescarTaller(qc, tallerId);
    },
  });
}

export function useGuardarGrupo(tallerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      op:
        | {
            tipo: "crear" | "editar";
            grupoId?: string;
            datos: { nombre: string; horaInicio: string; horaFin: string; proyectoIds: string[] };
          }
        | { tipo: "eliminar"; grupoId: string },
    ) => {
      if (op.tipo === "crear")
        return send(
          `/api/talleres/${tallerId}/grupos`,
          "POST",
          op.datos,
          SesionesTallerDTOSchema,
          "No se pudo crear el grupo",
        );
      if (op.tipo === "editar")
        return send(
          `/api/grupos/${op.grupoId}`,
          "PATCH",
          op.datos,
          SesionesTallerDTOSchema,
          "No se pudo guardar el grupo",
        );
      return send(
        `/api/grupos/${op.grupoId}`,
        "DELETE",
        {},
        SesionesTallerDTOSchema,
        "No se pudo eliminar el grupo",
      );
    },
    onSuccess: (dto) => {
      qc.setQueryData(["taller", tallerId, "sesiones"], dto);
      refrescarTaller(qc, tallerId);
    },
  });
}

/** Helpers JSON compartidos por los demás módulos del taller. */
export { get as getApi, send as sendApi };
