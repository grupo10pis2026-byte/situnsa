# Solicitud de Cambios del Cliente — Módulo de Obtención de Datos (Nov. 2026)

| Metadato | Valor |
|---|---|
| **Código Documento** | `CR-MOD-OBT-001` |
| **Documento base** | [`spec.md`](./spec.md) (`SPEC-MOD-OBT-001`) |
| **Rama** | `feat/modulo-obtencion-datos` |
| **Fecha de registro** | 19/11/2026 |
| **Estado** | Implementado en la rama (19/11/2026) — decisiones confirmadas (§6), detalle en §7 |
| **Vistas afectadas** | Mesa de Partes (`/mesa-de-partes`), Detalle de Solicitud (`/solicitudes/:id`) y modal Aceptar Solicitud |

---

## 0. Resumen

| # | Cambio solicitado | Vista(s) | Capas | Prioridad sugerida |
|---|---|---|---|---|
| CR-01 | Zonas de carga tipo *dropzone*, en grilla, una por documento | Mesa de Partes | web (`ui/` + rutas) | Alta |
| CR-02 | Correos automáticos: usuarios recién creados y observaciones | API (use cases + plantilla) | api, config | Alta |
| CR-03 | Corrector ortográfico/gramatical del **título** (ES/EN), con subrayado y sugerencia opcional | Mesa de Partes, Detalle de solicitud (modo edición) | web (+ dominio puro) | Media |
| CR-04 | Panel de vista previa a la derecha en "Documentos adjuntos" | Detalle de solicitud (pestaña Documentos) | web | Alta |

Ningún cambio requiere migración de base de datos. Único cambio de contrato:
`ParticipanteConfigAceptacionSchema` deja de llevar la contraseña temporal
(`claveTemporalGenerada`) y `enviarCredencialesCorreo` pasa a
`enviarActivacionCorreo` (web y API actualizadas juntas, AGENTS.md §4).

---

## 1. CR-01 — Carga de documentos tipo *dropzone* en grilla

### 1.1. Situación actual
`apps/web/src/routes/mesa-de-partes.tsx` (Paso 3) muestra los documentos como una
**lista vertical** de tarjetas (`space-y-3.5`). Cada tarjeta admite soltar un
archivo, pero:
- El área de soltado no se distingue visualmente (no hay borde punteado ni
  estado *drag-over*); el usuario no sabe que puede arrastrar.
- La acción principal es un botón pequeño "Subir Archivo".
- Los campos se ven iguales entre sí; no hay agrupación por participante ni por
  documentos compartidos.
- Los errores de formato/peso no se muestran dentro del propio campo.

### 1.2. Comportamiento esperado
1. **Grilla**: `grid-cols-1` en móvil, `md:grid-cols-2` en escritorio
   (`xl:grid-cols-3` opcional). Cada documento = una tarjeta independiente.
2. **Agrupación** con encabezado de sección (`FormSection`):
   - *Documentos del trámite* (compartidos: Expediente 17/FUD, Carátula, Plan…).
   - *Documentos del Participante 1* / *del Participante 2* (foto, DNI, CV…).
3. **Zona de soltado amplia** dentro de cada tarjeta (alto mínimo ≈ 140 px), con
   borde punteado, icono, texto "Arrastre el archivo aquí o haga clic para
   seleccionar" y la línea de restricciones ("PDF · máx. 20 MB" / "JPG").
   Toda el área es clicable y accesible con teclado (Enter/Espacio).
4. **Estados visuales** de cada zona:

   | Estado | Aspecto |
   |---|---|
   | Vacío | Borde punteado `slate-300`, fondo blanco; badge *Obligatorio*/*Opcional*. |
   | Arrastrando encima | Borde `navy-800`, fondo `navy-100/40`, texto "Suelte para cargar". |
   | Cargado | Borde `verde-inst-700`, fondo `verde-inst-100`; nombre, peso, acciones *Ver*, *Reemplazar*, *Quitar*. Las fotos muestran miniatura. |
   | Error | Borde rojo y mensaje en el propio campo ("Solo se aceptan PDF", "Supera 20 MB"). |

5. **Visualización previa local (D-5)**: al cargar un archivo, la propia zona
   muestra la **miniatura de la primera página** (PDF renderizado con pdf.js en
   el navegador; imágenes directas). No se abre otra ventana ni se sube nada
   hasta el envío.
6. La guía/ayuda de cada documento (texto, enlaces, manual) se conserva como
   desplegable dentro de la tarjeta.
7. Barra de progreso del paso: "5 de 8 documentos obligatorios cargados".

### 1.3. Diseño técnico
- Nueva primitiva **`apps/web/src/components/ui/dropzone.tsx`** (CVA, variantes
  `vacio | arrastrando | cargado | error`), conforme a la regla de AGENTS.md §5
  (no estilos ad-hoc en las vistas). Props: `etiqueta`, `requerido`,
  `aceptar` (MIME), `pesoMaxBytes`, `archivo`, `onArchivo`, `error`, `ayuda`.
- Validación de tipo y peso en el propio componente antes de llamar a `onArchivo`
  (el servidor sigue validando; esto es solo UX).
- `utils/miniatura-archivo.ts`: miniatura local; `pdfjs-dist` (misma versión
  que ya usa la API) se carga de forma diferida, solo cuando hay un PDF.
- **Subsanación**: el portal `/subsanar/:token` hoy solo marca documentos como
  "Corregido" (no permite volver a subir archivos), así que no se aplicó la
  primitiva. Cuando se agregue la re-carga de archivos, debe usar `Dropzone`.
- Sin cambios de API: el envío multipart y las claves de archivo
  (`archivo_expediente17`, `archivo_foto_p1`, …) se mantienen.

### 1.4. Criterios de aceptación
- [ ] En ≥ 768 px los documentos se ven en 2 columnas; en móvil en 1, sin scroll horizontal.
- [ ] Al arrastrar un archivo sobre una zona, esa zona (y solo esa) cambia de estilo.
- [ ] Soltar un `.docx` en un campo PDF muestra el error en el campo y no lo carga.
- [ ] Un archivo cargado muestra su primera página y puede reemplazarse y quitarse desde su tarjeta.
- [ ] La zona es operable con teclado y tiene `aria-label` con el nombre del documento.

---

## 2. CR-02 — Envío automático de correos

### 2.1. Situación actual (ya implementado)
La infraestructura existe y cumple AGENTS.md (correo **después** del commit):
- `infra/jobs/colas.ts` → `enqueueCorreo()` (pg-boss, 3 reintentos).
- `infra/jobs/workers.ts` → resuelve destinatarios y llama a `renderizarCorreo()`.
- `infra/mail/plantilla-correo.ts` → plantilla HTML institucional.
- `infra/mail/correo.service.ts` → nodemailer; sin `SMTP_HOST` solo registra en log.
- Ya se encolan: acuse de recibo (crear solicitud), solicitud observada (con
  enlace de subsanación), solicitud aceptada (con credenciales), rechazo.

En desarrollo los correos llegan a **Mailpit** (`http://localhost:8025`), no a
buzones reales.

### 2.2. Problemas detectados en la revisión
1. **HTML escapado en el correo de bienvenida**: `aceptar-solicitud.use-case.ts`
   arma `texto` con `<br/>` y `<strong>`, pero la plantilla escapa todo el
   contenido (`escaparHtml`). El destinatario verá las etiquetas literales
   (`&lt;strong&gt;…`). Hay que pasar texto plano/estructurado y que la
   plantilla genere el formato.
2. **Colores de la plantilla no alineados con la app**: usa `#06283A` y
   `#7A0019`; los tokens de `apps/web/src/index.css` son `navy-950 #0b1f30`,
   `guinda-700 #78152f`, `dorado-500 #d1a84b`, `verde-inst-700 #197648`,
   `aviso-100/800 #fef3c7 / #92400e`.
3. **Contraseña temporal en texto plano** por correo. Existe ya un flujo de
   enlace de activación de un solo uso (`EmitirAccesoUseCase`, ruta `/activar`)
   que es más seguro (ver decisión D-2).
4. La plantilla muestra "Expediente / Estado" pensados para expedientes; las
   solicitudes (`SOL-AAAA-NNNN`) no tienen ese bloque.

### 2.3. Comportamiento esperado
**Eventos que disparan correo** (alcance D-3: Mesa de Partes):

| Evento | Destinatario | Contenido clave | Función del catálogo |
|---|---|---|---|
| Solicitud recibida | Participantes | Código SOL, modalidad, fecha | `correoSolicitudRecibida` |
| Solicitud observada | Participantes | Lista de observaciones, fecha límite (10 d.h.), botón "Subsanar mi solicitud" | `correoSolicitudObservada` |
| Subsanación recibida | Participantes | Código SOL | `correoSubsanacionRecibida` |
| Solicitud rechazada | Participantes | Fundamento | `correoSolicitudRechazada` |
| Solicitud aceptada · **usuario nuevo** (o sin clave) | Cada tesista | Código SET, usuario (DNI), **enlace de activación** de un solo uso (72 h) | `correoAcceso` (`EmitirAccesoUseCase`) |
| Solicitud aceptada · usuario con clave | Cada tesista | Código SET, usuario (DNI), botón "Ver mi trámite" | `correoExpedienteCreado` |

Las observaciones de documentos/expedientes en trámite quedan fuera de este
alcance; para incorporarlas basta con agregar una función al catálogo y
llamarla tras el commit con `enqueueCorreo`.

**Diseño de la plantilla** (tabla HTML compatible con Gmail/Outlook, estilos en línea):
- Cabecera `navy-950` con nombre de la universidad y sistema; filete `dorado-500`.
- Título en `guinda-700`; cuerpo `grafito-900` sobre blanco, fondo exterior gris claro.
- Bloque de datos (código SOL/SET, fecha límite) en tarjeta con borde.
- Lista de observaciones en caja `aviso-100` con texto `aviso-800`.
- Botón principal `guinda-700`; versión en texto plano siempre incluida.
- Variantes por tipo: `bienvenida`, `observacion`, `informativo`.

**Escalabilidad**: los casos de uso ya no escriben HTML. Cada evento es una
función pura en `modules/solicitudes/correos-solicitud.ts` que devuelve un
`CorreoPayload` con bloques (`etiqueta`, `variante`, `saludo`, `texto` con
`**negrita**`, `datos`, `lista`, `enlace`, `nota`); la plantilla aplica el
formato y escapa todo. El envío sigue siendo pg-boss + nodemailer tras el commit.

### 2.4. Configuración para enviar desde Gmail (pruebas reales)
Se necesita una cuenta de Gmail (o Google Workspace) con **verificación en dos
pasos** activa y una **contraseña de aplicación** (16 caracteres, se genera en
*Cuenta de Google → Seguridad → Contraseñas de aplicaciones*). La contraseña
normal de la cuenta **no** funciona.

```dotenv
# .env (NUNCA commitear; en prod se configuran en Render/compose)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=cuenta.de.pruebas@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx      # contraseña de aplicación, sin espacios
MAIL_FROM=                              # vacío = SMTP_USER (Gmail exige la misma cuenta o un alias verificado)
APP_URL=http://localhost:5173           # base de los enlaces del correo
```

Las cuentas `@unsa.edu.pe` son Google Workspace y usan el mismo servidor
(`smtp.gmail.com`). Los espacios de la contraseña de aplicación se ignoran.
Límites a considerar: Gmail personal ≈ 500 destinatarios/día; Workspace ≈ 2 000.
Para producción se recomienda una cuenta institucional dedicada
(p. ej. `titulacion.fips@unsa.edu.pe`) o el relay SMTP de la universidad.

### 2.5. Criterios de aceptación
- [ ] Al aceptar una solicitud, cada tesista recibe un correo legible (sin etiquetas visibles) con su acceso.
- [ ] Al observar, el correo lista los motivos, la fecha límite y el botón de subsanación.
- [ ] Los correos se envían solo tras el commit; si la transacción falla, no sale ningún correo.
- [ ] Test unitario de `renderizarCorreo` por variante (escapado + contenido).
- [ ] Prueba manual con Gmail real: el correo llega a bandeja de entrada y se ve bien en web y móvil.

---

## 3. CR-03 — Corrector del campo Título

### 3.1. Alcance
- Campo **Título** en Mesa de Partes (Paso 2) y en el Detalle de solicitud
  (`solicitudes.$id.tsx`, modo edición).
- Idiomas: español (principal) e inglés (títulos o términos en inglés).
- **No automático**: el texto nunca se cambia solo. Se subraya lo corregible y el
  usuario decide aplicar o ignorar, como en Google Forms/Docs.

### 3.2. Comportamiento esperado
1. Mientras se escribe (con *debounce* ≈ 400 ms) se analizan las palabras.
2. Palabras con posible error → **subrayado ondulado rojo**; sugerencias de
   estilo/formato → **subrayado ondulado azul/ámbar**.
3. Clic (o cursor con flechas) sobre lo subrayado abre un *popover* con las
   sugerencias ("Implementación") e **Ignorar** (oculta esa sugerencia en el
   campo durante la sesión). Escape lo cierra.
4. Indicador discreto bajo el campo: "2 sugerencias" / "Sin sugerencias".
5. No bloquea el envío ni el guardado.

### 3.3. Tipos de verificación
| Tipo | Ejemplos | Fuente |
|---|---|---|
| Ortografía ES/EN | "implementasion" → "implementación"; "tesis" sin error | Diccionarios Hunspell (`es`, `en`) |
| Tildes frecuentes | "analisis", "metodologia", "gestion" | Diccionario ES |
| Formato del título | Espacios dobles, punto final, MAYÚSCULAS sostenidas, comillas sin cerrar, tipo oración | Reglas propias (alineadas con la validación ortotipográfica de documentos) |
| Gramática (concordancia, preposiciones) | "los proceso", "en base a" | Fuera de alcance (D-4) |

### 3.4. Diseño técnico
- **Motor en el navegador**, sin servicios extra (AGENTS.md §4 Lean):
  `nspell` + diccionarios Hunspell ES/EN cargados de forma diferida (solo al
  enfocar el título) dentro de un *Web Worker* para no bloquear la UI.
- **Reglas de formato** como funciones puras en `@pis/domain`
  (p. ej. `domain/src/solicitud/revision-titulo.ts`) sin I/O, testeables en
  < 100 ms, importadas por ruta profunda desde la web (AGENTS.md §6).
- Hunspell solo sugiere a una edición de distancia; `variantesOrtograficasEs`
  genera candidatos con confusiones típicas (s/c/z, b/v, y/ll, g/j, h,
  tildes, -sion/-ción) que el diccionario valida, p. ej.
  "implementasion" → "Implementación".
- Se omiten siglas (UNSA), palabras de una letra y nombres propios
  (mayúscula que no inicia oración) para reducir falsos positivos.
- **Componente** `apps/web/src/components/ui/textarea-corrector.tsx`: técnica de
  capa espejo (un `div` detrás del `textarea` con el mismo texto y `<mark>`
  subrayados), porque un `textarea` no permite estilizar rangos. Se desactiva
  el corrector nativo del navegador (`spellCheck={false}`) para evitar doble
  subrayado.
- Lista blanca de términos (siglas UNSA, FIPS, SUNEDU, nombres de programas)
  para reducir falsos positivos.

### 3.5. Criterios de aceptación
- [ ] "Implementasion de un sistema" subraya "Implementasion" y sugiere "Implementación".
- [ ] Aplicar la sugerencia cambia solo esa palabra; "Ignorar" quita el subrayado de esa ocurrencia.
- [ ] Palabras correctas en inglés ("machine learning") no se marcan.
- [ ] El texto no se modifica sin acción del usuario.
- [ ] Funciona igual en Mesa de Partes, en el modo edición del Detalle y en el modal Aceptar Solicitud.

---

## 4. CR-04 — Vista previa de documentos adjuntos (Bandeja / Detalle)

### 4.1. Situación actual
En `solicitudes.$id.tsx`, pestaña **Documentos** (checklist documentario), cada
fila tiene un botón que llama a `abrirArchivoProtegido()` y abre el archivo **en
otra pestaña**. El administrativo pierde el contexto del checklist al revisar.

### 4.2. Comportamiento esperado
1. Diseño en **dos columnas** dentro de la pestaña Documentos (≥ 1024 px):
   - Izquierda (~40 %): checklist actual (documento, tipo, peso, versión,
     estado de conformidad, acciones Conforme/Observado).
   - Derecha (~60 %): **panel de vista previa** fijo (`sticky`), alto ≈ alto de
     ventana.
2. Al hacer clic en una fila se selecciona (resaltado) y se carga en el panel.
   Por defecto se muestra el primer documento.
3. Cabecera del panel: nombre del archivo, versión, navegación
   *Anterior / Siguiente*, *Descargar* y *Abrir en pestaña* (secundario).
4. PDF → visor nativo del navegador en `iframe`; JPG/PNG → `img` ajustada.
5. Las acciones Conforme/Observado también están en la cabecera del panel,
   para revisar y marcar sin volver a la lista.
6. En pantallas < 1024 px la vista previa queda debajo de la lista y, al elegir
   un documento, la página se desplaza hasta ella.

### 4.3. Diseño técnico
- Hook `api/use-archivo-protegido.ts` (descarga con Bearer → `blob` →
  `URL.createObjectURL`); el Blob queda en la caché de React Query (5 min), así
  alternar documentos no los vuelve a descargar; el object URL se libera al
  cambiar o desmontar.
- Componente `components/domain/solicitudes/panel-documentos-solicitud.tsx`.
- Sin cambios de API: se usa la ruta existente
  `GET /api/v1/solicitudes/:id/documentos/:documentoId/descargar`
  (X-Accel-Redirect en prod), que ya responde `inline`.

### 4.4. Criterios de aceptación
- [ ] Seleccionar un documento lo muestra a la derecha sin abrir otra pestaña.
- [ ] Se puede alternar entre documentos y marcar conformidad desde el panel.
- [ ] Fotos JPG se ven como imagen; PDFs con paginación/zoom del visor nativo.
- [ ] Funciona con `make prod-local` (Nginx X-Accel) además de `make dev`.

---

## 5. Plan de implementación sugerido

| Orden | Entregable | Commit sugerido |
|---|---|---|
| 1 | Primitiva `ui/dropzone.tsx` + Paso 3 en grilla + subsanación | `feat(solicitudes): dropzones en grilla para carga de documentos` |
| 2 | Hook `useArchivoProtegido` + panel de vista previa | `feat(solicitudes): vista previa lateral de documentos adjuntos` |
| 3 | Plantilla de correo con tokens de la app + corrección del correo de bienvenida + nuevos eventos | `feat(api): correos automaticos de alta de usuario y observaciones` |
| 4 | Reglas puras de título + `ui/textarea-corrector.tsx` | `feat(solicitudes): corrector ortografico del titulo` |

Cada entrega pasa `make check`; antes del PR, `make prod-local`.

---

## 6. Decisiones (confirmadas el 19/11/2026)

| ID | Pregunta | Decisión |
|---|---|---|
| D-1 | Cuenta de envío | Cuenta Google Workspace del equipo con contraseña de aplicación, configurada en `.env` (`SMTP_USER`/`SMTP_PASS`, nunca en commits). Prod: definir cuenta institucional dedicada. |
| D-2 | Usuario recién creado | **Enlace de activación** de un solo uso (72 h, ruta `/activar`). Se eliminó la contraseña temporal del modal, del contrato y del correo. |
| D-3 | Alcance de "observaciones" | Solo **Mesa de Partes** (solicitudes). Se reutilizó la infraestructura existente (pg-boss + nodemailer) y se dejó un catálogo extensible. |
| D-4 | Corrector | **Ortografía + formato**, gratuito y local (Hunspell ES/EN en un Web Worker). Sin gramática ni servicios externos. |
| D-5 | Vista previa en el dropzone | Sí: la zona muestra la **primera página** del archivo cargado. |
| D-6 | "Abrir en pestaña" | Se mantiene como botón secundario en la cabecera del visor. |

---

## 7. Implementación

### 7.1. Archivos

| CR | Archivo | Cambio |
|---|---|---|
| 01 | `apps/web/src/components/ui/dropzone.tsx` | **Nuevo**. Primitiva CVA (vacío · arrastrando · cargado · error), accesible con teclado. |
| 01 | `apps/web/src/utils/miniatura-archivo.ts` | **Nuevo**. Miniatura local (pdf.js diferido / imagen). |
| 01 | `apps/web/src/routes/mesa-de-partes.tsx` | Paso 3 en grilla por secciones, barra de avance, errores por campo. |
| 04 | `apps/web/src/api/use-archivo-protegido.ts` | **Nuevo**. Hook de blob protegido con caché. |
| 04 | `apps/web/src/components/domain/solicitudes/panel-documentos-solicitud.tsx` | **Nuevo**. Checklist + visor lateral. |
| 04 | `apps/web/src/routes/solicitudes.$id.tsx` | Pestaña Documentos usa el panel; título con corrector. |
| 02 | `apps/api/src/infra/mail/plantilla-correo.ts` | Colores de la app, bloques estructurados, `**negrita**`, enlace de respaldo. |
| 02 | `apps/api/src/modules/solicitudes/correos-solicitud.ts` | **Nuevo**. Catálogo de correos de Mesa de Partes. |
| 02 | `apps/api/src/modules/auth/use-cases/acceso/emitir-acceso.use-case.ts` | Correo de activación con contexto de expediente (`correoAcceso`). |
| 02 | `apps/api/src/modules/solicitudes/use-cases/*` | Usan el catálogo; `aceptar-solicitud` crea cuentas sin clave y emite activación. |
| 02 | `apps/api/src/infra/mail/correo.service.ts` | Remitente = `MAIL_FROM` o `SMTP_USER`; normaliza espacios de la clave. |
| 02 | `packages/contracts/src/solicitudes.contract.ts` + modal aceptar | Sin contraseña temporal; `enviarActivacionCorreo`. |
| 03 | `packages/domain/src/solicitud/revision-titulo.ts` | **Nuevo**. Reglas puras de formato y apoyo ortográfico. |
| 03 | `apps/web/src/workers/corrector.worker.ts` | **Nuevo**. nspell + diccionarios ES/EN fuera del hilo principal. |
| 03 | `apps/web/src/utils/use-corrector-titulo.ts`, `components/ui/textarea-corrector.tsx` | **Nuevos**. Hook y componente con subrayado y popover. |
| 03 | `apps/web/vite.config.ts` | Alias `@diccionario-es/en` para servir `.aff/.dic` como assets. |

Dependencias nuevas (web): `pdfjs-dist@5.4.296`, `nspell@2.1.5`,
`dictionary-es@4.0.0`, `dictionary-en@4.0.0`, `@types/nspell`. Se cargan bajo
demanda (chunks separados): no aumentan la carga inicial de la SPA.

### 7.2. Verificación realizada
- `make check` (Biome + typecheck + Vitest) en verde. Tests nuevos:
  `packages/domain/__tests__/revision-titulo.spec.ts` y
  `apps/api/src/modules/solicitudes/correos-solicitud.spec.ts`.
- `vite build` correcto (worker, pdf.js y diccionarios en chunks diferidos).
- Prueba en navegador (Chromium): grilla de dropzones con miniatura y error
  por campo; móvil 390 px sin scroll horizontal; corrector sugiere
  "Implementación" y "análisis" y aplica el cambio solo al elegirlo.
- Envío real por SMTP de Gmail a la cuenta configurada (correo de observación).

### 7.3. Pendiente
- `make prod-local` antes del PR (vista previa con X-Accel en Nginx).
- Prueba de punta a punta con API + DB: observar y aceptar una solicitud y
  revisar los correos recibidos (activación → `/activar`).
- Definir la cuenta de envío de producción (D-1) y configurarla en Render.
