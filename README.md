# SITUNSA — Sistema de Titulación y Segunda Especialidad (FIPS / UNSA)

Monorepo Lean para digitalizar el trámite de titulación: registro y validación de
expedientes, seguimiento de 7 etapas / 38 subetapas, gestión documental con
cadena de custodia SHA-256 y paneles por rol (administración, tesista, asesor).

> Las fuentes primarias (PDFs normativos, entrevistas) son locales y no se
> versionan. La especificación procesada vive en [`docs/`](docs/).

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Vite + React 19 + TanStack Router/Query + Tailwind v4 + shadcn-style UI |
| Backend | Fastify standalone + ts-rest + Zod (contrato único en `packages/contracts`) |
| Dominio | `@pis/domain`: FSM, Result pattern, Specifications, hash chain (0 I/O) |
| Datos | PostgreSQL 16 + Drizzle ORM + `pg-boss` (colas, sin Redis) |
| Archivos | Disco local + Nginx `X-Accel-Redirect` (Node nunca bufferiza PDFs) |
| Calidad | Biome + `strict` TS + Vitest + Playwright + Turbo + pnpm workspaces |

Reglas de trabajo para agentes IA: ver [`AGENTS.md`](AGENTS.md).

## Requisitos

- Node.js ≥ 20, pnpm ≥ 9, Docker + Compose, Git.

## Setup (5 minutos)

```bash
# 1. Instalar dependencias
make install            # pnpm install

# 2. Variables de entorno
cp .env.example .env    # ajustar POSTGRES_* si hace falta

# 3. Fresh setup reproducible (infra + migraciones + seed; idempotente,
#    seguro repetirlo: en un volumen vacío crea todo desde cero)
make setup

# 4. Levantar entorno dev (Postgres + Mailpit en Docker, apps en host con HMR)
make dev
```

> **Persistencia de datos:** el volumen `pgdata` sobrevive a `down` y
> reinicios; solo `down -v` lo borra. En un setup fresco (volumen vacío)
> `make setup` aplica las migraciones versionadas de `packages/db/drizzle/`
> y el seed (`db:seed:base` = solo catálogos, apto para prod;
> `db:seed` = base + demo (SET004 completado 38/38, SET005 en plan,
> SET007 en dictamen 12/38), solo dev. `db:push` es solo un atajo de
> prototipado: no usar en CI/prod.

### Servicios en dev

| Servicio | URL | Notas |
|---|---|---|
| Web (Vite HMR) | http://localhost:5173 | `VITE_API_URL` vacío = mismo origen vía proxy `/api` |
| API (Fastify) | http://localhost:3001 | `GET /api/health` (y `/health`), `GET /docs` |
| Postgres 16 | localhost:5432 | `DATABASE_URL` en `.env` |
| Mailpit UI / SMTP | http://localhost:8025 / :1025 | Bandeja de los correos de dev (activación, observaciones, avances) |

### Variables nuevas (ver `.env.example`)

| Variable | Uso |
|---|---|
| `APP_URL` | URL pública de la web para los enlaces de los correos (en Render, si falta, se usa `RENDER_EXTERNAL_URL`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM` | Transporte SMTP (nodemailer). Dev: Mailpit `localhost:1025`. Sin `SMTP_HOST` los correos solo se registran en el log |
| `DOCS_ENTREGA` | `accel` (Nginx X-Accel-Redirect) o `stream` (sin Nginx). Vacío = `accel` en producción, `stream` en dev |
| `GOOGLE_CLIENT_ID`, `GOOGLE_DOMINIO` | Botón «Acceder con Google» (vacío = sin botón). Solo el Client ID de un cliente OAuth «Aplicación web»; dominio admitido por defecto `unsa.edu.pe`. Guía: [`CR-MOD-OBT-002` §1.3](docs/05-sdd/modulo-obtencion-datos/cambios-cliente-2026-11-26.md) |

El API carga el `.env` de la raíz por sí mismo en desarrollo
(`apps/api/src/config/cargar-env.ts`); en producción las variables las
inyecta el orquestador.

### Acceso de tesistas al portal

La cuenta TESISTA (sin clave) se crea al **observar** una solicitud de Mesa de
Partes, o al **aceptarla** / **validar la inscripción** si no existía. Los
participantes sin clave reciben un correo con un enlace de un solo uso
(`/activar?token=…`, vence en 72 h) para crear su clave; también pueden entrar
con **Google** usando su correo `@unsa.edu.pe`. Con la solicitud observada, en
«Mi trámite» ven las observaciones, reemplazan documentos y la reenvían a
revisión (sin fecha límite). Desde el login, «¿Primera vez u olvidaste tu clave?» (`/restablecer`)
envía un enlace nuevo sin revelar si la cuenta existe. El administrador puede
reenviarlo desde Datos del expediente → «Acceso al portal». En dev los
correos se leen en Mailpit.

### Credenciales dev (seed demo, `DEMO_PASSWORD`, solo local)

| Rol | Usuario (DNI) | Clave |
|---|---|---|
| Admin | `00000001` | `x` |
| Secretaría | `00000002` | `x` |
| Tesista | `12345678` / `11223344` | `x` |
| Asesor | `87654321` | `x` |

Auth real: acceso JWT 15 min (Bearer, solo en memoria) + refresh rotativo
HttpOnly 8 h, bloqueo 5 intentos × 15 min, Google OIDC solo para cuentas del
Workspace `@unsa.edu.pe` (claim `hd` + correo) de usuarios existentes y activos
(sin autocreación). Permisos `modulo.accion` + alcance por
registro (403 auditado). El stub `x-user-dni` solo vive con `AUTH_STUB=1`
(dev/curl); en prod se exige Bearer.

## Flujo de trabajo

```bash
make dev          # codificar (HMR <50ms, tsx --watch)
make check        # antes de cada commit: Biome + typecheck + Vitest
make prod-local   # antes de cada PR: MISMA imagen que Render en :80
                  # (migrate + seed demo + Nginx + API; credencial demo: x)
                  # con el 80 ocupado: PROD_PORT=8088 make prod-local
make prod-down    # bajar el entorno de paridad
make backup       # respaldo inmediato (BD + documentos) en deploy/backups/
make restore SELLO=20261005T070000Z   # restaura y verifica la cadena de custodia
```

### Pruebas

| Nivel | Comando | Qué cubre |
|---|---|---|
| Unitarias | `make check` | Dominio (FSM, reglas de avance, plazos, plantillas), use cases, infraestructura |
| E2E de API | `E2E_BASE_URL=http://localhost:5173 pnpm --filter pis-e2e test flujo-titulacion` | Un expediente nuevo de `REGISTRADO` a `TITULO_EMITIDO`, observaciones, Turnitin, activación por correo (Mailpit) y RN-06 |
| CI | `.github/workflows/ci.yml` | `verify` (Biome + typecheck + Vitest) y `e2e-api` (Postgres + Mailpit como servicios) |

El e2e de API crea datos: ejecútalo sobre el seed demo de dev o de
`prod-local`, nunca contra producción.

## Estructura

```text
apps/api      Fastify: transport (*.routes.ts) → use-cases (1 carpeta/acción,
              Result + UoW + FSM) → domain/persistencia
apps/web      SPA: src/routes (TanStack Router), src/api (fetch + Zod del
              contrato), src/components/{ui,domain,layout}
packages/domain      Kernel puro: fsm, días hábiles, specifications, checklist,
                     seguimiento (38 subetapas), hash chain, modalidades
packages/contracts   Fuente única de verdad: Zod + ts-rest (todo path bajo /api)
packages/db          Drizzle + migraciones versionadas en drizzle/
e2e/            Playwright (smoke + flujos por rol)
deploy/         Dockerfile multi-stage + nginx.conf (X-Accel) + compose prod
docs/           01-requirements (RF/RNF/trazabilidad), 02-domain (glosario,
                FSM, permisos, calendario, reverse-legacy), 04-operations
```

### Convenciones clave

- `apps/*` puede importar `packages/*`; jamás al revés; `domain` no toca I/O.
- Errores de negocio = `Result<T, DomainError>`, nunca `throw`; sin `any`.
- Toda tabla nueva = migración Drizzle (`pnpm --filter @pis/db db:generate`).
- Contratos: si cambia `packages/contracts`, se actualizan web **y** api en el mismo PR.
- Upload multipart = ruta nativa Fastify (excepción documentada en `AGENTS.md`).
- Frontend importa valores de dominio por ruta profunda
  (`@pis/domain/dist/...`), nunca del barrel si arrastra `node:crypto`.
- En Codespaces, pushear con `env GITHUB_TOKEN="" GH_TOKEN="" git push`
  (el helper del sistema inyecta el token limitado y da 403).

## Estado

Implementado: login por rol, dashboard admin, Mi Trámite, portal asesor,
Detalle del Expediente (Datos legacy-exactos + autoguardado, Documentos E1/E2
con upload real, Resumen con seguimiento e historial), registro con validación,
talleres, asesores y mensajes administrativos.

Port S-FIPS (4 oleadas): convenciones API + auth/sesiones, RBAC y controles,
proceso operativo (observar/V°B°/finalizar), taller y pagos, cierre del
trámite (jurados/sustentación/validaciones).

Completado sobre esa base (octubre 2026):

- Motor de reglas de avance por clave de subetapa: el estado del expediente
  avanza con el seguimiento E1–E7 y la API explica lo que falta
  ([`state-machine.md` §6](docs/02-domain/state-machine.md)).
- Observar y levantar observaciones con retorno al estado de origen;
  Turnitin < 20 %; publicación con 7 días de anticipación.
- Plazos en días hábiles con semáforo y aviso diario de subetapas vencidas;
  derivación de subetapas entre responsables.
- Generador documental «INSERTAR DATOS» (formatos PDF de E1/E2) e informe
  para Secretaría Académica (E6, HU-0045), con campos pendientes resaltados.
- Propuesta de rango de fechas de sustentación por el tesista (HU-0038) y
  Excel consolidado para el Consejo de Facultad con casilleros XXX (HU-0046).
- Correo SMTP real y acceso de tesistas por enlace de un solo uso.
- Carga del tesista solo en su subetapa activa u observados (RN-06) y
  configuración del proceso para ADMIN_FIPS (HU-0052).
- Respaldo diario con 30 días de retención, restauración guiada y
  verificación independiente de la cadena de custodia (RNF-03,
  [`backup-restore.md`](docs/04-operations/backup-restore.md)).
- Correcciones de las incidencias INC-01 … INC-07 del informe de pruebas.

Pendiente / limitaciones conocidas:

- Agenda de sesiones del Consejo con cupo (RN-07.1): el listado toma los
  expedientes con la subetapa «Consejo de Facultad» en curso.
- Disponibilidad de la terna por periodo para proponer intersecciones de
  fechas (RN-05.1): el área elige la fecha dentro del rango del tesista.
- Etnia y lengua consignadas por el alumno para SISGRAD (RN-07.3) y
  constancias académicas (HU-0033).
- Turnitin, SISGRAD y SUNEDU sin integración automática: se registran como
  validaciones institucionales. Citación por WhatsApp (RN-05.3): solo correo.
- Render en plan gratuito: sin disco persistente ni respaldos.
