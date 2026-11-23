import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Adenda 1.2 N2: Dashboard del taller (Secretaría, Dirección y
 * Administrador, solo lectura). Los números se calculan en el servidor con
 * las mismas reglas que las demás pantallas. El PDF (ruta nativa
 * /api/dashboard-taller/pdf) usa los mismos filtros.
 */

export const FiltrosDashboardSchema = z.object({
  /** Vacío = todos los talleres. */
  tallerId: z.string().uuid().optional(),
  periodo: z.string().max(32).optional(),
  /** Solo con un taller elegido. */
  grupoId: z.string().uuid().optional(),
});

const Cantidad = z.object({ cantidad: z.number().int(), monto: z.number().int() });

export const DashboardTallerDTOSchema = z.object({
  titulo: z.string(),
  generadoAt: z.string(),
  filtros: z.object({
    tallerId: z.string().uuid().nullable(),
    periodo: z.string().nullable(),
    grupoId: z.string().uuid().nullable(),
  }),
  opciones: z.object({
    talleres: z.array(
      z.object({ id: z.string().uuid(), nombre: z.string(), periodo: z.string().nullable() }),
    ),
    periodos: z.array(z.string()),
    grupos: z.array(z.object({ id: z.string().uuid(), nombre: z.string() })),
  }),
  inscripcion: z.object({
    proyectos: z.number().int(),
    cupo: z.number().int(),
    alumnos: z.number().int(),
  }),
  asistencia: z.object({
    /** (PRESENTE + JUSTIFICADA) / realizadas, promedio de los alumnos activos. */
    promedio: z.number().nullable(),
    porGrupo: z.array(
      z.object({ grupo: z.string(), promedio: z.number().nullable(), alumnos: z.number().int() }),
    ),
    conFaltasConsecutivas: z.number().int(),
    /** Solo con un taller elegido (la vista de todos no lista datos personales). */
    alumnosConFaltas: z.array(z.object({ nombre: z.string(), proyecto: z.string() })),
  }),
  plan: z.object({
    presentados: z.number().int(),
    aprobados: z.number().int(),
    observados: z.number().int(),
    noPresentados: z.number().int(),
    pendientes: z.number().int(),
  }),
  avances: z.array(
    z.object({
      hito: z.string(),
      nombre: z.string(),
      proyectos: z.number().int(),
      entregadas: z.number().int(),
      aprobadas: z.number().int(),
      porGrupo: z.array(
        z.object({
          grupo: z.string(),
          proyectos: z.number().int(),
          entregadas: z.number().int(),
          aprobadas: z.number().int(),
        }),
      ),
    }),
  ),
  pensiones: z.object({ alDia: Cantidad, pendientes: Cantidad, vencidas: Cantidad }),
  alertas: z.array(
    z.object({ tipo: z.string(), etiqueta: z.string(), cantidad: z.number().int() }),
  ),
  sesiones: z.object({ realizadas: z.number().int(), total: z.number().int() }),
  /** Vista de todos los talleres: totales por taller, sin datos personales. */
  comparacion: z.array(
    z.object({
      tallerId: z.string().uuid(),
      nombre: z.string(),
      estado: z.string(),
      proyectos: z.number().int(),
      cupo: z.number().int(),
      asistencia: z.number().nullable(),
      planesAprobados: z.number().int(),
      vencidas: z.number().int(),
      alertas: z.number().int(),
    }),
  ),
});

export type FiltrosDashboard = z.infer<typeof FiltrosDashboardSchema>;
export type DashboardTallerDTO = z.infer<typeof DashboardTallerDTOSchema>;

const c = initContract();

export const dashboardTallerContract = c.router({
  obtener: {
    method: "GET",
    path: "/api/dashboard-taller",
    query: FiltrosDashboardSchema,
    responses: {
      200: DashboardTallerDTOSchema,
      400: ErrorEnvelopeSchema,
      401: ErrorEnvelopeSchema,
      403: ErrorEnvelopeSchema,
      404: ErrorEnvelopeSchema,
    },
    summary: "Adenda N2: indicadores del taller (o de todos) con los filtros activos",
  },
});
