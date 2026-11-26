# Solicitud de Cambios del Cliente — Seguridad y Obtención de Datos (26 Nov. 2026)

| Metadato | Valor |
|---|---|
| **Código Documento** | `CR-MOD-OBT-002` |
| **Documento base** | [`spec.md`](./spec.md) (`SPEC-MOD-OBT-001`) · antecede: [`cambios-cliente-2026-11.md`](./cambios-cliente-2026-11.md) (`CR-MOD-OBT-001`) |
| **Rama** | `feat/modulo-obtencion-datos` |
| **Fecha de registro** | 26/11/2026 |
| **Estado** | Implementado en la rama (26/11/2026) — decisiones confirmadas (§7), verificación en §8.2 |
| **Vistas afectadas** | Login (`/login`), Mesa de Partes (`/mesa-de-partes`), Mi trámite (`/mi-tramite`), Bandeja y Detalle de Solicitud (`/solicitudes`, `/solicitudes/:id`) |

---

## 0. Resumen

| # | Cambio solicitado | Vista(s) | Capas | Migración |
|---|---|---|---|---|
| CR-05 | Acceso con Google (OAuth/OIDC) como segunda opción: solo `@unsa.edu.pe` y cuentas activas | Login | contracts, api, web, deploy | No |
| CR-06 | Al observar una solicitud se crea la cuenta del estudiante, que corrige desde el portal (se elimina la subsanación por enlace) | Bandeja, Mi trámite, correos | contracts, api, web, db | **Sí** (`0022`) |
| CR-07 | Sin fecha límite de subsanación: la observación queda abierta por tiempo indefinido | Bandeja, Detalle, correos | contracts, api, web, domain | No (columna sin uso) |
| CR-08 | Mensaje "revisa tu correo" en la pantalla de solicitud enviada | Mesa de Partes | web | No |
| CR-09 | Vista previa de imágenes (foto del tesista) en el visor administrativo; la foto es siempre JPG | Detalle de solicitud, Mesa de Partes | api, web | No |
| CR-10 | (Hallazgo) La bandeja y los archivos de solicitudes eran accesibles para cualquier TESISTA | Bandeja, descarga | api | No |

Contratos modificados (web y API actualizadas juntas, AGENTS.md §4):
`authContract.configGoogle` (nuevo), `solicitudesContract.miSolicitud` (nuevo),
`consultarPorTokenSubsanacion` y `subsanarConToken` (eliminados), y
`fechaLimiteSubsanacion` / `esPlazoVencido` fuera de `SolicitudResumen` y
`SolicitudDetalleDTO`.

---

## 1. CR-05 — Acceso con Google (cuentas institucionales)

### 1.1. Situación anterior
El API ya verificaba ID tokens de Google (`POST /api/auth/google`), pero la web
no ofrecía el botón y no se filtraba el dominio: cualquier cuenta de Google
cuyo correo coincidiera con un usuario podía entrar.

### 1.2. Comportamiento
- El login muestra **«Acceder con Google»** debajo de «Ingresar», solo si
  `GOOGLE_CLIENT_ID` está configurado (si no, la pantalla queda como antes).
- Flujo **Google Identity Services** en popup con ID token: sin client secret
  ni URI de redirección. La sesión que se emite es la misma del login local
  (JWT de acceso 15 min + refresh HttpOnly 8 h).
- Filtros en el servidor (`LoginGoogleUseCase`), en orden:

  | # | Regla | Error |
  |---|---|---|
  | 1 | Firma, emisor y audiencia del ID token válidos | `GOOGLE_INVALIDO` (401) |
  | 2 | Correo verificado por Google | `GOOGLE_INVALIDO` (401) |
  | 3 | Claim `hd` (lo firma Google) **y** correo terminados en `unsa.edu.pe` | `DOMINIO_NO_PERMITIDO` (401) |
  | 4 | Usuario existente y **activo**; nunca se crean cuentas | `SIN_CUENTA` (401) |
  | 5 | Si el usuario ya está vinculado a otra identidad de Google (`google_sub`), se rechaza | `SIN_CUENTA` (401) |

- Búsqueda del usuario: primero por `google_sub` (identificador estable); si
  no existe, por correo sin distinguir mayúsculas. En el primer ingreso se
  guarda el `google_sub`.
- Una cuenta **sin clave** (recién creada al observar o aceptar) también puede
  entrar por Google: Google acredita que el correo es del estudiante.
- `hd` también se envía a Google como sugerencia de cuenta en el selector; el
  filtro real es el del servidor.

### 1.3. Configuración
Variables (ver `.env.example`, `deploy/docker-compose.prod.yml`, `render.yaml`):

| Variable | Valor | Uso |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | Vacío = sin botón y `/api/auth/google` responde 501 |
| `GOOGLE_DOMINIO` | `unsa.edu.pe` (por defecto) | Único dominio de Workspace admitido |

La web lee el Client ID en tiempo de ejecución desde
`GET /api/auth/google/config` (público): no hay variable `VITE_` ni hace falta
recompilar la SPA para activarlo.

**Alta del cliente OAuth en Google Cloud Console:**
1. Crear un proyecto (de preferencia con una cuenta `@unsa.edu.pe`).
2. *Pantalla de consentimiento OAuth*: **Interna** si el proyecto pertenece a la
   organización UNSA (restringe a cuentas del Workspace); si no, **Externa** en
   modo prueba con los correos de prueba agregados. Alcances por defecto
   (`openid`, `email`, `profile`).
3. *Credenciales → Crear ID de cliente OAuth → Aplicación web*. **Orígenes de
   JavaScript autorizados**: `http://localhost:5173` (dev), `http://localhost`
   (`make prod-local`) y la URL pública de producción. No se registran URIs de
   redirección.
4. Copiar el Client ID a `GOOGLE_CLIENT_ID` (`.env` en dev; secreto del
   Dashboard en Render). No se usa el client secret, ni JSON, ni cuenta de
   servicio.

### 1.4. Criterios de aceptación
- [x] Con `GOOGLE_CLIENT_ID` vacío no aparece el botón.
- [x] Cuenta `@unsa.edu.pe` registrada y activa → ingresa y llega a su vista por rol.
- [x] Cuenta `@gmail.com` → rechazada con «Solo se admiten cuentas institucionales @unsa.edu.pe».
- [x] Usuario inactivo, inexistente o vinculado a otro `google_sub` → rechazado (spec).

---

## 2. CR-06 — Cuenta al observar y subsanación desde el portal

### 2.1. Situación anterior
Al observar se generaba un token de un solo uso con vencimiento y el correo
llevaba a `/subsanar/:token`, una página pública aparte. Esa página solo
permitía *marcar* documentos: no subía archivos.

### 2.2. Comportamiento
1. **Observar** (`ObservarSolicitudUseCase`), en una sola transacción:
   `EN_REVISION → OBSERVADA`, se guarda el motivo y se crea o sincroniza la
   cuenta **TESISTA sin clave** de cada participante, vinculada a la solicitud
   (`solicitud_participantes.usuario_id`, rol TESISTA asignado). Historial con
   el actor.
2. **Correo** (tras el commit), uno por participante, con las observaciones en
   lista y la forma de ingreso:
   - cuenta sin clave → enlace de activación de un solo uso (`/activar`, 72 h)
     «Crear mi clave e ingresar», y la alternativa «Ingresar con Google» si
     está configurado;
   - cuenta con clave → «Ingresar al portal» (`/login`).
   Si el enlace de activación vence, el estudiante pide otro con «¿Primera vez
   u olvidaste tu clave?». Un solo correo: el de observación incluye el acceso
   (no se envía además el de activación genérico).
3. **Mi trámite** sin expediente muestra la solicitud del estudiante
   (`GET /api/v1/mi-solicitud`): código, estado, observaciones y documentos.
   - `OBSERVADA`: los documentos marcados como observados se abren para
     reemplazar; los demás tienen «Reemplazar». «Reenviar a revisión» exige al
     menos un archivo.
   - `NUEVA` / `EN_REVISION`: aviso de que está en revisión.
   - `RECHAZADA`: fundamento del rechazo (la cuenta **sigue activa**, D-8).
   - `ACEPTADA`: aviso hasta que el expediente quede visible.
   - Cada documento puede verse con «Ver» (solo los propios).
4. **Reenviar** (`POST /api/v1/mi-solicitud/:id/subsanar`, multipart nativo con
   un campo `archivo_<documentoId>` por documento, `SubsanarSolicitudUseCase`):
   - Alcance: solo un participante vinculado; si no, 404.
   - Solo en estado `OBSERVADA` (candado de fila contra reenvíos simultáneos).
   - Cada archivo se valida por su contenido (foto JPG, resto PDF), se guarda
     como **versión nueva sin pisar la anterior**
     (`<TIPO>-v<n>-<nombre>`) y su conformidad vuelve a `PENDIENTE`.
   - `OBSERVADA → EN_REVISION`, historial `SUBSANADA` con el actor y correo de
     acuse «Subsanación recibida». Si la transacción falla, los archivos nuevos
     se borran del volumen.
5. **Aceptar** reutiliza el mismo aprovisionamiento
   (`sincronizarCuentasParticipantes`). Si la cuenta ya tiene clave, el correo
   es «Expediente creado» con acceso; si no, el de activación.
6. **Eliminado:** página `/subsanar/:token`, endpoints
   `/api/v1/public/subsanar/:token` (GET/POST), tabla `tokens_subsanacion`
   (migración `0022_eliminar_tokens_subsanacion`) y la excepción pública del
   guard. Los enlaces enviados antes del cambio dejan de funcionar.

### 2.3. Criterios de aceptación
- [x] Observar crea la cuenta (TESISTA, activa, sin clave) vinculada a la solicitud.
- [x] El correo de observación trae motivos y el enlace correcto según la cuenta.
- [x] El estudiante activa su clave, ve su solicitud y reenvía con documentos corregidos.
- [x] Reenviar sin archivos, con un formato inválido o fuera de `OBSERVADA` → error claro.
- [x] Aceptar después de observar no duplica cuentas ni correos de activación.

---

## 3. CR-07 — Observación sin fecha límite

- No se calcula ni guarda `fecha_limite_subsanacion` (la columna queda en la BD
  sin uso, siempre `NULL`, por si se reactiva).
- Fuera de los DTOs: `fechaLimiteSubsanacion` y `esPlazoVencido`. Se quitaron el
  badge «Plazo vencido» de la bandeja y del detalle, la línea «Fecha límite…»
  y el «plazo legal: 10 días hábiles» del modal de observar.
- Correos: el de observación ya no menciona fecha, días hábiles ni vencimiento
  de la observación (solo la vigencia del enlace para crear la clave). El acuse
  de recepción ya no promete «un enlace para subsanar».
- Dominio: `SolicitudAggregate.observar()` ya no recibe fecha ni la emite en el
  evento `SolicitudObservada`. `plazos-solicitud.ts` (`calcularLimiteSubsanacion`,
  `estaSubsanacionVencida`) queda **en suspenso**: puro y probado, sin uso en API ni web.

---

## 4. CR-08 — Mensaje al enviar la solicitud

La pantalla «¡Solicitud recibida con éxito!» muestra un aviso destacado
**«Revisa tu correo institucional»** con el correo de cada participante y la
indicación de que por ahí llegarán observaciones, aprobación y accesos (incluida
la carpeta de spam). «¿Qué sucede ahora?» explica que, si hay observaciones, se
corrigen ingresando al portal.

---

## 5. CR-09 — Imágenes en el visor y fotografía JPG

### 5.1. Causa
`entregarArchivo()` usa `application/pdf` por defecto y la descarga de
documentos de solicitud no pasaba el tipo real: la foto JPG llegaba como PDF y
el visor la intentaba mostrar en un `iframe`. Además, dos participantes que
subían `foto.jpg` se pisaban en disco (mismo nombre en la misma carpeta).

### 5.2. Cambios
- La descarga envía el MIME real con lista blanca (`mimeEntregable`:
  `image/jpeg`, `image/png` para filas antiguas, si no `application/pdf`). El
  visor decide por el tipo registrado.
- Regla única (`apps/api/src/modules/solicitudes/archivos-solicitud.ts`), usada
  al registrar y al subsanar: la **fotografía solo JPG** (Procedimientos FIPS,
  1ra etapa, req. 8: «digitalizada … – Formato JPG») y el resto PDF. Se decide
  por los magic bytes; el MIME guardado es el detectado, no el que declara el
  navegador.
- Nombre en disco con prefijo del requisito (`FOTO_ESTUDIANTE-foto.jpg`) y
  versión al subsanar.
- Mesa de Partes: la zona de la foto acepta solo `.jpg/.jpeg` y lo indica
  («Solo JPG · máx. 20 MB»).

---

## 6. CR-10 — Hallazgo de seguridad: lectura de solicitudes

La bandeja, el detalle y la descarga de archivos de solicitudes aceptaban
`expedientes.ver` como permiso alternativo. TESISTA tiene ese permiso, así que
cualquier estudiante con cuenta podía listar solicitudes ajenas y descargar sus
documentos. Con CR-06 las cuentas se crean antes, lo que agravaba el problema.

- La alternativa pasa a ser `reportes.ver`. Siguen entrando `RESP_TITULACION` y
  `VALIDADOR_TALLER` (`inscripciones.*`), `AUTORIDAD` (Decano) y `RESP_AREA`
  (`reportes.ver`). Pierden acceso por API TESISTA, ASESOR y JURADO (la web ya
  restringía `/solicitudes` al personal).
- Descarga: el participante vinculado ve sus propios archivos; el resto
  requiere permiso administrativo (403 auditado).

---

## 7. Decisiones (confirmadas el 26/11/2026)

| ID | Pregunta | Decisión |
|---|---|---|
| D-7 | ¿Qué pasa con el flujo de subsanación por enlace? | Se elimina por completo, incluida la tabla `tokens_subsanacion`. |
| D-8 | Si una solicitud observada termina rechazada, ¿se desactiva la cuenta? | No: queda activa y el portal muestra el rechazo (caso poco probable, p. ej. un error del personal). |
| D-9 | ¿La fecha límite se borra o se suspende? | Se deja de usar: sin cálculo, sin UI y sin mención en correos; columna y funciones de dominio se conservan. |
| D-10 | Credenciales de Google | Solo el Client ID de un cliente OAuth «Aplicación web»; sin secret ni redirect. |

---

## 8. Implementación

### 8.1. Archivos

| CR | Archivo | Cambio |
|---|---|---|
| 05 | `packages/contracts/src/auth.contract.ts` | `configGoogle` + `ConfigGoogleSchema`. |
| 05 | `apps/api/src/modules/auth/use-cases/login-google/login-google.use-case.ts` | Filtro `hd` + correo, `google_sub` distinto → rechazo. **Spec nuevo.** |
| 05 | `apps/api/src/modules/auth/use-cases/repositorios.ts` | Búsqueda por `google_sub` y luego por correo (insensible a mayúsculas). |
| 05 | `apps/api/src/modules/auth/auth.routes.ts` | `GET /api/auth/google/config`. |
| 05 | `packages/domain/src/shared/domain-error.base.ts` | Código `DOMINIO_NO_PERMITIDO`. |
| 05 | `apps/web/src/components/domain/boton-google.tsx` | **Nuevo**. Botón GIS (carga diferida del script, popup). |
| 05 | `apps/web/src/api/auth.ts`, `api/session.tsx`, `routes/login.tsx` | `loginGoogleRequest`, `entrarConGoogle`, botón en el login. |
| 05 | `.env.example`, `deploy/docker-compose.prod.yml`, `render.yaml` | `GOOGLE_CLIENT_ID`, `GOOGLE_DOMINIO`. |
| 06 | `apps/api/src/modules/solicitudes/cuentas-participantes.ts` | **Nuevo**. Alta/sincronización de cuentas TESISTA (observar y aceptar). |
| 06 | `.../use-cases/observar-solicitud/observar-solicitud.use-case.ts` | Reescrito: cuentas + un correo con acceso, sin token ni plazo. |
| 06 | `.../use-cases/subsanar-solicitud/subsanar-solicitud.use-case.ts` | Reescrito: subsanación autenticada desde el portal. **Spec nuevo.** |
| 06 | `.../use-cases/aceptar-solicitud/aceptar-solicitud.use-case.ts` | Usa `sincronizarCuentasParticipantes`. |
| 06 | `apps/api/src/modules/auth/use-cases/acceso/emitir-acceso.use-case.ts` | Opción `correo` para enviar el enlace dentro del correo del evento. |
| 06 | `apps/api/src/modules/solicitudes/correos-solicitud.ts` | Correo de observación nuevo; acuse sin «enlace para subsanar». |
| 06 | `apps/api/src/modules/solicitudes/solicitudes.repository.ts` | `getMiSolicitud`, `esParticipanteDeSolicitud`. |
| 06 | `apps/api/src/modules/solicitudes/solicitudes-admin.routes.ts` | `miSolicitud`; sin rutas por token ni excepción pública. |
| 06 | `apps/api/src/modules/solicitudes/solicitudes-publicas.routes.ts` | `POST /api/v1/mi-solicitud/:id/subsanar`. |
| 06 | `packages/contracts/src/solicitudes.contract.ts` | `MiSolicitudDTO`, `SubsanacionPortalRespuesta`, `miSolicitud`; fuera los endpoints por token. |
| 06 | `packages/db/src/schema/solicitudes.ts`, `drizzle/0022_eliminar_tokens_subsanacion.sql` | Tabla `tokens_subsanacion` eliminada. |
| 06 | `apps/web/src/components/domain/solicitudes/mi-solicitud-panel.tsx` | **Nuevo**. Estado, observaciones, reemplazo y reenvío. |
| 06 | `apps/web/src/routes/mi-tramite.tsx`, `api/solicitudes.ts` | Panel si no hay expediente; hooks `useMiSolicitud`, `useSubsanarMiSolicitud`. |
| 06 | `apps/web/src/routes/subsanar-solicitud.$token.tsx`, `app.tsx`, `api/guard.ts` | Página y ruta eliminadas. |
| 07 | `packages/domain/src/solicitud/solicitud.aggregate.ts`, `plazos-solicitud.ts` | `observar()` sin fecha; helpers en suspenso. |
| 07 | `apps/web/src/routes/solicitudes.tsx`, `solicitudes.$id.tsx`, `modal-observar-solicitud.tsx` | Sin badge ni textos de plazo. |
| 08 | `apps/web/src/routes/mesa-de-partes.tsx` | Aviso «Revisa tu correo institucional». |
| 09 | `apps/api/src/modules/solicitudes/archivos-solicitud.ts` | **Nuevo**. Validación por magic bytes, nombre en disco versionado. **Spec nuevo.** |
| 09 | `.../use-cases/crear-solicitud/crear-solicitud.use-case.ts` | Usa la regla única; MIME detectado; sin colisión de nombres. |
| 09 | `apps/web/src/components/domain/solicitudes/panel-documentos-solicitud.tsx` | El visor decide por el MIME registrado. |
| 09, 10 | `apps/api/src/modules/solicitudes/solicitudes-publicas.routes.ts` | MIME real en la descarga; alcance participante / `reportes.ver`. |
| 10 | `apps/api/src/modules/solicitudes/solicitudes-admin.routes.ts` | `expedientes.ver` → `reportes.ver` en bandeja y detalle. |

### 8.2. Verificación realizada
- Typecheck de todo el monorepo y Vitest: 76 archivos, 471 tests en verde.
  Specs nuevos o actualizados: `login-google.use-case.spec.ts`,
  `archivos-solicitud.spec.ts`, `subsanar-solicitud.use-case.spec.ts`,
  `crear-solicitud.use-case.spec.ts`, `correos-solicitud.spec.ts`,
  `packages/domain/__tests__/solicitud.spec.ts`, `packages/db/__tests__/solicitudes.spec.ts`.
- Biome sin errores en los archivos modificados. `make check` aún falla por
  errores previos en archivos no tocados (`documentos.routes.ts`,
  `generar-documentos.use-case.ts`, `actualizar-datos.use-case.ts`,
  `documento-card.tsx`, `consejo-facultad.ts`).
- `vite build` correcto.
- Prueba de punta a punta contra Postgres + Mailpit (API real):
  foto PNG rechazada y JPG aceptada → foto entregada como `image/jpeg` →
  observar crea la cuenta y envía un único correo con motivos y enlace de
  activación (sin plazos) → activar clave → `mi-solicitud` → TESISTA recibe 403
  en la bandeja y el detalle ajenos y 200 en su propia foto → reenvío con PNG
  rechazado, con JPG aceptado (versión 2, `PENDIENTE`, `EN_REVISION`) → segundo
  reenvío rechazado → acuse «Subsanación recibida» → aceptar genera SET con
  correo «Expediente creado».
- Google (navegador, cliente OAuth real): el botón aparece; `mforocca@unsa.edu.pe`
  ingresa y queda vinculado (`google_sub`); una cuenta `@gmail.com` es rechazada.
- Migración `0022` aplicada en la BD local.

### 8.3. Pendiente
- Probar con una segunda cuenta `@unsa.edu.pe` **no registrada** (debe
  rechazarse con `SIN_CUENTA`); está cubierto por spec, no en navegador.
- `make prod-local` antes del PR (botón de Google en `http://localhost`, descarga
  de la foto vía X-Accel con `Content-Type` correcto).
- Producción: agregar la URL pública a los orígenes autorizados y cargar
  `GOOGLE_CLIENT_ID` como secreto en Render.
- `e2e/tests/solicitudes.api.spec.ts` está desactualizado desde antes de este
  cambio (rutas `/api/solicitudes` y cuerpos antiguos, incluido el flujo por
  token): reescribirlo con el flujo del portal.
- En la BD de desarrollo quedaron los datos de prueba `SOL-2026-0008`,
  `SOL-2026-0009`, `SET011` y usuarios `e2e.*@unsa.edu.pe` (no se borran para
  no romper la cadena de auditoría).
