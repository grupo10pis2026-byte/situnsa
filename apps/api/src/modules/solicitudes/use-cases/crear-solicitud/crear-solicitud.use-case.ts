import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CrearSolicitudPayload } from "@pis/contracts";
import { db, solicitudDocumentos, solicitudes, solicitudParticipantes } from "@pis/db";
import { DomainError, esProgramaOficial, fail, ok, type Result } from "@pis/domain";
import { sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { enqueueCorreo } from "../../../../infra/jobs/colas.js";
import { appendHistorialSolicitud, siguienteCodigoSol } from "../../solicitudes.repository.js";

/** Magic bytes de PDF: primeros 5 bytes deben ser `%PDF-` */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

function validarMagicBytesPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === PDF_MAGIC[0] &&
    bytes[1] === PDF_MAGIC[1] &&
    bytes[2] === PDF_MAGIC[2] &&
    bytes[3] === PDF_MAGIC[3] &&
    bytes[4] === PDF_MAGIC[4]
  );
}

function validarMagicBytesFoto(bytes: Uint8Array): boolean {
  if (validarMagicBytesPdf(bytes)) return true;
  // JPEG: 0xFF, 0xD8, 0xFF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  // PNG: 0x89, 0x50, 0x4E, 0x47
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }
  return false;
}

function esTipoFoto(tipo: string): boolean {
  const t = tipo.toUpperCase();
  return t === "FOTO" || t.startsWith("FOTO_") || t.includes("FOTO");
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

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
 * - Valida Magic Bytes PDF de todos los archivos.
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

    // Validar Magic Bytes de los archivos (PDFs o imágenes para fotos)
    for (const archivo of archivos) {
      if (esTipoFoto(archivo.tipo)) {
        if (!validarMagicBytesFoto(archivo.bytes)) {
          return fail(
            new DomainError(
              "VALIDACION_FALLIDA",
              `El archivo de fotografía "${archivo.filename}" debe ser formato PDF, JPG o PNG válido`,
            ),
          );
        }
      } else if (!validarMagicBytesPdf(archivo.bytes)) {
        return fail(
          new DomainError(
            "VALIDACION_FALLIDA",
            `El archivo "${archivo.filename}" no es un PDF válido`,
          ),
        );
      }
    }

    // Validar correo institucional obligatorio (@unsa.edu.pe)
    if (!input.participante1.email.trim().toLowerCase().endsWith("@unsa.edu.pe")) {
      return fail(
        new DomainError(
          "VALIDACION_FALLIDA",
          "El correo del Tesista 01 debe ser institucional (@unsa.edu.pe)",
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
          "El correo del Tesista 02 debe ser institucional (@unsa.edu.pe)",
        ),
      );
    }

    // Validar documentos mínimos obligatorios según modalidad (Vía Regular)
    const tiposPresentes = new Set(
      archivos.map((a) => {
        const t = a.tipo.toUpperCase();
        if (t === "FUT" || t === "EXPEDIENTE_17") return "ANEXO_17";
        return t;
      }),
    );

    let docsExigidos: string[] = [];
    if (input.modalidad === "TESIS") {
      docsExigidos = ["ANEXO_17", "ANEXO_18", "PLAN_TESIS", "PAGO_TRAMITE"];
    } else if (input.modalidad === "TRABAJO_ACADEMICO") {
      docsExigidos = [
        "ANEXO_17",
        "ANEXO_18",
        "PLAN_TRABAJO_ACADEMICO",
        "CONSTANCIA_TRABAJO",
        "CERTIFICADO_SUNARP",
        "PAGO_TRAMITE",
      ];
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
        const baseNombre = archivo.filename.split(/[\\/]/).pop() ?? "documento.pdf";
        const nombreSeguro = baseNombre.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
        const ruta = join(dirSolicitud, nombreSeguro);
        await writeFile(ruta, archivo.bytes);
        docsInsert.push({
          solicitudId: "", // se completa después del insert
          tipo: archivo.tipo,
          participanteOrden: archivo.participanteOrden,
          ruta,
          nombreOriginal: archivo.filename,
          mimeType: archivo.mimeType,
          pesoBytes: archivo.bytes.length,
          sha256: sha256Hex(archivo.bytes),
        });
      }

      // Insertar solicitud
      const [solRow] = await tx
        .insert(solicitudes)
        .values({
          codigo,
          via: input.via,
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
        distrito: input.participante1.distrito?.trim() || null,
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
          distrito: input.participante2.distrito?.trim() || null,
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
        detalle: `Solicitud ${codigo} recibida desde la Mesa de Partes Virtual (${input.via})`,
        metadata: { via: input.via, cantidadArchivos: archivos.length },
      });

      return ok({ id: solRow.id, codigo });
    });

    // Post-commit: correo de confirmación a los tesistas
    if (r.ok) {
      const destinatarios = [input.participante1.email.trim().toLowerCase()];
      if (input.participante2?.email) {
        destinatarios.push(input.participante2.email.trim().toLowerCase());
      }
      await enqueueCorreo({
        asunto: `Solicitud ${r.value.codigo} recibida`,
        titulo: "Recibimos tu solicitud de titulación",
        texto:
          `Tu solicitud ha sido registrada con el código <strong>${r.value.codigo}</strong>. ` +
          "El área de titulación revisará tus documentos y te notificará al correo con el resultado. " +
          "Si hay observaciones, recibirás un enlace para subsanarlas.",
        para: destinatarios,
      });
    }

    return r;
  }
}
