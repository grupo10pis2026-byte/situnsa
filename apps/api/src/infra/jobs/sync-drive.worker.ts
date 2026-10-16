import { db, documentos, documentosGenerados, expedientes, usuarios } from "@pis/db";
import { resolverNombreArchivo } from "@pis/domain";
import { eq, inArray } from "drizzle-orm";
import type PgBoss from "pg-boss";
import { GoogleDriveStorageService } from "../storage/google-drive.service.js";
import { COLAS } from "./colas.js";

export interface SyncDriveJobData {
  documentoId?: string;
  documentoGeneradoId?: string;
  expedienteId: string;
  subcarpeta?: string;
  nombreArchivo?: string;
}

export async function procesarSyncDrive(data: SyncDriveJobData): Promise<void> {
  const driveService = new GoogleDriveStorageService();
  const { documentoId, documentoGeneradoId, expedienteId, subcarpeta, nombreArchivo } = data;

  // 1. Consultar expediente
  const [exp] = await db
    .select()
    .from(expedientes)
    .where(eq(expedientes.id, expedienteId))
    .limit(1);

  if (!exp) {
    throw new Error(`Expediente ${expedienteId} no encontrado`);
  }

  // 2. Obtener nombres de tesistas para el nombrado de la carpeta institucional
  const tesistasIds = [exp.participante1Id, exp.participante2Id].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  let tesistasNombres: string[] = [];
  if (tesistasIds.length > 0) {
    const users = await db
      .select({ id: usuarios.id, nombres: usuarios.nombres, apellidos: usuarios.apellidos })
      .from(usuarios)
      .where(inArray(usuarios.id, tesistasIds));
    const porId = new Map(users.map((u) => [u.id, `${u.apellidos} ${u.nombres}`.trim()]));
    tesistasNombres = tesistasIds.map((id) => porId.get(id)).filter(Boolean) as string[];
  }

  // 3. Consultar archivo local y determinar nombre en Drive
  let rutaLocal: string;
  let nombreEnDrive: string;
  let docCargadoId: string | null = null;
  let docCargadoIntentos = 0;

  if (documentoGeneradoId) {
    const [docGen] = await db
      .select()
      .from(documentosGenerados)
      .where(eq(documentosGenerados.id, documentoGeneradoId))
      .limit(1);

    if (!docGen) {
      throw new Error(`Documento generado ${documentoGeneradoId} no encontrado`);
    }
    rutaLocal = docGen.ruta;
    const esDocx = docGen.ruta.endsWith(".docx") || docGen.archivoContenido !== null;
    const ext = esDocx ? "docx" : "pdf";
    nombreEnDrive =
      nombreArchivo ?? resolverNombreArchivo(docGen.tipo, tesistasNombres.length || 1, ext);
  } else if (documentoId) {
    const [doc] = await db.select().from(documentos).where(eq(documentos.id, documentoId)).limit(1);
    if (!doc) {
      throw new Error(`Documento ${documentoId} no encontrado`);
    }
    rutaLocal = doc.ruta;
    nombreEnDrive = nombreArchivo ?? `v${doc.version}_${doc.tipo}_${doc.id}.pdf`;
    docCargadoId = doc.id;
    docCargadoIntentos = doc.driveSyncIntentos;
  } else {
    throw new Error(
      "Debe indicarse documentoId o documentoGeneradoId para sincronización con Drive",
    );
  }

  try {
    // 4. Obtener o crear carpeta institucional raíz del expediente
    const folderId = await driveService.obtenerOCrearCarpetaExpediente(
      exp.codigo,
      exp.driveFolderId,
      tesistasNombres,
    );

    // Actualizar caché en expediente si cambió
    if (exp.driveFolderId !== folderId) {
      await db
        .update(expedientes)
        .set({
          driveFolderId: folderId,
          driveFolderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        })
        .where(eq(expedientes.id, exp.id));
    }

    // 5. Si tiene subcarpeta (ej. "01. Plan de Tesis"), obtener o crear la subcarpeta
    let carpetaDestinoId = folderId;
    if (subcarpeta) {
      carpetaDestinoId = await driveService.obtenerOCrearSubcarpeta(folderId, subcarpeta);
    }

    // 6. Subir o actualizar archivo mediante streaming (in-situ si ya existía con ese nombre)
    const resultado = await driveService.subirArchivo({
      rutaLocal,
      nombreArchivo: nombreEnDrive,
      carpetaId: carpetaDestinoId,
      mimeType: "application/pdf",
    });

    // 7. Si corresponde a un documento cargado por el tesista, actualizar su registro
    if (docCargadoId) {
      await db
        .update(documentos)
        .set({
          driveFileId: resultado.fileId,
          driveUrl: resultado.webViewLink,
          driveSyncEstado: "SINCRONIZADO",
          driveSyncedAt: new Date(),
          driveError: null,
        })
        .where(eq(documentos.id, docCargadoId));
    }
  } catch (error) {
    const mensajeError = error instanceof Error ? error.message : String(error);

    if (docCargadoId) {
      await db
        .update(documentos)
        .set({
          driveSyncEstado: "ERROR",
          driveSyncIntentos: docCargadoIntentos + 1,
          driveError: mensajeError,
        })
        .where(eq(documentos.id, docCargadoId));
    }

    throw error;
  }
}

export async function registrarWorkerSyncDrive(boss: PgBoss): Promise<void> {
  await boss.work<SyncDriveJobData>(COLAS.SYNC_DRIVE_INSTITUCIONAL, async (jobs) => {
    const lista = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of lista) {
      await procesarSyncDrive(job.data);
    }
  });
}
