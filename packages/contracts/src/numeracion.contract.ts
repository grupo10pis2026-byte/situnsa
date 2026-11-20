import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Registro de oficios y decretos. El Excel del área sigue siendo la fuente
 * maestra: SITUNSA lo importa (solo lectura) y vincula cada número con un
 * único expediente. Solo el oficio circular (<<OFICIO>>) y el decreto
 * (<<DECRETO>>) salen de este registro.
 *
 * Ruta nativa Fastify (multipart): POST /api/numeracion/importar (file .xlsx) → ImportacionDTO
 */

export const TipoNumeracionSchema = z.enum(["OFICIO", "DECRETO"]);
export type TipoNumeracionDTO = z.infer<typeof TipoNumeracionSchema>;

export const VinculoRegistroDTOSchema = z.object({
  expedienteId: z.string().uuid(),
  codigo: z.string(),
  origen: z.enum(["AUTOMATICO", "MANUAL"]),
  createdAt: z.string(),
});

export const RegistroNumeracionDTOSchema = z.object({
  id: z.string().uuid(),
  tipo: TipoNumeracionSchema,
  numero: z.string(),
  /** Como entra en el documento (`12` → `0012`). */
  numeroFormateado: z.string(),
  datos: z.record(z.string(), z.string()),
  fila: z.number().int().nullable(),
  vigente: z.boolean(),
  vinculo: VinculoRegistroDTOSchema.nullable(),
});

export const ResumenHojaDTOSchema = z.object({
  hojaEncontrada: z.boolean(),
  leidos: z.number().int(),
  nuevos: z.number().int(),
  actualizados: z.number().int(),
  retirados: z.number().int(),
  duplicados: z.array(z.string()),
  columnasFaltantes: z.array(z.string()),
});

export const ResumenImportacionDTOSchema = z.object({
  OFICIO: ResumenHojaDTOSchema,
  DECRETO: ResumenHojaDTOSchema,
  vinculadosAutomaticamente: z.number().int(),
  /** Vínculos cuyo número ya no figura en el Excel (revisar). */
  vinculosRetirados: z.array(
    z.object({ tipo: TipoNumeracionSchema, numero: z.string(), codigo: z.string() }),
  ),
});

export const ImportacionDTOSchema = z.object({
  id: z.string().uuid(),
  nombreArchivo: z.string(),
  creadoPor: z.string().nullable(),
  createdAt: z.string(),
  resumen: ResumenImportacionDTOSchema,
});

export const ListaRegistrosDTOSchema = z.object({
  items: z.array(RegistroNumeracionDTOSchema),
  total: z.number().int(),
  ultimaImportacion: ImportacionDTOSchema.nullable(),
});

export const EstadoNumeracionDTOSchema = z.object({
  tipo: TipoNumeracionSchema,
  registro: RegistroNumeracionDTOSchema.nullable(),
  candidatos: z.array(z.object({ registro: RegistroNumeracionDTOSchema, puntaje: z.number() })),
});

export const NumeracionExpedienteDTOSchema = z.object({
  /** false si todavía no se importó ningún Excel (los campos se editan a mano). */
  registroDisponible: z.boolean(),
  OFICIO: EstadoNumeracionDTOSchema,
  DECRETO: EstadoNumeracionDTOSchema,
});

export const FiltroRegistrosSchema = z.object({
  tipo: TipoNumeracionSchema,
  q: z.string().trim().max(120).optional(),
  estado: z.enum(["todos", "libres", "vinculados", "retirados"]).default("todos"),
  pagina: z.coerce.number().int().min(1).default(1),
});

export const VincularNumeroSchema = z.object({ numero: z.string().trim().min(1).max(64) });

export type RegistroNumeracionDTO = z.infer<typeof RegistroNumeracionDTOSchema>;
export type ResumenImportacionDTO = z.infer<typeof ResumenImportacionDTOSchema>;
export type ImportacionDTO = z.infer<typeof ImportacionDTOSchema>;
export type ListaRegistrosDTO = z.infer<typeof ListaRegistrosDTOSchema>;
export type EstadoNumeracionDTO = z.infer<typeof EstadoNumeracionDTOSchema>;
export type NumeracionExpedienteDTO = z.infer<typeof NumeracionExpedienteDTOSchema>;
export type FiltroRegistros = z.infer<typeof FiltroRegistrosSchema>;

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const paramsVinculo = z.object({ id: z.string().uuid(), tipo: TipoNumeracionSchema });

export const numeracionContract = c.router({
  listarRegistros: {
    method: "GET",
    path: "/api/numeracion/registros",
    query: FiltroRegistrosSchema,
    responses: { 200: ListaRegistrosDTOSchema, ...errores },
    summary: "Registro de oficios o decretos importado (paginado, 50 por página)",
  },
  numeracionExpediente: {
    method: "GET",
    path: "/api/expedientes/:id/numeracion",
    pathParams: z.object({ id: z.string().uuid() }),
    responses: { 200: NumeracionExpedienteDTOSchema, ...errores },
    summary: "Oficio circular y decreto vinculados al expediente, con candidatos",
  },
  vincularNumero: {
    method: "POST",
    path: "/api/expedientes/:id/numeracion/:tipo",
    pathParams: paramsVinculo,
    body: VincularNumeroSchema,
    responses: { 200: NumeracionExpedienteDTOSchema, ...errores },
    summary: "Vincula un número del registro (único por expediente y por número)",
  },
  desvincularNumero: {
    method: "DELETE",
    path: "/api/expedientes/:id/numeracion/:tipo",
    pathParams: paramsVinculo,
    body: z.object({}).optional(),
    responses: { 200: NumeracionExpedienteDTOSchema, ...errores },
    summary: "Libera el número vinculado al expediente",
  },
});
