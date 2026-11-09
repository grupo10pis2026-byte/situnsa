# Módulo Gestión del Taller de Tesis (spec v1.0)

> Fuente: «Taller de tesis.pdf» v1.0 (03/11/2026) y mockups del módulo.
> Implementación: rama `feat/taller-v1-modelo-dominio`. Este documento resume
> cómo quedó construido; las reglas viven en `packages/domain/src/taller/`.

## 1. Pantallas y rutas

| Pantalla | Rol | Ruta web | Contrato |
|---|---|---|---|
| P1 Lista de talleres | Secretaría | `/talleres` | `talleres.contract.ts` |
| P2 Crear / editar taller | Secretaría | `/talleres/nuevo`, `/talleres/$id/editar` | `talleres.contract.ts` |
| P3 Detalle del taller (Alumnos, Sesiones, Hitos, Plan, Grupos, Pensiones) | Secretaría | `/taller/$id` | `talleres`, `proyectos`, `sesiones`, `hitos` |
| P4/P5 Sesiones, asistencia y grupos | Asesor (Secretaría corrige) | `/asesor/taller` | `sesiones.contract.ts` |
| P6 Plan del taller y matriz de hitos | Asesor | `/asesor/taller` | `hitos.contract.ts` |
| P6b Entregas, P11 Ficha, P13 Cierre de un proyecto | Asesor (Secretaría y alumno consultan) | `/proyectos/$id/entregas` | `hitos`, `ficha-cierre` |
| P7 Mi Taller | Alumno | `/mi-taller` | `mi-taller.contract.ts` |
| P8 Mis pagos | Alumno | `/mis-pagos` | `pagos-taller.contract.ts` |
| P9 Pagos y deudores | Secretaría | `/pagos-taller` | `pagos-taller.contract.ts` |
| P10 Perfil del asesor / P15 Lista de asesores | Secretaría | `/asesores/$id`, `/asesores` | `asesores.contract.ts` |
| P12 Alertas, retiros y reportes | Secretaría | `/reportes-taller` | `alertas-taller.contract.ts` |
| P14 Encuesta / P14b Resultados | Alumno / Secretaría y asesor | `/encuesta`, `/encuestas-resultados` | `encuestas-taller.contract.ts` |
| P16 Configuración del taller | Administrador | `/configuracion` (pestaña Taller) | `taller-configuracion.contract.ts` |
| D1 Asignar alumno · D2 Reprogramar/cancelar · D3 Aprobar plan | Secretaría · ambos · Asesor | diálogos | `proyectos`, `sesiones`, `hitos` |

Archivos (subidas multipart y descargas protegidas) son rutas nativas Fastify:
entregas (`/api/hitos/:id/entregas`, `/api/entregas/:id/archivo`, ZIP por hito),
comprobantes (`/api/pensiones-alumno/:id/comprobante`, `/api/comprobantes/:id/archivo`),
ficha (`/api/proyectos/:id/ficha/pdf|firmada`), cierre
(`/api/proyectos/:id/cierre/informe|firmado`) y reportes
(`/api/talleres/:id/reportes/:hito?formato=pdf|xlsx`).

## 2. Permisos (§4)

- **Secretaría del Taller** = permiso `taller.crear` (en el seed: roles
  `RESP_TALLER` y `RESP_TITULACION`) o `pagos.editar` para P9. Crea y edita talleres, asigna
  alumnos, valida pagos, atiende alertas y registra retiros. Consulta las
  entregas en solo lectura (#24).
- **Asesor**: solo su taller (`talleres.asesor_id`). Registra asistencia, arma
  grupos, edita el plan, habilita y revisa hitos, aprueba el plan, registra la
  ficha y cierra la asesoría. Un taller ajeno responde 403 y queda en el
  historial (#11).
- **Alumno**: solo su proyecto. Sube entregas y comprobantes; no marca su
  asistencia (#7). Un alumno RETIRADO ve todo en solo lectura.
- **Administrador**: todo, incluido lo del asesor (Fase A).

## 3. Estados (FSM en `estados.ts`)

- Taller: `ABIERTO_INSCRIPCIONES ⇄ COMPLETO → EN_CURSO → FINALIZADO` (+ `CANCELADO`).
- Sesión: `PROGRAMADA/REPROGRAMADA → REALIZADA | CANCELADA` (REALIZADA al guardar todos los grupos).
- Tesista: `EN_TALLER → PLAN_APROBADO → ASESORIA_CERRADA`; `RETIRADO` desde los dos primeros.
- Hito: `NO_HABILITADO → HABILITADO → ENTREGADO → APROBADO | OBSERVADO → ENTREGADO…`;
  `HABILITADO/OBSERVADO → NO_ENTREGADO` al vencer; `NO_ENTREGADO → HABILITADO`
  con «Habilitar nueva entrega» (solo hitos no fijos, con fecha nueva).
  El plan no se aprueba con «Conforme»: requiere D3.
- Versión de entrega: `ENTREGADA → CONFORME | OBSERVADA` (no se editan ni borran).
- Pensión: `PENDIENTE → EN_REVISION → VALIDADA | OBSERVADA`, `PENDIENTE → VENCIDA`, pago directo desde pendiente, vencida u observada.
- Ficha: `SIN_REVISION → REVISADO → FIRMADO`; modificar un firmado exige motivo y vuelve a REVISADO.
- Alerta: `ACTIVA → ATENDIDA | DESCARTADA` (descartar exige motivo).

## 4. Integración con Titulación

- **D3 Aprobar plan** reutiliza `InscribirPlanUseCase` → `ValidarInscripcionUseCase`
  → `GenerarDocumentosUseCase(E1)` (Anexo 18). El proyecto queda vinculado al
  expediente (`proyectos_taller.expediente_id`).
- **Cierre de asesoría (P13)**: el Informe de Conformidad firmado (Anexo 21) se
  adjunta al expediente como `ACTA_CONFORMIDAD` (checklist E2) y la similitud
  preliminar queda en `expedientes.metadata.tallerCierre`, con registro en la
  cadena de auditoría del expediente. El seguimiento **no** se adelanta: la
  Etapa 5 (originalidad) sigue sus propias reglas de avance.
- **Inscripción validada**: `VerificadorInscripcion` (hoy: usuario TESISTA
  activo). El módulo de obtención de datos debe reemplazarlo y llamar a la
  operación `asignar` de D1 al validar una inscripción por la vía Taller.

## 5. Proceso diario (pg-boss `estados-taller`, 00:10 Lima)

`procesoDiarioTaller()` en `talleres/use-cases/estados-taller.job.ts`:

1. Talleres abiertos o completos pasan a EN_CURSO en su fecha de inicio.
2. Pensiones PENDIENTE con fecha pasada → VENCIDA (con aviso); aviso N días
   antes del vencimiento (`diasAvisoPension`). Un alumno retirado no acumula
   vencimientos ni avisos.
3. Hitos HABILITADO/OBSERVADO vencidos → NO_ENTREGADO, con alerta
   PLAN_NO_PRESENTADO o AVANCE_INCUMPLIDO y avisos.
4. Talleres EN_CURSO pasan a FINALIZADO el día siguiente a su fecha de fin.
5. Reportes programados (lunes tras la semana 2, cada avance y la semana 12):
   aviso a la Secretaría con un resumen y el enlace de descarga; queda en el
   historial y no se repite (se pone al día dentro de 7 días).

Al arrancar la API se corre una vez sin el aviso previo de pensiones.

## 6. Decisiones sobre lo «POR CONFIRMAR»

Todo lo que la especificación dejó por confirmar quedó resuelto con un valor
recomendado; cada parámetro muestra su motivo en P16 y la Unidad puede
cambiarlo sin desplegar (`DEFINICION_PARAMETROS_TALLER.decision`).

| Parámetro | Valor | Motivo |
|---|---|---|
| Cupo de proyectos | 15 | Spec v1.0 §3 prevalece sobre la guía del asesor (12) |
| Justificada cuenta como asistencia / corta la racha | Sí / Sí | No castiga una inasistencia justificada |
| Asistencia baja | < 70 % | Asistencia mínima habitual en la UNSA |
| Aviso de pensión | 3 días antes | Tiempo para pagar sin avisos de más |
| Tamaño de una entrega | 20 MB | Una tesis en Word con figuras suele pasar de 5 MB |
| Entregas fuera de plazo | No | El hito queda NO ENTREGADO y el asesor puede habilitar una nueva entrega |
| Advertencias de D3 bloquean | No | El asesor decide; la Secretaría gestiona el retiro |
| Retiro libera cupo | No | Con el taller en curso ya no entran alumnos (si se activa, un COMPLETO se reabre) |
| Mínimo de respuestas de la encuesta | 5 | Con menos se podría identificar a quien respondió |
| Calendario incompleto bloquea | No | El contador avisa; los feriados pueden dejar menos sesiones |

Otras decisiones:

- **Anexo 1 y Anexo 21**: se generan en el formato institucional del sistema
  (encabezado UNSA/FIPS, pie con código y plantilla). El Anexo 1 es una tabla
  con las 6 revisiones y columnas de firma; los reportes también salen en tabla.
  Si la Unidad entrega una plantilla oficial distinta, solo cambia el armado
  del documento en `ficha-cierre.service.ts`.
- **Anexo 21 = «Acta de conformidad de tesis»** (checklist E2): al cerrar la
  asesoría el informe firmado se adjunta como `ACTA_CONFORMIDAD`.
- **Avisos a la Secretaría**: a todos los usuarios activos cuyo rol tiene el
  permiso `taller.crear` (se resuelve por permiso, no por nombre de rol).
- **Encuesta**: 4 preguntas de escala 1–5 y comentario opcional (mockup P14);
  se editan en la tabla `encuesta_preguntas`.
- **Inscripción validada**: hasta que exista el módulo de obtención de datos,
  basta con un usuario TESISTA activo (`VerificadorInscripcion`).

## 7. Pruebas

- Dominio: `packages/domain/__tests__/taller-v1-*.spec.ts`.
- API e2e (CI): `taller-configuracion`, `asesores`, `talleres.api`,
  `proyectos.api`, `taller-seguimiento` (aceptación #12–#23). Requieren una
  base recién sembrada (`make setup`).
- Interfaz (CI): `taller-ui.spec.ts` (#7, #11, #18/#19, #24), contra la web
  (`E2E_BASE_URL=http://localhost:5173`), después de la suite de API.
- Paridad de producción: `make prod-local` (o `PROD_PORT=8088` si el 80 está
  ocupado) sirve las descargas nuevas por Nginx con `X-Accel-Redirect`.
