import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorEnvelopeSchema } from "./api-conventions.js";

/**
 * Gestión de formatos: el área reemplaza las plantillas DOCX institucionales
 * sin desplegar. Cada formato (tipo × variante 1|2 tesistas) usa su versión
 * activa o, si no hay, la plantilla base del sistema.
 *
 * El área también organiza el catálogo por etapa: agrega formatos nuevos a
 * la Etapa 01 o 02 de cada variante y mueve cualquier formato de etapa.
 *
 * La categoría «Mesa de Partes» (`MP`) agrupa los formatos en blanco que el
 * postulante descarga, llena y adjunta en el wizard público. No se generan con
 * datos del expediente ni se mueven a una etapa (ni al revés).
 *
 * Rutas nativas Fastify (multipart y descargas, fuera de ts-rest):
 * - POST /api/formatos/:variante                 (multipart: nombre, etapa, nota?, file .docx) → SubirFormatoResultadoDTO (formato agregado)
 * - POST /api/formatos/:variante/:tipo          (multipart: file .docx, nota?) → SubirFormatoResultadoDTO
 * - GET  /api/formatos/:variante/:tipo/descargar (plantilla vigente)
 * - GET  /api/formatos/versiones/:id/descargar
 * - GET  /api/formatos/:variante/:tipo/vista-previa (PDF de la plantilla vigente)
 * - GET  /api/formatos/versiones/:id/vista-previa
 * - GET  /api/v1/public/formatos-mesa-de-partes?variante=1|2   (público) → ListaFormatosPublicosDTO
 * - GET  /api/v1/public/formatos-mesa-de-partes/:variante/:tipo/descargar (público, solo `MP`)
 */

export const VarianteFormatoSchema = z.coerce.number().int().min(1).max(2);
export const TipoFormatoSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);
export const EtapaFormatoSchema = z.enum(["E1", "E2", "MP"]);

/** Categoría de los formatos que se entregan en blanco al postulante (Mesa de Partes). */
export const ETAPA_MESA_DE_PARTES = "MP" as const;

/**
 * Formatos del sistema de la categoría Mesa de Partes. `requisito` es la
 * clave del documento que pide el wizard público (`mesa-de-partes.tsx`): el
 * wizard ofrece la descarga del formato vigente junto a ese requisito.
 */
export const FORMATOS_MESA_DE_PARTES = [
  {
    tipo: "MP_ANEXO_17",
    requisito: "ANEXO_17",
    nombre: "Anexo 17 · Solicitud de inscripción de proyecto",
  },
  {
    tipo: "MP_ANEXO_18",
    requisito: "ANEXO_18",
    nombre: "Anexo 18 · Carta de aceptación de asesoramiento",
  },
  {
    tipo: "MP_PLAN_TESIS",
    requisito: "PLAN_TESIS",
    nombre: "Esquema del Plan de Tesis",
  },
  {
    tipo: "MP_PLAN_TRABAJO_ACADEMICO",
    requisito: "PLAN_TRABAJO_ACADEMICO",
    nombre: "Esquema del Plan de Trabajo Académico",
  },
  {
    tipo: "MP_AUTORIZACION_EMPRESA",
    requisito: "AUTORIZACION_EMPRESA",
    nombre: "Autorización de uso de información de empresa / institución",
  },
] as const;
export const NombreFormatoSchema = z.string().trim().min(3).max(120);

export const FormatoVersionDTOSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  nombreArchivo: z.string(),
  tamanoBytes: z.number().int(),
  etiquetas: z.array(z.string()),
  advertencias: z.array(z.string()),
  nota: z.string().nullable(),
  activa: z.boolean(),
  creadoPor: z.string().nullable(),
  createdAt: z.string(),
});

export const FormatoDTOSchema = z.object({
  tipo: z.string(),
  variante: z.number().int(),
  /** Etapa vigente en la que se agrupa y genera el formato. */
  etapa: EtapaFormatoSchema,
  /** Etapa original del formato del sistema; `null` si lo agregó el área. */
  etapaOriginal: EtapaFormatoSchema.nullable(),
  /** true = formato nuevo agregado por el área (sin plantilla base). */
  agregado: z.boolean(),
  /** true = eliminado del catálogo (no se genera); se puede restaurar. */
  archivado: z.boolean(),
  nombre: z.string(),
  archivoBase: z.string(),
  origen: z.enum(["BASE", "PERSONALIZADO"]),
  versionActiva: FormatoVersionDTOSchema.nullable(),
  totalVersiones: z.number().int(),
  /** false = no hay versión subida ni plantilla base: falta subir el primer archivo. */
  disponible: z.boolean(),
});

export const ListaFormatosDTOSchema = z.object({ formatos: z.array(FormatoDTOSchema) });

/** Formato de Mesa de Partes que el wizard público puede ofrecer para descargar. */
export const FormatoPublicoDTOSchema = z.object({
  tipo: z.string(),
  variante: z.number().int(),
  nombre: z.string(),
  /** Clave del requisito del wizard; `null` en un formato agregado por el área. */
  requisito: z.string().nullable(),
  nombreArchivo: z.string(),
});

export const ListaFormatosPublicosDTOSchema = z.object({
  formatos: z.array(FormatoPublicoDTOSchema),
});

export const SubirFormatoResultadoDTOSchema = z.object({
  formato: FormatoDTOSchema,
  version: FormatoVersionDTOSchema,
  /** Etiquetas que Word había partido y el sistema unió. */
  reparadas: z.number().int(),
});

export const ActualizarFormatoBodySchema = z
  .object({ etapa: EtapaFormatoSchema.optional(), nombre: NombreFormatoSchema.optional() })
  .refine((b) => b.etapa !== undefined || b.nombre !== undefined, {
    message: "Indique la etapa o el nombre",
  });

/** Texto de un solo renglón (el reemplazo se escribe dentro de un párrafo). */
const TextoEnLinea = z.string().regex(/^[^\r\n]*$/, "Use una sola línea de texto");

export const ReemplazoFormatoSchema = z.object({
  buscar: TextoEnLinea.max(500).refine((s) => s.trim().length > 0, "Indique el texto a buscar"),
  reemplazo: TextoEnLinea.max(500),
});

/**
 * Edición en línea: buscar y reemplazar texto en la plantilla vigente. Con
 * `aplicar: false` solo informa coincidencias y avisos; con `true` crea una
 * versión nueva activa. `versionBase` es la versión que la usuaria tenía a
 * la vista (`null` = base del sistema): si cambió, 409.
 */
export const EditarFormatoBodySchema = z.object({
  reemplazos: z.array(ReemplazoFormatoSchema).min(1).max(20),
  versionBase: z.number().int().nullable(),
  nota: z.string().max(500).optional(),
  aplicar: z.boolean(),
});

export const MuestraCoincidenciaSchema = z.object({
  parte: z.enum(["CUERPO", "ENCABEZADO", "PIE"]),
  antes: z.string(),
  texto: z.string(),
  despues: z.string(),
});

export const CoincidenciasReemplazoSchema = z.object({
  buscar: z.string(),
  reemplazo: z.string(),
  total: z.number().int(),
  /** Primeras coincidencias con su contexto (para revisar antes de aplicar). */
  muestras: z.array(MuestraCoincidenciaSchema),
});

export const EditarFormatoResultadoDTOSchema = z.object({
  versionBase: z.number().int().nullable(),
  coincidencias: z.array(CoincidenciasReemplazoSchema),
  /** Avisos de la plantilla resultante (etiquetas desconocidas u omitidas). */
  advertencias: z.array(z.string()),
  /** Versión creada; `null` en la simulación. */
  resultado: SubirFormatoResultadoDTOSchema.nullable(),
});

export type FormatoVersionDTO = z.infer<typeof FormatoVersionDTOSchema>;
export type FormatoDTO = z.infer<typeof FormatoDTOSchema>;
export type ListaFormatosDTO = z.infer<typeof ListaFormatosDTOSchema>;
export type FormatoPublicoDTO = z.infer<typeof FormatoPublicoDTOSchema>;
export type ListaFormatosPublicosDTO = z.infer<typeof ListaFormatosPublicosDTOSchema>;
export type SubirFormatoResultadoDTO = z.infer<typeof SubirFormatoResultadoDTOSchema>;
export type EtapaFormato = z.infer<typeof EtapaFormatoSchema>;
export type ActualizarFormatoBody = z.infer<typeof ActualizarFormatoBodySchema>;
export type ReemplazoFormato = z.infer<typeof ReemplazoFormatoSchema>;
export type EditarFormatoBody = z.infer<typeof EditarFormatoBodySchema>;
export type EditarFormatoResultadoDTO = z.infer<typeof EditarFormatoResultadoDTOSchema>;

const c = initContract();

const errores = {
  400: ErrorEnvelopeSchema,
  401: ErrorEnvelopeSchema,
  403: ErrorEnvelopeSchema,
  404: ErrorEnvelopeSchema,
  409: ErrorEnvelopeSchema,
} as const;

const paramsFormato = z.object({ variante: VarianteFormatoSchema, tipo: TipoFormatoSchema });

export const formatosContract = c.router({
  listarFormatos: {
    method: "GET",
    path: "/api/formatos",
    responses: { 200: ListaFormatosDTOSchema, ...errores },
    summary: "Catálogo de formatos con su versión vigente",
  },
  versionesFormato: {
    method: "GET",
    path: "/api/formatos/:variante/:tipo/versiones",
    pathParams: paramsFormato,
    responses: { 200: z.array(FormatoVersionDTOSchema), ...errores },
    summary: "Historial de versiones subidas de un formato",
  },
  actualizarFormato: {
    method: "PATCH",
    path: "/api/formatos/:variante/:tipo",
    pathParams: paramsFormato,
    body: ActualizarFormatoBodySchema,
    responses: { 200: FormatoDTOSchema, ...errores },
    summary:
      "Mueve el formato a otra etapa (no hacia/desde Mesa de Partes) o renombra uno agregado",
  },
  eliminarFormato: {
    method: "DELETE",
    path: "/api/formatos/:variante/:tipo",
    pathParams: paramsFormato,
    body: z.object({}).optional(),
    responses: { 200: z.object({ ok: z.literal(true) }), ...errores },
    summary: "Elimina un formato del catálogo de la variante (se archiva, restaurable)",
  },
  reactivarFormato: {
    method: "POST",
    path: "/api/formatos/:variante/:tipo/reactivar",
    pathParams: paramsFormato,
    body: z.object({}).optional(),
    responses: { 200: FormatoDTOSchema, ...errores },
    summary: "Restaura un formato eliminado",
  },
  editarFormato: {
    method: "POST",
    path: "/api/formatos/:variante/:tipo/editar",
    pathParams: paramsFormato,
    body: EditarFormatoBodySchema,
    responses: { 200: EditarFormatoResultadoDTOSchema, ...errores },
    summary: "Buscar y reemplazar texto en la plantilla vigente (simula o crea una versión)",
  },
  activarVersionFormato: {
    method: "POST",
    path: "/api/formatos/versiones/:id/activar",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}).optional(),
    responses: { 200: FormatoDTOSchema, ...errores },
    summary: "Vuelve a usar una versión anterior del formato",
  },
  restaurarFormatoBase: {
    method: "POST",
    path: "/api/formatos/:variante/:tipo/restaurar-base",
    pathParams: paramsFormato,
    body: z.object({}).optional(),
    responses: { 200: FormatoDTOSchema, ...errores },
    summary: "Desactiva las versiones subidas y vuelve a la plantilla base",
  },
});
