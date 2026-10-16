# Registro Técnico de Cambios — Módulo de Almacenamiento e Ingesta Documental SITUNSA

> **Fecha:** 12 de Octubre de 2026  
> **Sistema:** SITUNSA (Sistema de Titulación y Segunda Especialidad — FIPS / UNSA)  
> **Alcance:** Ingesta Multicanal (Web, Correo Institucional, Generación Documental), Almacenamiento Dual (Local + Google Drive Institucional), Colas Asíncronas en `pg-boss` y Normalización de Carátulas.

---

## 1. Resumen Ejecutivo de la Implementación

Se ha implementado el módulo integral de almacenamiento de documentación y sincronización institucional, extendiendo la arquitectura *Lean* del sistema sin introducir dependencias pesadas como Redis o MinIO.

Las capacidades incorporadas incluyen:
1. **Modelo de datos y migración:** Nuevas columnas y enums en Drizzle ORM para trazabilidad de canal de origen (`WEB`, `CORREO`, `SISTEMA`) y estados de sincronización con Google Drive.
2. **Conector institucional a Google Drive:** Servicio que interactúa con Google Workspace Shared Drives mediante Service Account y Node.js Streams (0 MB consumo RAM).
3. **Colas asíncronas en PostgreSQL:** Nueva cola `sync-drive-institucional` operada por `pg-boss` con reintentos exponenciales.
4. **Pipeline unificado de ingesta:** Servicio centralizado que valida Magic Bytes (`%PDF-`), genera el hash SHA-256, versiona incrementalmente, persiste en disco local y encola en Google Drive.
5. **Ingesta Inbound vía IMAP TLS:** Monitorización desatendida de la bandeja de entrada institucional para asociar automáticamente adjuntos PDF a trámites `[SET-XXXX]`.
6. **Generador de carátulas normalizadas:** Normalización tipográfica (*Title Case* en español), ordenamiento alfabético de autores y formateo de grados del asesor con `pdf-lib`.

---

## 2. Archivos Nuevos Creados

A continuación se detalla cada archivo nuevo creado, su ubicación en el monorepo y su función específica:

| Archivo | Ubicación | Función y Responsabilidad |
|---|---|---|
| `google-drive.service.ts` | `apps/api/src/infra/storage/google-drive.service.ts` | **Conector Google Drive:** Autentica con Google Service Account, busca o crea carpetas `EXP-[CODIGO]` en la Unidad Compartida (Shared Drive) institucional y sube archivos mediante streaming de lectura (`createReadStream`) sin sobrecargar la memoria. |
| `sync-drive.worker.ts` | `apps/api/src/infra/jobs/sync-drive.worker.ts` | **Worker Asíncrono de Sincronización:** Consume la cola `sync-drive-institucional` de `pg-boss`. Recupera el archivo del disco local, lo sube a Drive y actualiza en base de datos el `driveFileId`, `driveUrl`, `driveSyncEstado` (`SINCRONIZADO` o `ERROR`) e intentos. |
| `inbound-email.service.ts` | `apps/api/src/infra/email/inbound-email.service.ts` | **Ingesta por Correo Electrónico:** Se conecta por IMAP TLS (`imapflow`), busca mensajes no leídos, extrae el código correlativo de trámite `[SET-XXXX]` del asunto o cuerpo, parsea adjuntos PDF (`mailparser`), los canaliza hacia `RegistrarDocumentoService` y marca los correos como leídos (`\Seen`). |
| `registrar-documento.service.ts` | `apps/api/src/modules/documentos/services/registrar-documento.service.ts` | **Pipeline Unificado de Ingesta Documental:** Núcleo común para los 3 canales de entrada. Valida Magic Bytes (`%PDF-`), calcula el hash criptográfico SHA-256, calcula el correlativo de versión, guarda el archivo en disco (`DOCS_STORAGE_PATH`), inserta el registro en PostgreSQL y encola la sincronización con Google Drive. |
| `registrar-documento.service.spec.ts` | `apps/api/src/modules/documentos/services/registrar-documento.service.spec.ts` | **Pruebas Unitarias del Pipeline:** Valida el rechazo de archivos corruptos o de tamaño inferior a 5 bytes, y el bloqueo de archivos con cabeceras distintas a PDF. |
| `generador-caratula.service.ts` | `apps/api/src/modules/documentos/services/generador-caratula.service.ts` | **Generador de Carátulas Normalizadas:** Función `normalizarTitleCase` para respetar conectores en español (*de, del, la, en, y, para*). Ordena los autores tesistas alfabéticamente, estampa el grado del asesor y el año, y genera el PDF resultante con `pdf-lib`. Es resiliente: funciona con o sin plantilla preexistente. |
| `generador-caratula.service.spec.ts` | `apps/api/src/modules/documentos/services/generador-caratula.service.spec.ts` | **Pruebas Unitarias del Generador:** Verifica la normalización gramatical en español y valida que el PDF generado cumpla con las especificaciones y cabeceras oficiales. |
| `0013_misty_timeslip.sql` | `packages/db/drizzle/0013_misty_timeslip.sql` | **Migración SQL de Drizzle:** Crea los tipos enum `origen_documento` y `estado_drive_sync`, y añade las columnas correspondientes en las tablas `documentos` y `expedientes`. |
| `0013_snapshot.json` | `packages/db/drizzle/meta/0013_snapshot.json` | **Instantánea de Drizzle Kit:** Registra el estado formal del esquema de base de datos para futuras migraciones incrementales. |
| `.env` | `.env` (raíz) | **Variables de Entorno Locales:** Inicializado con los parámetros de desarrollo, credenciales de Postgres, Mailpit, y las nuevas variables de Google Drive e IMAP. |
| `issue-tracker.md` | `docs/agents/issue-tracker.md` | **Configuración de Engineering Skills:** Especificación de tracking de issues local en formato markdown bajo `.scratch/<feature-slug>/`. |
| `triage-labels.md` | `docs/agents/triage-labels.md` | **Configuración de Engineering Skills:** Mapeo canónico de etiquetas de triaje para agentes. |
| `domain.md` | `docs/agents/domain.md` | **Configuración de Engineering Skills:** Reglas de consumo de documentación de dominio en modo single-context (`GLOSSARY.md` y `docs/adr/`). |

---

## 3. Archivos Existentes Modificados

| Archivo Modificado | Cambios Realizados y Justificación |
|---|---|
| `packages/db/src/schema/documentos.ts` | - Se agregaron los enums `origenDocumentoEnum` (`WEB`, `CORREO`, `SISTEMA`) y `estadoDriveSyncEnum` (`NO_APLICA`, `PENDIENTE`, `SINCRONIZADO`, `ERROR`).<br>- Se agregaron las columnas `origen`, `origenMetadata`, `driveFileId`, `driveUrl`, `driveSyncEstado`, `driveSyncIntentos`, `driveSyncedAt` y `driveError`.<br>- Se exportó el tipo `NuevoDocumento`. |
| `packages/db/src/schema/expedientes.ts` | - Se agregaron las columnas `driveFolderId` y `driveFolderUrl` para cachear el ID y enlace de la carpeta del expediente en la Unidad Compartida institucional, evitando consultas recurrentes a Google Drive. |
| `apps/api/package.json` | - Se incorporaron las dependencias `@googleapis/drive`, `imapflow` y `mailparser`.<br>- Se agregó `@types/mailparser` en `devDependencies`. |
| `apps/api/src/infra/jobs/colas.ts` | - Se definió la constante `COLA_SYNC_DRIVE` (`sync-drive-institucional`) y `COLA_INBOUND_EMAIL` (`inbound-email-check`).<br>- Se exportó el objeto unificado `COLAS` para compatibilidad de uso en los workers. |
| `apps/api/src/infra/jobs/workers.ts` | - Se registró la cola `COLA_SYNC_DRIVE` y se integró el worker `registrarWorkerSyncDrive(boss)`.<br>- Se registró la cola `COLA_INBOUND_EMAIL` y se programó un cron cada 5 minutos (`*/5 * * * *`) para procesar correos institucionales no leídos cuando `INBOUND_EMAIL_ENABLED=true`. |
| `apps/api/src/modules/documentos/use-cases/subir-documento/subir-documento.use-case.ts` | - Al insertar el documento en PostgreSQL se asigna `origen: "WEB"` y `driveSyncEstado: process.env.GOOGLE_DRIVE_ENABLED === "true" ? "PENDIENTE" : "NO_APLICA"`.<br>- Tras el commit exitoso de la transacción, si `GOOGLE_DRIVE_ENABLED === "true"`, se encola el job en `COLAS.SYNC_DRIVE_INSTITUCIONAL` para su procesamiento en segundo plano. |
| `.env.example` | - Se documentaron las variables `GOOGLE_DRIVE_ENABLED`, `GOOGLE_DRIVE_SHARED_DRIVE_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, `INBOUND_EMAIL_ENABLED`, `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD` y `DOCS_STORAGE_PATH`. |
| `AGENTS.md` | - Se añadió la sección `## Agent skills` referenciando las configuraciones de tracking, triaje y glosario en `docs/agents/`. |
| `packages/db/drizzle/meta/_journal.json` | - Actualizado por Drizzle Kit para incluir la entrada de la migración `0013_misty_timeslip`. |
| `pnpm-lock.yaml` | - Actualizado con los árboles de resolución de `@googleapis/drive`, `imapflow`, `mailparser` y `@types/mailparser`. |

---

## 4. Estado de Validación y Calidad

1. **Linter & Formatting:** `pnpm lint` aprobado (0 errores en Biome).
2. **Typecheck:** `pnpm -r run typecheck` completado exitosamente en todos los proyectos del monorepo (`@pis/contracts`, `@pis/domain`, `@pis/db`, `@pis/api`, `@pis/web`).
3. **Pruebas Unitarias e Integración:** `pnpm test` con **173/173 tests aprobados**.
4. **Verificación en Runtime:**
   - Base de datos migrada con éxito (`0013_misty_timeslip.sql`).
   - Servidor Fastify API activo en `:3001` con workers `pg-boss` conectados a PostgreSQL.
   - Prueba de subida de archivo multipart mediante `POST /api/documentos/upload` ejecutada y validada en PostgreSQL con `origen: 'WEB'` y cálculo de hash SHA-256.
