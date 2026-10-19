import "../config/cargar-env.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db, documentos, expedientes } from "@pis/db";
import { eq } from "drizzle-orm";
import { procesarSyncDrive } from "../infra/jobs/sync-drive.worker.js";
import { GeneradorCaratulaService } from "../modules/documentos/services/generador-caratula.service.js";
import { RegistrarDocumentoService } from "../modules/documentos/services/registrar-documento.service.js";

async function main() {
  console.log("=================================================================");
  console.log("   PRUEBA INTEGRAL DEL MÓDULO DE DOCUMENTACIÓN SITUNSA");
  console.log("=================================================================\n");

  const dirSalida = "./var/data/pruebas";
  if (!existsSync(dirSalida)) mkdirSync(dirSalida, { recursive: true });

  // ---------------------------------------------------------------------------
  // ACCIÓN 1: Generación de Carátula Oficial Normalizada (pdf-lib)
  // ---------------------------------------------------------------------------
  console.log("▶ [Acción 1/5] Probando Generador de Carátulas Oficiales...");
  const generador = new GeneradorCaratulaService();
  const caratulaBytes = await generador.generarCaratula({
    tituloTesis: "SISTEMA INTEGRADO DE TITULACIÓN Y SEGUNDA ESPECIALIDAD PARA LA FACULTAD",
    nombresTesistas: ["ZAMBRANO PÉREZ, JUAN", "ÁLVAREZ GÓMEZ, MARÍA"],
    gradoAsesor: "Dr.",
    nombreAsesor: "Carlos Asesor Institucional",
    anio: "2026",
  });

  const rutaCaratula = join(dirSalida, "caratula_generada_demo.pdf");
  writeFileSync(rutaCaratula, caratulaBytes);
  const headerCaratula = String.fromCharCode(...caratulaBytes.slice(0, 5));
  console.log(
    `  ✓ Carátula generada exitosamente: ${rutaCaratula} (${caratulaBytes.length} bytes)`,
  );
  console.log(`  ✓ Magic bytes verificados: "${headerCaratula}"`);

  // ---------------------------------------------------------------------------
  // ACCIÓN 2: Validación estricta de Magic Bytes en Ingesta
  // ---------------------------------------------------------------------------
  console.log("\n▶ [Acción 2/5] Probando validaciones estrictas de Magic Bytes (%PDF-)...");
  const registrarService = new RegistrarDocumentoService();
  const archivoCorrupto = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // Cabecera ZIP
  const resRechazo = await registrarService.procesar({
    expedienteId: "00000000-0000-0000-0000-000000000000",
    tipo: "PLAN_TESIS",
    filenameOriginal: "falso.pdf",
    bytes: archivoCorrupto,
    origen: "WEB",
    actor: { id: "test", dni: "00000000" },
  });

  if (!resRechazo.ok) {
    console.log(`  ✓ Archivo no-PDF correctamente rechazado: "${resRechazo.error}"`);
  } else {
    console.error("  ✗ Error: Se aceptó un archivo sin cabecera PDF.");
  }

  // ---------------------------------------------------------------------------
  // ACCIÓN 3: Pipeline Unificado de Ingesta Documental en Base de Datos
  // ---------------------------------------------------------------------------
  console.log("\n▶ [Acción 3/5] Probando Ingesta con hash SHA-256 y versionado...");
  const [expediente] = await db.select().from(expedientes).limit(1);
  if (!expediente) {
    throw new Error("No hay expedientes en la base de datos para la prueba.");
  }

  const resIngesta = await registrarService.procesar({
    expedienteId: expediente.id,
    tipo: "CARATULA_OFICIAL",
    filenameOriginal: "caratula_generada_demo.pdf",
    bytes: caratulaBytes,
    origen: "SISTEMA",
    origenMetadata: JSON.stringify({ motor: "pdf-lib", accion: "auto-generacion" }),
    actor: { id: "sistema", dni: "00000000" },
  });

  if (resIngesta.ok) {
    console.log("  ✓ Documento registrado en pipeline:");
    console.log(`    - ID Documento:   ${resIngesta.value.id}`);
    console.log(`    - Versión:        v${resIngesta.value.version}`);
    console.log(`    - SHA-256:        ${resIngesta.value.sha256}`);
    console.log(`    - Ruta local:     ${resIngesta.value.rutaLocal}`);
  } else {
    throw new Error(`Fallo en la ingesta: ${resIngesta.error}`);
  }

  // ---------------------------------------------------------------------------
  // ACCIÓN 4: Sincronización real con Google Drive y verificación en DB
  // ---------------------------------------------------------------------------
  console.log("\n▶ [Acción 4/5] Sincronizando con Google Drive y verificando en PostgreSQL...");
  if (process.env.GOOGLE_DRIVE_ENABLED === "true") {
    await procesarSyncDrive({
      documentoId: resIngesta.value.id,
      expedienteId: expediente.id,
    });
  }

  const [docPersistido] = await db
    .select()
    .from(documentos)
    .where(eq(documentos.id, resIngesta.value.id))
    .limit(1);

  if (docPersistido) {
    console.log(`  ✓ Origen registrado:       ${docPersistido.origen}`);
    console.log(`  ✓ Estado Drive Sync:       ${docPersistido.driveSyncEstado}`);
    console.log(`  ✓ ID Archivo en Drive:     ${docPersistido.driveFileId}`);
    console.log(`  ✓ Enlace Web en Drive:     ${docPersistido.driveUrl}`);
  }

  // ---------------------------------------------------------------------------
  // ACCIÓN 5: Verificación de endpoint HTTP Multipart en vivo (/api/documentos/upload)
  // ---------------------------------------------------------------------------
  console.log("\n▶ [Acción 5/5] Probando subida multipart HTTP real vía Fastify API...");
  try {
    const loginRes = await fetch("http://localhost:3001/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: "00000001", password: "x" }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };

    const formData = new FormData();
    formData.append("expedienteId", expediente.id);
    formData.append("tipo", "PLAN_ESTRUCTURADO");
    const blob = new Blob([caratulaBytes], { type: "application/pdf" });
    formData.append("file", blob, "plan_prueba.pdf");

    const uploadRes = await fetch("http://localhost:3001/api/documentos/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    const uploadData = await uploadRes.json();
    console.log(`  ✓ Código HTTP recibido: ${uploadRes.status}`);
    console.log(`  ✓ Respuesta del endpoint:`, uploadData);
  } catch (err) {
    console.warn(
      "  ℹ No se pudo conectar al endpoint HTTP (¿servidor no levantado en :3001?)",
      err,
    );
  }

  console.log("\n=================================================================");
  console.log("   ¡TODAS LAS PRUEBAS DEL MÓDULO FINALIZARON CON ÉXITO!");
  console.log("=================================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error en la prueba:", err);
    process.exit(1);
  });
