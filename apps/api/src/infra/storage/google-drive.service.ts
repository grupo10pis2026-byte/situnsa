import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { drive, type drive_v3 } from "@googleapis/drive";
import { GoogleAuth, OAuth2Client } from "google-auth-library";

export interface SubirArchivoDriveParams {
  rutaLocal: string;
  nombreArchivo: string;
  carpetaId: string;
  mimeType?: string;
}

export interface ResultadoSubidaDrive {
  fileId: string;
  webViewLink: string;
}

export function formatearNombreCarpetaExpediente(codigo: string, tesistas?: string[]): string {
  const cod = codigo.toUpperCase().trim();
  if (!tesistas || tesistas.length === 0) {
    return cod;
  }
  const nombres = tesistas.map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (nombres.length === 0) {
    return cod;
  }
  return `${cod} - ${nombres.join(" & ")}`;
}

export class GoogleDriveStorageService {
  private driveClient: drive_v3.Drive | null = null;
  private readonly sharedDriveId: string;
  private readonly keyFilePath: string;

  constructor() {
    this.sharedDriveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID ?? "";
    const rawPath =
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ?? "./secrets/google-service-account.json";
    this.keyFilePath = this.resolverRutaClave(rawPath);
  }

  private resolverRutaClave(ruta: string): string {
    const candidatas = [
      ruta,
      resolve(process.cwd(), ruta),
      resolve(process.cwd(), "..", ruta),
      resolve("/home/miguel/Projects/SITUNSA/situnsa", ruta),
      resolve("/home/miguel/Projects/SITUNSA", ruta),
      "/home/miguel/Projects/SITUNSA/secrets/google-service-account.json",
      "/home/miguel/Projects/SITUNSA/situnsa/secrets/google-service-account.json",
      "/home/miguel/Projects/SITUNSA/situnsa/apps/api/secrets/google-service-account.json",
    ];
    for (const c of candidatas) {
      if (existsSync(c)) return c;
    }
    return ruta;
  }

  private obtenerCliente(): drive_v3.Drive {
    if (this.driveClient) return this.driveClient;

    // Si se configuró token OAuth2 de usuario (Drive Personal @gmail.com)
    if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID) {
      const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
      );
      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      });

      this.driveClient = drive({
        version: "v3",
        auth: oauth2Client,
      });
      return this.driveClient;
    }

    // Por defecto: Service Account (para Unidades Compartidas / Google Workspace)
    const auth = new GoogleAuth({
      keyFile: this.keyFilePath,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    this.driveClient = drive({
      version: "v3",
      auth: auth as unknown as NonNullable<drive_v3.Options["auth"]>,
    });
    return this.driveClient;
  }

  /**
   * Obtiene o crea la carpeta del expediente dentro del Shared Drive institucional o Drive personal.
   * La carpeta se nombra: `[CODIGO] - [TESISTA 1] (& [TESISTA 2])`.
   */
  async obtenerOCrearCarpetaExpediente(
    codigoExpediente: string,
    cachedFolderId?: string | null,
    tesistas?: string[],
  ): Promise<string> {
    const driveApi = this.obtenerCliente();

    // 1. Si ya tenemos el ID en caché, verificar existencia directa
    if (cachedFolderId) {
      try {
        await driveApi.files.get({
          fileId: cachedFolderId,
          supportsAllDrives: true,
          fields: "id, trashed",
        });
        return cachedFolderId;
      } catch {
        // Si falló (ej. carpeta borrada manualmente), continuar y recrearla
      }
    }

    const folderName = formatearNombreCarpetaExpediente(codigoExpediente, tesistas);

    // 2. Buscar si existe en la carpeta raíz configurada (funciona en Drive personal y Shared Drive)
    const res = await driveApi.files.list({
      q: `'${this.sharedDriveId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id, name)",
    });

    if (res.data.files && res.data.files.length > 0 && res.data.files[0]?.id) {
      return res.data.files[0].id;
    }

    // 3. Crear la carpeta si no existe
    const folderMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [this.sharedDriveId],
    };

    const nuevaCarpeta = await driveApi.files.create({
      requestBody: folderMetadata,
      supportsAllDrives: true,
      fields: "id",
    });

    if (!nuevaCarpeta.data.id) {
      throw new Error(
        `No se pudo obtener el ID de la carpeta creada para el expediente ${codigoExpediente}`,
      );
    }

    return nuevaCarpeta.data.id;
  }

  /**
   * Obtiene o crea una subcarpeta de etapa (ej. "01. Plan de Tesis") dentro de la carpeta del expediente.
   */
  async obtenerOCrearSubcarpeta(carpetaPadreId: string, nombreSubcarpeta: string): Promise<string> {
    const driveApi = this.obtenerCliente();
    const res = await driveApi.files.list({
      q: `'${carpetaPadreId}' in parents and name = '${nombreSubcarpeta}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id, name)",
    });

    if (res.data.files && res.data.files.length > 0 && res.data.files[0]?.id) {
      return res.data.files[0].id;
    }

    const nueva = await driveApi.files.create({
      requestBody: {
        name: nombreSubcarpeta,
        mimeType: "application/vnd.google-apps.folder",
        parents: [carpetaPadreId],
      },
      supportsAllDrives: true,
      fields: "id",
    });

    if (!nueva.data.id) {
      throw new Error(`No se pudo crear la subcarpeta ${nombreSubcarpeta}`);
    }

    return nueva.data.id;
  }

  /**
   * Sube o actualiza un archivo mediante Node Stream (0 MB de consumo de RAM).
   * Si ya existe un archivo con el mismo nombre en la carpeta de destino, se actualiza in-situ.
   */
  async subirArchivo(params: SubirArchivoDriveParams): Promise<ResultadoSubidaDrive> {
    const driveApi = this.obtenerCliente();

    // 1. Verificar si ya existe un archivo con el mismo nombre en la carpeta para actualizarlo in-situ
    const existentes = await driveApi.files.list({
      q: `'${params.carpetaId}' in parents and name = '${params.nombreArchivo}' and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id, webViewLink)",
    });

    const esDocx =
      params.nombreArchivo.toLowerCase().endsWith(".docx") ||
      params.rutaLocal.toLowerCase().endsWith(".docx");
    const media = {
      mimeType:
        params.mimeType ??
        (esDocx
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf"),
      body: createReadStream(params.rutaLocal),
    };

    if (existentes.data.files && existentes.data.files.length > 0 && existentes.data.files[0]?.id) {
      const fileId = existentes.data.files[0].id;
      const actualizacion = await driveApi.files.update({
        fileId,
        media,
        supportsAllDrives: true,
        fields: "id, webViewLink",
      });

      return {
        fileId,
        webViewLink:
          actualizacion.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
      };
    }

    // 2. Si no existe, crear el nuevo archivo
    const fileMetadata = {
      name: params.nombreArchivo,
      parents: [params.carpetaId],
    };

    const res = await driveApi.files.create({
      requestBody: fileMetadata,
      media,
      supportsAllDrives: true,
      fields: "id, webViewLink",
    });

    if (!res.data.id) {
      throw new Error(`Google Drive no retornó un ID para el archivo ${params.nombreArchivo}`);
    }

    return {
      fileId: res.data.id,
      webViewLink: res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view`,
    };
  }
}
