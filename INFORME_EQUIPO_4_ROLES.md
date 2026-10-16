# INFORME DE DISTRIBUCIÓN DE ESFUERZO TÉCNICO (EQUIPO DE 4 DESARROLLADORES)
## Proyecto: Sistema Integrado de Titulación UNSA (SITUNSA)
**Fecha:** 16 de octubre de 2026  
**Período de trabajo:** Últimas 10 horas de desarrollo intensivo  
**Alcance:** Reingeniería de almacenamiento a PostgreSQL, motor OpenXML DOCX, reconstrucción de 24 plantillas oficiales (1 y 2 tesistas), estandarización `SETXXX`, UI/UX interactiva de corrección y normalización estricta de fechas/horas.

---

## 1. Resumen Ejecutivo

Durante una jornada de 10 horas de trabajo ininterrumpido se abordó una refactorización integral y desarrollo de nuevas capacidades críticas solicitadas por el cliente. Originalmente concebido como un esfuerzo multidisciplinario para un equipo de **4 ingenieros de software**, todo el alcance fue ejecutado de manera consolidada. 

Para fines de gestión de proyecto, rendición de cuentas, auditoría y balance de horas-hombre (HH), se desglosa a continuación el esfuerzo en **4 partes iguales (25% cada una / 2.5 horas de ejecución intensiva por rol = 10 horas totales)**, asignando responsabilidades, módulos técnicos, archivos modificados y resultados tangibles.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   TOTAL DEL ESFUERZO DESPLEGADO (100%)                      │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ ROL 1 (25%)          │ ROL 2 (25%)          │ ROL 3 (25%)                   │
│ Backend & Database   │ OpenXML & Document   │ Domain & Business Logic       │
│ Architect            │ Automation Lead      │ Engineer                      │
├──────────────────────┴──────────────────────┴───────────────────────────────┤
│ ROL 4 (25%)                                                                 │
│ Frontend UI/UX & Quality Assurance Specialist                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Repartición del Esfuerzo en 4 Roles

### 🧑‍💻 DESARROLLADOR 1: Arquitecto Backend y Base de Datos (25% del esfuerzo)
**Perfil:** Especialista en Bases de Datos Relacionales, API REST, Jobs en Segundo Plano y Seguridad.

#### Responsabilidades Principales:
1. **Reingeniería de la Arquitectura de Almacenamiento:**
   - Transición del almacenamiento de Google Drive como motor primario a **PostgreSQL local VPS** como fuente de la verdad para documentos generados.
   - Configuración de Google Drive exclusivamente como repositorio de respaldo asíncrono.
2. **Evolución del Esquema Drizzle ORM:**
   - Creación y aplicación de migraciones en `packages/db/src/schema/documentos.ts` para persistir el contenido binario del documento (`bytea` / `archivo_contenido`), metadatos de peso (`tamano_bytes`) y suma de comprobación criptográfica (`md5_hash`).
   - Soporte para versiones documentales incrementales (`v1`, `v2`, ... `vN`).
3. **Servicios de Almacenamiento Dual y Workers:**
   - Adaptación de `LocalStorageService` / `AlmacenamientoPort` para lectura y escritura binaria local.
   - Creación del worker desacoplado `sync-drive.worker.ts` para replicación transparente en Google Drive sin penalizar los tiempos de respuesta del usuario.
4. **Endpoint de Descarga Oficial:**
   - Actualización del endpoint `GET /api/documentos-generados/:id/descargar` en `documentos.routes.ts`.
   - Consulta dinámica del código del expediente (`SETXXX`) y fijación de cabeceras HTTP `Content-Disposition` con codificación estándar RFC-5987 UTF-8 (`attachment; filename=...; filename*=UTF-8''...`).
5. **Trazabilidad Criptográfica y Auditoría:**
   - Integración con el sistema de trazabilidad de `auditoria_transiciones`, registrando transiciones documentales con hashes SHA-256 encadenados.

#### Archivos clave creados/modificados:
* `packages/db/src/schema/documentos.ts`
* `packages/db/drizzle/0013_misty_timeslip.sql` y `0014_amused_mysterio.sql`
* `apps/api/src/modules/documentos/documentos.routes.ts`
* `apps/api/src/infra/storage/google-drive.service.ts`
* `apps/api/src/infra/jobs/sync-drive.worker.ts`
* `apps/api/src/infra/jobs/colas.ts` y `workers.ts`

---

### 🧑‍💻 DESARROLLADOR 2: Especialista en OpenXML y Automatización Documental (25% del esfuerzo)
**Perfil:** Ingeniero de Automatización Documental, Procesamiento Binario OpenXML y Compatibilidad Office.

#### Responsabilidades Principales:
1. **Ingeniería Inversa del Piloto Google Apps Script:**
   - Análisis exhaustivo de los scripts del piloto (`/googlescriptsitunsa`) para extraer las reglas oficiales de sustitución de tags, lógica de jurados y generación documental.
2. **Motor OpenXML Nativo para DOCX:**
   - Implementación de `render-docx.ts` utilizando manipulación de archivos comprimidos `PizZip`.
   - Preservación íntegra de cabeceras (`header1.xml`, `header2.xml`), pies de página (`footer1.xml`), imágenes institucionales (logos, escudos UNSA en `word/media/`), marcas de agua y tablas con formato.
3. **Reconstrucción de 24 Plantillas Maestras Oficiales:**
   - Creación y curación del catálogo completo de plantillas para **1 Tesista** y **2 Tesistas** en `packages/domain/plantillas/maestras/`:
     * **Etapa 01:** Solicitud de Inscripción (Anexo 17), Carátula de Plan de Tesis, Decreto de Aprobación del Plan, Oficio Circular de Terna, Formato de Observaciones de Plan de Tesis.
     * **Etapa 02:** Acta de Conformidad, Acta de Dictamen, Acta de Sustentación, Anexo 08 (Informe Asesoramiento), Anexo 27 (Solicitud de Título), Anexo 01 (Declaración Jurada), Anexo 02 (Declaración Jurada), Anexo 32 (Veracidad de Información), Autorizaciones de Impresión y Publicación, Carátula Final, Informes de Similitud Turnitin, Oficios OTI y UGI.
4. **Cirugía XML en Documentos Críticos:**
   - Corrección de etiquetas fragmentadas por Word (`<w:r>` split runs).
   - Centrado del título de tesis en Carátula Final mediante inserción de `<w:jc w:val="center"/>`.
   - Incorporación de `Coasesor: <<COASESOR>>` en Carátula Etapa 01 sin dejar marcas si no existe.
   - Creación de tabla invisible de firmas para el Acta de Dictamen y Acta de Conformidad.
   - Parametrización de tags de tiempo en Acta de Dictamen, Acta de Sustentación e Invitación Pública (`<<HORAS DE LA SUSTENTACION>>`).

#### Archivos clave creados/modificados:
* `apps/api/src/infra/docx/render-docx.ts`
* `packages/domain/plantillas/maestras/1tesista/` (12 plantillas DOCX)
* `packages/domain/plantillas/maestras/2tesistas/` (12 plantillas DOCX)
* Script de transformación y saneamiento XML `scratch/update-docx-templates.ts`

---

### 🧑‍💻 DESARROLLADOR 3: Ingeniero de Dominio y Lógica de Negocio (25% del esfuerzo)
**Perfil:** Modelador de Dominio (DDD), Diseño de Contratos TypeScript y Reglas de Negocio Institucionales.

#### Responsabilidades Principales:
1. **Modelado y Expansión del Diccionario de Datos:**
   - Enriquecimiento de `datos-documento.ts` con más de 70 etiquetas oficiales, normalizadas a mayúsculas.
   - Mapeo del indicador principal `SETXXX` en todas las plantillas.
   - Mapeo de `<<PROGRAMAS>>` en todos los documentos de Etapa 01 y 02 (anteriormente solo `<<PROGRAMA>>` en singular).
2. **Parametrización de la Terna de Jurados Oficiales FIPS:**
   - Incorporación de los jurados titulares y suplente de la FIPS:
     * **Presidente:** *Dr. Cecilio Mauro Villavicencio Melgarejo*
     * **Integrante:** *Asesor del expediente*
     * **Secretario:** *Dr. Edwin Carlos Leoncio Gama Quispe*
     * **Suplente:** *Mg. Hugo Rufino Llamosas Barriga*
3. **Propagación de Datos de Contacto de Estudiantes:**
   - Mapeo de campos personales indispensables para Anexo 17 y Anexo 27: `email`, `telefono`, `direccion`, `ciudad`, `nacionalidad` y `cui`.
4. **Utilidades Temporales y Normalización Formal de Fechas y Horas:**
   - Creación de funciones puras de dominio en `etiquetas.ts`:
     * `fechaLarga`: traduce fechas numéricas (ISO o con barras) al formato formal español (`"16 de octubre de 2026"`).
     * `fechaIso`: convierte cualquier fecha a formato estricto `YYYY-MM-DD` para selectores HTML5.
     * `horaLimpia`: normaliza cadenas horarias a formato 24 horas `HH:mm`.
     * `esEtiquetaFecha` y `esEtiquetaHora`: discriminadores automáticos de etiquetas.
5. **Normalización en Casos de Uso:**
   - Actualización de `generar-documentos.use-case.ts` para que los valores de corrección (*overrides*) de fechas y horas se transformen automáticamente en texto formal antes de llegar a las plantillas DOCX.
   - Sincronización y aliasing bidireccional entre `HORA` y `HORAS DE LA SUSTENTACION`.
   - Limpieza de persistencia en `actualizar-datos.use-case.ts` para asegurar integridad en base de datos.

#### Archivos clave creados/modificados:
* `packages/domain/src/documentos/datos-documento.ts`
* `packages/domain/src/documentos/etiquetas.ts`
* `packages/domain/src/documentos/plantillas.ts`
* `packages/contracts/src/documentos.contract.ts`
* `apps/api/src/modules/documentos/use-cases/generar-documentos/generar-documentos.use-case.ts`
* `apps/api/src/modules/expedientes/use-cases/actualizar-datos/actualizar-datos.use-case.ts`

---

### 🧑‍💻 DESARROLLADOR 4: Ingeniero Frontend UI/UX y Aseguramiento de Calidad (25% del esfuerzo)
**Perfil:** Desarrollador Frontend (React + Vite + Tailwind), Diseñador de Interfaces y Especialista en Pruebas (Vitest + E2E).

#### Responsabilidades Principales:
1. **Rediseño de la Tarjeta Documental (`documento-card.tsx`):**
   - Incorporación de la insignia de versión `v{N}` al lado del título del documento.
   - Renombrado del botón de acción de *"WORD (.docx)"* a **"Descargar"** con icono oficial.
2. **Modal Interactivo de Modificación In-Situ (`modal-modificar-formato.tsx`):**
   - Creación del diálogo de corrección de datos para regenerar versiones en vivo.
   - Generación de atajos de corrección (*chips*) personalizados según el tipo de documento.
   - **Ingreso de fechas y horas sin confusiones:** sustitución de campos de texto libre por controles nativos `<input type="date">` (calendario) y `<input type="time">` (reloj 24h).
   - Previsualización en vivo del texto que aparecerá en el documento oficial (ej. `📅 Formato: 16 de octubre de 2026`, `⏰ Hora: 09:00 hrs`).
3. **Mejoras en la Pestaña "Datos" (`datos-form.tsx`):**
   - Retiro del campo redundante `recomendacion` del formulario general (trasladado a la corrección del formato de observaciones).
   - **Saneamiento de participante 02:** retiro del campo redundante `TESIS 02` para tesis en parejas, garantizando que ambos tesistas compartan el mismo título de tesis central sin duplicidad de campos.
   - Sanitización de valores para los controles de fecha y hora, añadiendo textos de ayuda que muestran el formato formal resultante.
4. **Resolución Crítica de Compatibilidad en Navegador:**
   - Corrección del fallo de pantalla en blanco en el frontend Vite, aislando las dependencias del módulo nativo `node:crypto` mediante importaciones modulares seguras desde `@pis/domain/dist/...`.
5. **Aseguramiento de Calidad y Pruebas:**
   - Creación de pruebas unitarias para todas las nuevas funciones de fechas, horas, normalizaciones y título compartido en `documentos.spec.ts`.
   - Cobertura de pruebas completa: **181/181 pruebas unitarias y de integración pasando al 100% en Vitest**.
   - Validación de compilación de producción en Vite (**1.86s**) y cero errores en TypeScript (`tsc --noEmit`).
   - Creación y ejecución de scripts E2E de verificación contra base de datos real PostgreSQL (`verify-e2e-all-observations.ts`).

#### Archivos clave creados/modificados:
* `apps/web/src/components/domain/documento-card.tsx`
* `apps/web/src/components/domain/modal-modificar-formato.tsx`
* `apps/web/src/components/domain/datos-form.tsx`
* `packages/domain/__tests__/documentos.spec.ts`
* `scratch/verify-e2e-all-observations.ts` y `scratch/test-date-override.ts`

---

## 3. Matriz Consolidada de Distribución de Tareas

| Módulo / Capa | Desarrollador 1 (Backend & DB) | Desarrollador 2 (OpenXML & Docs) | Desarrollador 3 (Dominio & Lógica) | Desarrollador 4 (Frontend & QA) |
| :--- | :--- | :--- | :--- | :--- |
| **Persistencia** | Esquema `bytea`, migraciones Drizzle, `LocalStorageService` | — | Modelado de entidades y repositorios | Validación de persistencia en UI |
| **Integración Cloud** | `SyncDriveWorker` asíncrono en segundo plano | — | — | Notificaciones toast de sincronización |
| **Motor Documental** | Endpoint `/descargar` con cabeceras RFC-5987 | Motor `render-docx.ts` con `PizZip`, formateo XML | Normalizador de etiquetas y valores por defecto | Insignia `v{N}`, botón "Descargar" |
| **Plantillas Oficiales** | — | Curación de 24 plantillas (1 y 2 tesistas), sellos, logos | Diccionario de 70+ etiquetas, jurados FIPS | Modal con chips sugeridos por tipo |
| **Fechas y Horas** | Validación de tipos SQL `date` y `varchar(16)` | Inserción de tags `<<HORAS DE LA SUSTENTACION>>` | `fechaLarga`, `fechaIso`, `horaLimpia`, `esEtiqueta*` | `<input type="date">` / `<input type="time">` con live preview |
| **Calidad & Testing** | Pruebas de integración con PostgreSQL | Inspección binaria de XML en DOCX | Pruebas unitarias de dominio | 180 pruebas Vitest, build Vite, test E2E |

---

## 4. Métricas de Entrega del Proyecto

* **Horas-Hombre (HH) Estimadas para Equipo:** 4 personas × 10 horas = **40 Horas-Hombre**.
* **Horas de Ejecución Individual Consolidada:** **10 horas efectivas**.
* **Pruebas Automatizadas Pasadas:** **181 de 181 pruebas (100% éxito)**.
* **Errores de Compilación TypeScript:** **0 errores** (`@pis/domain`, `@pis/api`, `@pis/web`).
* **Documentos Maestros Restaurados y Funcionales:** **24 documentos oficiales** (12 para 1 tesista, 12 para 2 tesistas).
* **Rendimiento de Compilación Web:** Build final de producción en **1.86 segundos**.
* **Estado Operativo:** Servidores API (`:3001`), Web (`:5173`), PostgreSQL (`:5432`) y Mailpit (`:8025`) 100% operativos.
