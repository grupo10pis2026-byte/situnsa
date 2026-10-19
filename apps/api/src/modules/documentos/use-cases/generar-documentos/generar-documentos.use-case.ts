import {
  db,
  documentos,
  documentosGenerados,
  expedientes,
  jurados,
  juradosExpediente,
  sustentaciones,
  usuarios,
  validacionesInstitucionales,
} from "@pis/db";
import {
  construirDatosDocumento,
  type DocumentoRenderizado,
  DomainError,
  type EtapaPlantilla,
  type ExpedienteDocumento,
  esEtiquetaFecha,
  esEtiquetaHora,
  fail,
  fechaIso,
  fechaLarga,
  formatoAutoridad,
  horaLimpia,
  ok,
  PLANTILLAS,
  type Result,
  renderizarPlantilla,
  resolverNombreArchivo,
  resolverSubcarpetaEtapa,
  VERSION_PLANTILLAS,
} from "@pis/domain";
import { and, eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { obtenerPlantillaDocx, procesarDocxBuffer } from "../../../../infra/docx/render-docx.js";
import { type MetaPdf, renderizarPdf } from "../../../../infra/pdf/render-documento.js";
import type { AlmacenamientoPort } from "../../../../infra/storage/almacenamiento.port.js";
import { LocalStorageService } from "../../../../infra/storage/local-storage.service.js";
import { appendAuditoria } from "../../../expedientes/expedientes.auditoria.js";
import { type DetalleRow, getDetalleById } from "../../../expedientes/expedientes.repository.js";

export interface Actor {
  id: string;
  dni: string;
}

export interface FormatoGenerado {
  id: string;
  tipo: string;
  nombre: string;
  version: number;
  pendientes: string[];
}

/** Detalle del expediente → datos de etiquetas (separado para pruebas). */
export function expedienteParaDocumentos(
  d: DetalleRow,
  sustentacion: NonNullable<ExpedienteDocumento["sustentacion"]> | null,
  extras: Pick<ExpedienteDocumento, "jurado" | "validaciones"> = {},
): ExpedienteDocumento {
  const persona = (p: DetalleRow["participante1"]) =>
    p
      ? {
          nombres: p.nombres,
          apellidos: p.apellidos,
          dni: p.dni,
          cui: p.cui,
          grado: p.grado,
          email: p.email,
          telefono: p.telefono,
          direccion: p.direccion,
          ciudad: p.ciudad,
          nacionalidad: p.nacionalidad,
        }
      : null;
  return {
    codigo: d.codigo,
    titulo: d.titulo,
    programa: d.programa,
    modalidad: d.modalidad,
    participante1: persona(d.participante1),
    participante2: persona(d.participante2),
    asesor: persona(d.asesor),
    datosAdmin: d.datosAdmin,
    sustentacion,
    ...extras,
  };
}

/** Estados en que se emite el informe para Secretaría (E6, HU-0045). */
const ESTADOS_E6 = new Set(["EN_APROBACION", "TITULO_EMITIDO"]);

/** Primera URL http(s) del detalle de la validación REPOSITORIO. */
export function urlDeDetalle(detalle: string | null): string | null {
  return /https?:\/\/\S+/i.exec(detalle ?? "")?.[0] ?? null;
}

/** Mapea overrides del modal in-situ a columnas de base de datos de expedientes y usuarios. */
export function extraerCambiosExpedienteYUsuarios(
  overrides: Record<string, string>,
): {
  expediente: Record<string, unknown>;
  participante1: Record<string, unknown>;
  participante2: Record<string, unknown>;
} {
  const exp: Record<string, unknown> = {};
  const p1: Record<string, unknown> = {};
  const p2: Record<string, unknown> = {};

  for (const [rawK, rawV] of Object.entries(overrides)) {
    const k = rawK.trim().toUpperCase().replace(/\s+/g, "_");
    const v = rawV.trim();
    if (!v) continue;

    // Expediente - Decretos, Oficios y Recomendación
    if (k === "DECRETO" || k === "N°_DECRETO" || k === "NRO_DECRETO") exp.nroDecreto = v;
    if (k === "OFICIO" || k === "N°_OFICIO" || k === "NRO_OFICIO") exp.nroOficio = v;
    if (k === "RECOMENDACION" || k === "RECOMENDACIÓN") exp.recomendacion = v;

    // Expediente - Autoridades
    if (k === "COASESOR" || k === "CO_ASESOR") exp.coAsesor = formatoAutoridad(v);
    if (k === "ASESOR") exp.asesorNombre = formatoAutoridad(v);
    if (k === "PRESIDENTE") exp.presidente = formatoAutoridad(v);
    if (k === "SECRETARIO") exp.secretario = formatoAutoridad(v);
    if (k === "INTEGRANTE") exp.integrante = formatoAutoridad(v);
    if (k === "PRESIDENTE_ETAPA_02" || k === "PRESIDENTE_E2") exp.presidenteE2 = formatoAutoridad(v);
    if (k === "SECRETARIO_ETAPA_02" || k === "SECRETARIO_E2") exp.secretarioE2 = formatoAutoridad(v);
    if (k === "SUPLENTE_ETAPA_02" || k === "SUPLENTE_E2" || k === "SUPLENTE") exp.suplenteE2 = formatoAutoridad(v);
    if (k === "DECANAL" || k === "RESOLUCION_DECANAL") exp.decanal = v;

    // Expediente - Sustentación y Fechas
    if (k === "LUGAR_SUSTENTACION" || k === "LUGAR_SUSTENTACIÓN") exp.lugarSustentacion = v;
    if (k === "HORA" || k === "HORAS_DE_LA_SUSTENTACION" || k === "HORA_SUSTENTACION") {
      exp.horaSustentacion = horaLimpia(v) || v;
    }
    if (k === "FECHA_SUSTENTACION" || (k === "FECHA" && !exp.fechaSustentacion)) {
      const iso = fechaIso(v);
      if (iso) exp.fechaSustentacion = iso;
    }
    if (k === "FECHA_APERTURA") {
      const iso = fechaIso(v);
      if (iso) exp.fechaApertura = iso;
    }
    if (k === "FECHA_PRESENTACION") {
      const iso = fechaIso(v);
      if (iso) exp.fechaPresentacion = iso;
    }

    // Participante 1
    if (k === "DIRECCION" || k === "DIRECCIÓN" || k === "DIRECCION_1" || k === "DIRECCION_01") p1.direccion = v;
    if (k === "TELEFONO" || k === "TELÉFONO" || k === "TELEFONO_1" || k === "TELEFONO_01") p1.telefono = v;
    if (k === "CIUDAD" || k === "CIUDAD_1" || k === "CIUDAD_01") p1.ciudad = v;
    if (k === "NACIONALIDAD" || k === "NACIONALIDAD_1" || k === "NACIONALIDAD_01") p1.nacionalidad = v;
    if (k === "CUI" || k === "CUI_1" || k === "CUI_01") p1.cui = v;
    if (k === "CORREO" || k === "CORREO_1" || k === "CORREO_01" || k === "EMAIL") p1.email = v.toLowerCase();

    // Participante 2
    if (k === "DIRECCION02" || k === "DIRECCION_2" || k === "DIRECCION_02" || k === "DIRECCIÓN02") p2.direccion = v;
    if (k === "TELEFONO02" || k === "TELEFONO_2" || k === "TELEFONO_02" || k === "TELÉFONO02") p2.telefono = v;
    if (k === "CIUDAD02" || k === "CIUDAD_2" || k === "CIUDAD_02") p2.ciudad = v;
    if (k === "NACIONALIDAD02" || k === "NACIONALIDAD_2" || k === "NACIONALIDAD_02") p2.nacionalidad = v;
    if (k === "CUI02" || k === "CUI_2" || k === "CUI_02") p2.cui = v;
    if (k === "CORREO02" || k === "CORREO_2" || k === "CORREO_02" || k === "EMAIL02") p2.email = v.toLowerCase();
  }

  return { expediente: exp, participante1: p1, participante2: p2 };
}

/**
 * "INSERTAR DATOS EN DOCUMENTOS" (HU-0016/0017/0018/0020/0030, legacy
 * `insertarDatosEnDocumento`): genera los formatos de la etapa con los datos
 * vigentes del expediente. Los campos sin dato quedan resaltados y se
 * informan como pendientes (semáforo amarillo de la tarjeta documental).
 */
export class GenerarDocumentosUseCase {
  constructor(
    private readonly storage: AlmacenamientoPort = new LocalStorageService(),
    private readonly renderer: (
      doc: DocumentoRenderizado,
      meta: MetaPdf,
    ) => Promise<Uint8Array> = renderizarPdf,
  ) {}

  async execute(
    expedienteId: string,
    etapa: EtapaPlantilla,
    actor: Actor,
    ahoraUopciones?:
      | Date
      | { tipo?: string | undefined; overrides?: Record<string, string> | undefined }
      | undefined,
    opciones?:
      | { tipo?: string | undefined; overrides?: Record<string, string> | undefined }
      | undefined,
  ): Promise<Result<{ generados: FormatoGenerado[] }, DomainError>> {
    const ahora = ahoraUopciones instanceof Date ? ahoraUopciones : new Date();
    const opts = ahoraUopciones instanceof Date ? opciones : ahoraUopciones;
    const detalle = await getDetalleById(db, expedienteId, ahora);
    if (!detalle) return fail(new DomainError("NO_ENCONTRADO", "Expediente no encontrado"));
    if (detalle.estado === "ANULADO") {
      return fail(new DomainError("TRANSICION_INVALIDA", "El expediente está anulado"));
    }
    if (etapa === "E6" && !ESTADOS_E6.has(detalle.estado)) {
      return fail(
        new DomainError(
          "TRANSICION_INVALIDA",
          `El informe para Secretaría se emite con el expediente en aprobación institucional (actual: ${detalle.estado})`,
        ),
      );
    }
    const sust = await db
      .select({
        fecha: sustentaciones.fecha,
        hora: sustentaciones.hora,
        lugar: sustentaciones.lugar,
        actaVeredicto: sustentaciones.actaVeredicto,
      })
      .from(sustentaciones)
      .where(eq(sustentaciones.expedienteId, expedienteId))
      .limit(1);
    const designados = await db
      .select({
        rol: juradosExpediente.rol,
        grado: jurados.grado,
        nombres: jurados.nombres,
        apellidos: jurados.apellidos,
      })
      .from(juradosExpediente)
      .innerJoin(jurados, eq(jurados.id, juradosExpediente.juradoId))
      .where(
        and(
          eq(juradosExpediente.expedienteId, expedienteId),
          eq(juradosExpediente.instancia, "JURADO"),
        ),
      );
    const vals = await db
      .select({
        instancia: validacionesInstitucionales.instancia,
        porcentaje: validacionesInstitucionales.porcentaje,
        detalle: validacionesInstitucionales.detalle,
      })
      .from(validacionesInstitucionales)
      .where(eq(validacionesInstitucionales.expedienteId, expedienteId));
    const oti = vals.find((v) => v.instancia === "OTI_SIMILITUD");
    const repositorio = vals.find((v) => v.instancia === "REPOSITORIO");
    const datosBase = construirDatosDocumento(
      expedienteParaDocumentos(detalle, sust[0] ?? null, {
        jurado: designados.map((j) => ({
          rol: j.rol,
          nombre: [j.grado, j.nombres, j.apellidos].filter(Boolean).join(" "),
        })),
        validaciones: {
          similitud: oti?.porcentaje ?? null,
          urlRepositorio: urlDeDetalle(repositorio?.detalle ?? null),
        },
      }),
      ahora,
    );
    const overridesNormalizados: Record<string, string> = {};
    if (opts?.overrides) {
      for (const [k, v] of Object.entries(opts.overrides)) {
        if (!v || typeof v !== "string") continue;
        const clave = k.trim().toUpperCase();
        if (esEtiquetaFecha(clave)) {
          overridesNormalizados[clave] = fechaLarga(v);
        } else if (esEtiquetaHora(clave)) {
          const hora = horaLimpia(v) || v.trim();
          overridesNormalizados[clave] = hora;
          if (clave === "HORA") overridesNormalizados["HORAS DE LA SUSTENTACION"] = hora;
          if (clave === "HORAS DE LA SUSTENTACION") overridesNormalizados.HORA = hora;
        } else {
          overridesNormalizados[clave] = v.trim();
        }
      }
    }
    const datos = { ...datosBase, ...overridesNormalizados };
    const numTesistas = detalle.participante2 ? 2 : 1;
    let plantillasEtapa = PLANTILLAS.filter((p) => p.etapa === etapa);

    if (numTesistas === 1) {
      plantillasEtapa = plantillasEtapa.filter(
        (p) => !p.tipo.endsWith("_P1") && !p.tipo.endsWith("_P2"),
      );
    } else {
      plantillasEtapa = plantillasEtapa.filter(
        (p) => p.tipo !== "ANEXO_01_DJ" && p.tipo !== "ANEXO_02_DJ",
      );
    }

    const plantillas = opts?.tipo
      ? opts.tipo === "ANEXO_01_DJ" && numTesistas === 2
        ? plantillasEtapa.filter((p) => p.tipo.startsWith("ANEXO_01_DJ_P"))
        : opts.tipo === "ANEXO_02_DJ" && numTesistas === 2
          ? plantillasEtapa.filter((p) => p.tipo.startsWith("ANEXO_02_DJ_P"))
          : plantillasEtapa.filter((p) => p.tipo === opts.tipo)
      : plantillasEtapa;

    if (plantillas.length === 0) {
      return fail(
        new DomainError(
          "NO_ENCONTRADO",
          `No se encontraron plantillas para la etapa ${etapa}${opts?.tipo ? ` y tipo ${opts.tipo}` : ""}`,
        ),
      );
    }

    // Render fuera de la transacción (CPU); la escritura va en un COMMIT.
    const renderizados = await Promise.all(
      plantillas.map(async (p) => {
        const plantillaDocx = obtenerPlantillaDocx(p.tipo, p.etapa, numTesistas);
        let bytesDocx: Buffer | null = null;
        let pendientesDocx: string[] = [];
        if (plantillaDocx) {
          const res = procesarDocxBuffer(plantillaDocx, datos);
          bytesDocx = res.buffer;
          pendientesDocx = res.pendientes;
        }

        const doc = renderizarPlantilla(p, datos);
        const bytesPdf = await this.renderer(doc, {
          codigo: detalle.codigo,
          versionPlantilla: VERSION_PLANTILLAS,
          generadoEn: ahora,
        });

        return {
          plantilla: p,
          bytesDocx,
          bytesPdf: Buffer.from(bytesPdf),
          pendientes: plantillaDocx ? pendientesDocx : [...doc.pendientes],
        };
      }),
    );

    const uow = new DrizzleUnitOfWork(db);
    const r = await uow.run(async (tx) => {
      if (opts?.overrides) {
        const cambios = extraerCambiosExpedienteYUsuarios(opts.overrides);
        if (Object.keys(cambios.expediente).length > 0) {
          await tx
            .update(expedientes)
            .set({ ...cambios.expediente, updatedAt: ahora })
            .where(eq(expedientes.id, expedienteId));
        }
        if (Object.keys(cambios.participante1).length > 0 && detalle.participante1?.id) {
          await tx
            .update(usuarios)
            .set(cambios.participante1)
            .where(eq(usuarios.id, detalle.participante1.id));
        }
        if (Object.keys(cambios.participante2).length > 0 && detalle.participante2?.id) {
          await tx
            .update(usuarios)
            .set(cambios.participante2)
            .where(eq(usuarios.id, detalle.participante2.id));
        }
      }

      const generados: FormatoGenerado[] = [];
      for (const { plantilla, bytesDocx, bytesPdf, pendientes } of renderizados) {
        const previo = await tx
          .select({
            id: documentosGenerados.id,
            version: documentosGenerados.version,
            ruta: documentosGenerados.ruta,
          })
          .from(documentosGenerados)
          .where(
            and(
              eq(documentosGenerados.expedienteId, expedienteId),
              eq(documentosGenerados.tipo, plantilla.tipo),
            ),
          )
          .limit(1);
        const version = (previo[0]?.version ?? 0) + 1;

        // 1. Guardar formato editable en documentos_generados
        const bytesGenerado = bytesDocx ?? bytesPdf;
        const extGenerado = bytesDocx ? "docx" : "pdf";
        if (previo[0]?.ruta) {
          await this.storage.delete?.(previo[0].ruta);
        }
        const { ruta, sha256 } = await this.storage.save(
          expedienteId,
          `${plantilla.tipo}_v${version}.${extGenerado}`,
          bytesGenerado,
          "generados",
        );
        const valores = {
          etapa: plantilla.etapa,
          ruta,
          sha256,
          version,
          versionPlantilla: VERSION_PLANTILLAS,
          pendientes,
          archivoContenido: bytesGenerado,
          tamanoBytes: bytesGenerado.length,
          createdAt: ahora,
        };
        let id: string;
        if (previo[0]) {
          await tx
            .update(documentosGenerados)
            .set(valores)
            .where(eq(documentosGenerados.id, previo[0].id));
          id = previo[0].id;
        } else {
          const ins = await tx
            .insert(documentosGenerados)
            .values({ expedienteId, tipo: plantilla.tipo, ...valores })
            .returning({ id: documentosGenerados.id });
          if (!ins[0]) return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo guardar"));
          id = ins[0].id;
        }

        // 2. Auto-subir y adjuntar el PDF oficial generado directamente al checklist
        const docsPrevios = await tx
          .select({ id: documentos.id, ruta: documentos.ruta })
          .from(documentos)
          .where(
            and(eq(documentos.expedienteId, expedienteId), eq(documentos.tipo, plantilla.tipo)),
          );

        for (const dp of docsPrevios) {
          if (dp.ruta) {
            await this.storage.delete?.(dp.ruta);
          }
        }
        if (docsPrevios.length > 0) {
          await tx
            .delete(documentos)
            .where(
              and(eq(documentos.expedienteId, expedienteId), eq(documentos.tipo, plantilla.tipo)),
            );
        }

        const pdfGuardado = await this.storage.save(
          expedienteId,
          `${plantilla.tipo}_v${version}.pdf`,
          bytesPdf,
        );

        await tx.insert(documentos).values({
          expedienteId,
          tipo: plantilla.tipo,
          etapa: plantilla.etapa,
          ruta: pdfGuardado.ruta,
          version,
          sha256: pdfGuardado.sha256,
          estado: "CARGADO",
          origen: "SISTEMA",
          driveSyncEstado: process.env.GOOGLE_DRIVE_ENABLED === "true" ? "PENDIENTE" : "NO_APLICA",
          archivoContenido: bytesPdf,
          tamanoBytes: bytesPdf.length,
          createdAt: ahora,
        });

        generados.push({
          id,
          tipo: plantilla.tipo,
          nombre: plantilla.nombre,
          version,
          pendientes,
        });
      }
      await tx
        .update(expedientes)
        .set({ updatedAt: ahora })
        .where(eq(expedientes.id, expedienteId));

      const conPendientes = generados.filter((g) => g.pendientes.length > 0).length;
      await appendAuditoria(tx, {
        expedienteId,
        actorId: actor.id,
        actorDni: actor.dni,
        estadoAnterior: detalle.estado,
        estadoNuevo: detalle.estado,
        detalle: `Inserción de datos en documentos ${etapa}: ${generados.length} formato(s), ${conPendientes} con campos pendientes`,
      });
      return ok({ generados });
    });

    if (r.ok && process.env.GOOGLE_DRIVE_ENABLED === "true") {
      try {
        const { getBoss } = await import("../../../../infra/jobs/pg-boss.client.js");
        const { COLAS } = await import("../../../../infra/jobs/colas.js");
        const boss = await getBoss();
        const subcarpeta = resolverSubcarpetaEtapa(etapa);

        for (const gen of r.value.generados) {
          const plantillaDocx = obtenerPlantillaDocx(gen.tipo, etapa, numTesistas);
          const ext = plantillaDocx ? "docx" : "pdf";
          const nombreArchivo = resolverNombreArchivo(gen.tipo, numTesistas, ext);
          await boss.send(
            COLAS.SYNC_DRIVE_INSTITUCIONAL,
            {
              documentoGeneradoId: gen.id,
              expedienteId,
              subcarpeta,
              nombreArchivo,
            },
            { retryLimit: 5, retryDelay: 10, retryBackoff: true },
          );
        }
      } catch (err) {
        console.error("[GenerarDocumentosUseCase] no se pudo encolar sync drive", err);
      }
    }

    return r;
  }
}
