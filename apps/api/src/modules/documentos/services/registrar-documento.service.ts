import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db, documentos } from "@pis/db";
import { fail, ok, type Result } from "@pis/domain";
import { eq } from "drizzle-orm";
import type PgBoss from "pg-boss";
import { COLAS } from "../../../infra/jobs/colas.js";
import { getBoss } from "../../../infra/jobs/pg-boss.client.js";

export interface IngestaDocumentoInput {
  expedienteId: string;
  tipo: string;
  filenameOriginal: string;
  bytes: Uint8Array;
  origen: "WEB" | "CORREO" | "SISTEMA";
  origenMetadata?: string;
  actor: { id: string; dni: string };
  etapa?: string;
}

export interface DocumentoRegistradoOutput {
  id: string;
  rutaLocal: string;
  sha256: string;
  version: number;
}

export class RegistrarDocumentoService {
  constructor(private readonly boss?: PgBoss) {}

  async procesar(input: IngestaDocumentoInput): Promise<Result<DocumentoRegistradoOutput, string>> {
    // 1. Validación estricta de Magic Bytes (%PDF-)
    if (input.bytes.length < 5) {
      return fail("El archivo es demasiado pequeño o inválido.");
    }

    const header = String.fromCharCode(...input.bytes.slice(0, 5));
    if (!header.startsWith("%PDF-")) {
      return fail("El archivo no es un PDF válido (cabecera corrupta o formato incompatible).");
    }

    // 2. Cálculo del Hash Criptográfico SHA-256
    const hash = createHash("sha256").update(input.bytes).digest("hex");

    // 3. Determinar número de versión incremental
    const docsExistentes = await db
      .select({ version: documentos.version })
      .from(documentos)
      .where(eq(documentos.expedienteId, input.expedienteId));

    const proximaVersion = docsExistentes.length + 1;

    // 4. Persistir archivo en disco local (/var/data/titulacion-docs/)
    const dirBase =
      process.env.DOCS_STORAGE_PATH ?? process.env.DOCS_VOLUME_PATH ?? "./var/data/titulacion-docs";
    const dirExpediente = join(dirBase, input.expedienteId);
    await mkdir(dirExpediente, { recursive: true });

    const nombreArchivo = `${Date.now()}_v${proximaVersion}_${input.tipo}.pdf`;
    const rutaAbsoluta = join(dirExpediente, nombreArchivo);
    await writeFile(rutaAbsoluta, input.bytes);

    // 5. Inserción en PostgreSQL
    const [nuevoDoc] = await db
      .insert(documentos)
      .values({
        expedienteId: input.expedienteId,
        tipo: input.tipo,
        etapa: input.etapa ?? "E1",
        ruta: rutaAbsoluta,
        version: proximaVersion,
        sha256: hash,
        estado: "CARGADO",
        origen: input.origen,
        origenMetadata: input.origenMetadata,
        driveSyncEstado: process.env.GOOGLE_DRIVE_ENABLED === "true" ? "PENDIENTE" : "NO_APLICA",
      })
      .returning();

    if (!nuevoDoc) {
      return fail("Error al persistir el registro del documento en la base de datos.");
    }

    // 6. Encolar sincronización asíncrona en pg-boss
    if (process.env.GOOGLE_DRIVE_ENABLED === "true") {
      try {
        const bossClient = this.boss ?? (await getBoss());
        await bossClient.send(
          COLAS.SYNC_DRIVE_INSTITUCIONAL,
          {
            documentoId: nuevoDoc.id,
            expedienteId: input.expedienteId,
          },
          {
            retryLimit: 5,
            retryDelay: 30,
            retryBackoff: true,
          },
        );
      } catch (err) {
        console.error("[RegistrarDocumentoService] no se pudo encolar sync drive", err);
      }
    }

    return ok({
      id: nuevoDoc.id,
      rutaLocal: rutaAbsoluta,
      sha256: hash,
      version: proximaVersion,
    });
  }
}
