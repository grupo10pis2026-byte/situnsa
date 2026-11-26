import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CrearSolicitudPayload } from "@pis/contracts";
import { db, solicitudDocumentos, solicitudes, solicitudParticipantes } from "@pis/db";
import { DomainError, esProgramaOficial, fail, ok, type Result } from "@pis/domain";
import { sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import { nombreEnDisco, sha256Hex, validarArchivoSolicitud } from "../../archivos-solicitud.js";
import { correoSolicitudRecibida } from "../../correos-solicitud.js";
import { appendHistorialSolicitud, siguienteCodigoSol } from "../../solicitudes.repository.js";

export interface ArchivoSolicitud {
  tipo: string;
  participanteOrden: number | null;
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface SolicitudCreada {
  id: string;
  codigo: string;
}

/**
 * RF-02xx[001] — Crear Solicitud Pública:
 * - Valida programa oficial.
 * - Valida el formato real (magic bytes): fotografía JPG, resto PDF.
 * - Genera código correlativo SOL-AAAA-NNNN con candado advisory.
 * - Guarda archivos en DOCS_VOLUME_PATH/solicitudes/SOL-AAAA-NNNN/.
 * - Registra solicitud, participantes, documentos e historial en un solo UoW.
 * - Encola correo de confirmación post-commit.
 */
export class CrearSolicitudUseCase {
  async execute(
    input: CrearSolicitudPayload,
    archivos: ArchivoSolicitud[],
    meta: { ip?: string; userAgent?: string },
  ): Promise<Result<SolicitudCreada, DomainError>> {
    // Validaciones de dominio previas a la TX
    if (!esProgramaOficial(input.programa)) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          "Programa inválido: selecciona uno de los 13 programas oficiales",
        ),
      );
    }

    // Formato real por magic bytes: fotografía JPG, el resto PDF (el MIME
    // declarado por el navegador no se usa).
    const mimes = new Map<ArchivoSolicitud, string>();
    for (const archivo of archivos) {
      const v = validarArchivoSolicitud(archivo.tipo, archivo.filename, archivo.bytes);
      if (!v.ok) return fail(new DomainError("VALIDACION_FALLIDA", v.mensaje));
      mimes.set(archivo, v.mime);
    }

    // Validar correo institucional obligatorio (@unsa.edu.pe)
    if (!input.participante1.email.trim().toLowerCase().endsWith("@unsa.edu.pe")) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          "El correo del Participante 1 debe ser institucional (@unsa.edu.pe)",
        ),
      );
    }
    if (
      input.participante2 &&
      !input.participante2.email.trim().toLowerCase().endsWith("@unsa.edu.pe")
    ) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          "El correo del Participante 2 debe ser institucional (@unsa.edu.pe)",
        ),
      );
    }

    // Validar documentos mínimos obligatorios según modalidad (Vía Regular)
    const tiposPresentes = new Set(
      archivos.map((a) => {
        const t = a.tipo.toUpperCase();
        if (t === "FUT" || t === "EXPEDIENTE_17") return "ANEXO_17";
        if (t === "FOTO") return "FOTO_ESTUDIANTE";
        if (t === "FOTO_ESTUDIANTE_2") return "FOTO_PARTICIPANTE_2";
        if (t === "ARTICULO") return "ARTICULO_INDEXADO";
        return t;
      }),
    );

    const docsBase = ["ANEXO_17", "ANEXO_18", "PAGO_TRAMITE", "FOTO_ESTUDIANTE"];
    if (input.cantidadTesistas === 2) {
      docsBase.push("FOTO_PARTICIPANTE_2");
    }

    const docsExigidos: string[] = [...docsBase];
    if (input.modalidad === "TESIS") {
      docsExigidos.push("PLAN_TESIS");
    } else if (input.modalidad === "TRABAJO_ACADEMICO") {
      docsExigidos.push("PLAN_TRABAJO_ACADEMICO", "CONSTANCIA_TRABAJO", "CERTIFICADO_SUNARP");
    } else if (input.modalidad === "ARTICULO") {
      docsExigidos.push("ARTICULO_INDEXADO");
    }

    const faltantes = docsExigidos.filter((tipo) => !tiposPresentes.has(tipo));
    if (faltantes.length > 0) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          `Faltan documentos obligatorios para la modalidad ${input.modalidad}: ${faltantes.join(", ")}`,
        ),
      );
    }

    const anio = new Date().getFullYear();
    const baseDir = resolve(process.env.DOCS_VOLUME_PATH ?? "./var/data/titulacion-docs");

    const uow = new DrizzleUnitOfWork(db);
    const r = await uow.run(async (tx) => {
      // Candado transaccional para código correlativo SOL
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`solicitudes:codigo:${anio}`}))`,
      );
      const codigo = await siguienteCodigoSol(anio, tx);

      // Guardar archivos en disco (dentro de la TX para que un fallo de FS revierta)
      const dirSolicitud = join(baseDir, "solicitudes", codigo);
      await mkdir(dirSolicitud, { recursive: true });

      const docsInsert: Array<{
        solicitudId: string;
        tipo: string;
        participanteOrden: number | null;
        ruta: string;
        nombreOriginal: string;
        mimeType: string;
        pesoBytes: number;
        sha256: string;
      }> = [];

      for (const archivo of archivos) {
        const ruta = join(dirSolicitud, nombreEnDisco(archivo.tipo, archivo.filename));
        await writeFile(ruta, archivo.bytes);
        docsInsert.push({
          solicitudId: "", // se completa después del insert
          tipo: archivo.tipo,
          participanteOrden: archivo.participanteOrden,
          ruta,
          nombreOriginal: archivo.filename,
          mimeType: mimes.get(archivo) ?? "application/pdf",
          pesoBytes: archivo.bytes.length,
          sha256: sha256Hex(archivo.bytes),
        });
      }

      // Insertar solicitud (exclusiva Vía Regular)
      const [solRow] = await tx
        .insert(solicitudes)
        .values({
          codigo,
          via: "REGULAR",
          modalidad: input.modalidad,
          programa: input.programa,
          titulo: input.titulo.trim(),
          anioEgreso: input.anioEgreso,
          cantidadTesistas: input.cantidadTesistas,
          estado: "NUEVA",
          ipOrigen: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        })
        .returning({ id: solicitudes.id });

      if (!solRow) {
        return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo registrar la solicitud"));
      }

      // Insertar participantes
      await tx.insert(solicitudParticipantes).values({
        solicitudId: solRow.id,
        orden: 1,
        nombres: input.participante1.nombres.trim(),
        apellidos: input.participante1.apellidos.trim(),
        dni: input.participante1.dni,
        cui: input.participante1.cui?.trim() || null,
        email: input.participante1.email.trim().toLowerCase(),
        telefono: input.participante1.telefono?.trim() || null,
        nacionalidad: input.participante1.nacionalidad ?? "Peruana",
        ciudad: input.participante1.ciudad?.trim() || null,
        direccion: input.participante1.direccion?.trim() || null,
        departamento: input.participante1.departamento?.trim() || null,
        provincia: input.participante1.provincia?.trim() || null,
        distrito: null,
      });

      if (input.participante2) {
        await tx.insert(solicitudParticipantes).values({
          solicitudId: solRow.id,
          orden: 2,
          nombres: input.participante2.nombres.trim(),
          apellidos: input.participante2.apellidos.trim(),
          dni: input.participante2.dni,
          cui: input.participante2.cui?.trim() || null,
          email: input.participante2.email.trim().toLowerCase(),
          telefono: input.participante2.telefono?.trim() || null,
          nacionalidad: input.participante2.nacionalidad ?? "Peruana",
          ciudad: input.participante2.ciudad?.trim() || null,
          direccion: input.participante2.direccion?.trim() || null,
          departamento: input.participante2.departamento?.trim() || null,
          provincia: input.participante2.provincia?.trim() || null,
          distrito: null,
        });
      }

      // Insertar documentos
      if (docsInsert.length > 0) {
        await tx
          .insert(solicitudDocumentos)
          .values(docsInsert.map((d) => ({ ...d, solicitudId: solRow.id })));
      }

      // Historial
      await appendHistorialSolicitud(tx, {
        solicitudId: solRow.id,
        accion: "RECIBIDA",
        actorId: null,
        actorDni: "portal-publico",
        ip: meta.ip ?? null,
        detalle: `Solicitud ${codigo} recibida desde la Mesa de Partes Virtual (${input.modalidad})`,
        metadata: { via: "REGULAR", modalidad: input.modalidad, cantidadArchivos: archivos.length },
      });

      return ok({ id: solRow.id, codigo });
    });

    // Post-commit: correo de confirmación a los tesistas
    if (r.ok) {
      const destinatarios = [input.participante1.email.trim().toLowerCase()];
      if (input.participante2?.email) {
        destinatarios.push(input.participante2.email.trim().toLowerCase());
      }
      await enqueueCorreo(
        correoSolicitudRecibida({
          codigo: r.value.codigo,
          modalidad: input.modalidad,
          para: destinatarios,
        }),
      );
    }

    return r;
  }
}
