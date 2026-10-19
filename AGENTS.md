# AGENTS.md — Protocolo de Codificación (IA + humanos)

## 1. Estructura del monorepo
- `apps/api` → Fastify standalone + ts-rest. Transport (`*.routes.ts`) → Use Cases (`use-cases/[accion]/`) → Domain/Persistencia.
- `apps/web` → Vite + React 19 SPA. Rutas en `src/routes/`, cliente ts-rest en `src/api/`, UI en `src/components/{ui,domain}/`.
- `packages/domain` → Kernel puro, 0 I/O. FSM, Result, Specifications, hash chain.
- `packages/contracts` → Single source of truth (Zod + ts-rest). Web y API solo importan de aquí.
- `packages/db` → Drizzle + Postgres 16. Toda tabla nueva = migración Drizzle.
- `e2e/` → Playwright. `deploy/` → paridad prod (Nginx + API + DB).

Reglas de importación: `apps/*` puede importar `packages/*`; `packages/*` NUNCA importa `apps/*`; `domain` no importa `db` ni `contracts`.

## 2. Flujo obligatorio
1. `make setup` una vez (o tras `down -v`): infra + migraciones + seed.
2. `make dev` para codificar (Postgres/Mailpit en Docker, apps en host).
3. `make check` antes de cada commit (Biome + typecheck + Vitest).
4. `make prod-local` antes de abrir PR (gate de paridad Nginx X-Accel en puerto 80).

## 3. Patrón obligatorio — Use Cases
```ts
// Result pattern + UoW + FSM check. Nunca throw para reglas de negocio.
const r = await uow.run(async (tx) => {
  const gate = assertTransition(exp.estado, "PLAN_APROBADO");
  if (!gate.ok) return fail(gate.error); // Result fallido ⇒ ROLLBACK de todo lo hecho en tx
  await tx.update(expedientes).set({ estado: "PLAN_APROBADO" }).where(eq(expedientes.id, id));
  await appendAuditoria(tx, { /* hash chain en la MISMA transacción */ });
  return ok({ id });
});
if (!r.ok) return r;
await enqueueCorreo({ expedienteId: id, asunto, titulo, texto }); // SOLO tras el commit
return r;
```
- `uow.run` abre una transacción real: si el callback devuelve un `Result` con
  `ok: false` se revierte; si lanza, también. Repositorios y helpers reciben
  `DbExecutor` (conexión o transacción), nunca el pool concreto.
- Reglas de avance del seguimiento = `@pis/domain` (`reglas-avance.ts`), por
  **clave estable** de subetapa (`CLAVES_SUBETAPA`), nunca por nombre u orden.
- Autorización: `autorizar(actor, { permiso, alternativas?, expedienteId? })`
  (RBAC `modulo.accion` + alcance RN-06/RN-07; 403 auditado, uuid inválido = 404).

## 4. Prohibiciones explícitas
- ❌ `any` (Biome lo bloquea). Usa `unknown` + narrowing o Zod.
- ❌ `throw` para errores de negocio (usa `Result<T, DomainError>`).
- ❌ Modificar tablas sin migración Drizzle (`db:generate` + `db:migrate`; `db:push` no vale).
- ❌ Seed demo en prod (`db:seed:base` sí; `db:seed` solo dev).
- ❌ Redis, MinIO o cualquier servicio extra (Lean: Postgres + disco + Nginx).
- ❌ Buffers de PDF en memoria Node (usa `X-Accel-Redirect`).
- ❌ Cambiar contratos sin actualizar web Y api en el mismo PR.

## 5. Convenciones
- Idioma: código en inglés, comentarios/docs en español.
- UI (`apps/web/src/components/ui/`): primitivas con CVA + Radix
  (Button, Card, Tabs, Acordeon, Dialogo, Tooltip, Field/ReadonlyField,
  EmptyState, StatCard, FormSection, PageHeader, DataTable). Las vistas
  componen estos patrones; prohibido inventar estilos ad-hoc (labels,
  inputs, tablas, badges) fuera de `ui/`. Tokens en `index.css` @theme.
- Commits: `feat(rf-01): ...`, `fix(api): ...`, `docs(...)`.
- Tests: 1 spec por use-case + tests puros de dominio (<100ms).

## 6. Restricciones técnicas vigentes (setup 2026-09-18, verificadas)
- `@pis/domain` es isomórfico solo en parte: `audit/cryptographic-trail.ts`
  usa `node:crypto`. El frontend (Vite/browser) debe importar valores de
  dominio por ruta profunda (`@pis/domain/dist/expediente/dias-habiles.js`),
  nunca del barrel si arrastra módulos Node. Los `import type` se borran en
  compilación y son seguros.
- `packages/db`: drizzle-kit no resuelve sufijos `.js` → `.ts` (NodeNext) con
  `require()` plano. `db:push`/`db:generate` compilan primero (`tsc → dist/`)
  y apuntan al schema compilado (`DRIZZLE_SCHEMA`, ver `drizzle.config.ts`).
  No cambiar este flujo sin verificar `db:push` contra Postgres local.
- Web usa `fetch` + `Schema.parse()` de `@pis/contracts` (no `@ts-rest/react-query`:
  su API de cliente cambió entre versiones y rompe el typecheck). Los paths
  deben coincidir con `packages/contracts/src/*.contract.ts`.
- Upload multipart y descargas son rutas nativas Fastify (`documentos.routes.ts`),
  no ts-rest (`@ts-rest/fastify` no maneja multipart fiable). Tipar con el
  genérico de la ruta, no con `FastifyRequest<…>` (rompe con
  `exactOptionalPropertyTypes`):
  `app.get<{ Params: { id: string } }>(url, { preHandler: async (req, reply) => requireAuth(req, reply) }, handler)`.
  El use-case sí usa Result.
- Autenticación = Bearer JWT (`middleware/require-auth.ts`). El stub
  `x-user-dni` (`middleware/stub-auth.ts`) solo se activa con `AUTH_STUB=1`
  (dev/curl), nunca en prod.
- Errores HTTP: `infra/http/manejador-errores.ts` es el único punto que traduce
  excepciones (Postgres 23505 → 409 `DATOS_DUPLICADOS`, 23503 → 409, 22xxx →
  400, resto → 500 genérico con id de correlación). Nunca `reply.send(err)` ni
  exponer SQL. Los routers ts-rest se registran con `OPCIONES_TS_REST`
  (errores de validación con el envelope `VALIDACION_FALLIDA`).
- Variables de entorno del API: `config/cargar-env.ts` carga el `.env` de la
  raíz en dev (Turbo en modo estricto no reenvía el entorno a las tareas). Debe
  seguir siendo el **primer import** de `server.ts`. En prod las inyecta el
  orquestador (Render / compose).
- Correo: `enqueueCorreo` (pg-boss) **después** del commit. Transporte SMTP
  con nodemailer (dev: Mailpit en :1025/:8025); sin `SMTP_HOST` solo se
  registra en el log. Enlaces con `urlPortal()` (`APP_URL` o
  `RENDER_EXTERNAL_URL`).
- Cadena de custodia: solo `appendAuditoria` (o el seed) escribe en
  `auditoria_transiciones`, con el `actorDni` que entra al hash. Tras tocar la
  auditoría o restaurar un respaldo, `pnpm --filter @pis/api verificar-auditoria`
  debe terminar con código 0.
- Reportes en archivo (XLSX del Consejo) = rutas nativas en `modules/reportes/`;
  el XLSX lo arma `infra/xlsx/escribir-xlsx.ts` (sin dependencias).
- Archivos: `LocalStorageService` guarda rutas absolutas bajo
  `DOCS_VOLUME_PATH`; la entrega usa `entregarArchivo()` (X-Accel-Redirect a
  `/protected-files/` en prod, stream en dev; ver `DOCS_ENTREGA`). La web
  descarga con Bearer (`abrirArchivoProtegido`), nunca con un enlace directo.

## Agent skills

### Issue tracker

Issues and specs are tracked as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles mapped to standard label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` and `docs/adr/` at repo root). See `docs/agents/domain.md`.
