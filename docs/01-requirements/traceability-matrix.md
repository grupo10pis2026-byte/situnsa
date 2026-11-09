# Matriz de Trazabilidad — Etapa Legal ↔ Mockup ↔ Legacy ↔ RF ↔ UseCase

> Garantiza que ningún requisito legal o del legacy quede huérfano (DoD #4).
> Leyenda: **Taller** = `3EB08E…TALLER TITULACION USE FIPS.pdf` (§),
> **HU** = `3EB06D…Historias de usuario_1.pdf`, **UI** = `3EB0EC…INTERFACES (1)_1.pdf` (§),
> **ENT** = entrevista Sep-2026, **LEG** = `legacy-code/`.

## 1. Trazabilidad principal (etapas)

| Etapa legal (Taller/ENT) | Pantalla (UI) | Módulo Legacy (LEG) | RF ID | Use Case técnico |
|---|---|---|---|---|
| Vías de ingreso regular/taller + inscripción, grupos, pensiones (Taller §2–8; ENT Carlos) | §10 Nuevo Expediente, §11 Taller, §12 Validación, §13 Asesores | `05_Domain_Expediente.js`, `TallerTesis.js`, `PortalAlumno.js`, `Invitados.js`, `93/94_BD_Portal/Auto*`, `BD1: talleres/matrículas/sesiones/pagos` | RF-01 (inscripción plan; base de expediente) | `RegistrarExpedienteUseCase`, `ValidarInscripcionUseCase` |
| Módulo Gestión del Taller de Tesis v1.0 (P1–P16, D1–D3; detalle en [taller-de-tesis.md](../02-domain/taller-de-tesis.md)) | §11 Taller, P1–P16 | `TallerTesis.js`, `PortalAlumno.js` | RF-01 (vía taller) | `CrearTallerUseCase`, `AsignarProyectoUseCase`, `GuardarAsistenciaUseCase`, `AprobarPlanUseCase`, `SubirInformeFirmadoUseCase` |
| E1 Verificación Inicial: plan, terna 5 d.h., decreto (Taller §13; ENT) | §7 Documentos Etapa 01, §6 Detalle-Datos | `FLUJO_TITULACION[1]`, `WorkflowEtapas.finalizarSubetapa/EtapaWorkflowV3`, `97/99_BD_Caratula*`, `DocumentosEtapas (ETAPA01)` | **RF-01 + RF-02** | `RegistrarPlanUseCase`, `EvaluarPlanUseCase` |
| E2 Borrador: A8, A27, constancias, foto JPG (ENT; Taller §23) | §8 Documentos Etapa 02, §6 Detalle | `FLUJO_TITULACION[2]`, `ChecklistEtapa2 (asegurar/validar…)`, `ArchivosSubetapas.js` | **RF-03** | `PresentarBorradorUseCase` |
| E3 Evaluación: sorteo grabado, resolución decanal, 20 d.h., dictámenes (ENT) | §9 Resumen/Historial, §6 Detalle-jurados | `FLUJO_TITULACION[3]`, `confirmarPresentacionInicial`, cols `PRESIDENTE_02/SECRETARIO_02/SUPLENTE_02/DECANAL` | **RF-04** | `DictaminarBorradorUseCase` |
| E4 Sustentación: rango fechas, citación ≥1 sem, acta (ENT) | §6 Detalle-sustentación, §9 Historial | `FLUJO_TITULACION[4]`, `81_BD_AgendaWorkflowV17.js`, cols `FECHA_ACTAS/HORAS_ACTAS/LUGAR_SUSTENTACION` | **RF-05** | `ProgramarSustentacionUseCase`, `RegistrarActaUseCase` |
| E5 Turnitin <20 %, informe UI, repositorio+URL (ENT) | §6 Detalle-validaciones, §9 Historial | `FLUJO_TITULACION[5]` (+ menciones en `03_Model_Repositories`, `02_SOA_Services` — brecha) | **RF-06** | `ValidarSimilitudUseCase`, `RegistrarRepositorioUseCase` |
| E6–E7 Secretaría→…→Consejo→SISGRAD→Decano→CU→colación→SUNEDU (ENT) | §4 Dashboard Admin, §9 Historial | `FLUJO_TITULACION[6][7]` | **RF-07** | `AprobarInstitucionalUseCase`, `EmitirTituloUseCase` |
| Transversal: derivación, historial, notificaciones (Taller §14–15, §27) | §9 Resumen/Historial | `delegarSubetapa`, `enviarCorreo*`, `notificarFinalizacionSubetapaV26`, `HistorialExpedientes.js` | RF-02…RF-07 (salidas) + RNF-04 | `NotificarEventoUseCase`, `RegistrarHistorialUseCase` |
| Transversal: auth/roles/invitados (HU-0001/0003) | §3 Login | `21_Auth*`, `71/72_BD_Auth*`, `90/91/92_BD_Login*`, `93/94_BD_Portal/Auto*` | RNF-01 | `AuthUseCase` (CASL) |
| Transversal: documentos/etiquetas/caratula (Taller §9, §12) | §6 Detalle, §7/§8 Docs | `DocumentosExpedientes.js` (etiquetas), `DocumentosEtapas.js`, `97/99_BD_*` | RF-01…RF-06 | `GenerarDocumentoUseCase` |

## 2. Cobertura de Historias de Usuario (69 HU verificadas una por una contra el PDF — sin inferencias)

| HU | Nombre | RF que la cubre |
|---|---|---|
| HU-0001 | Autenticación de Usuarios | RNF-01 |
| HU-0003 | Gestión de Roles y Permisos | RNF-01 |
| HU-0004 | Distinción de Vía de Ingreso | RF-01 |
| HU-0005 | Expediente con dos participantes | RF-01 |
| HU-0002 | Gestión de Usuarios | RNF-01 |
| HU-0006 | Correlativo único de expediente (SET) | RF-01 |
| HU-0007 | Formulario de inscripción al Taller de Tesis | RF-01 |
| HU-0008 | Revisión y validación de inscripción | RF-01 |
| HU-0009 | Automatización posterior a la validación | RF-01 |
| HU-0011 | Asignación manual a grupo | RF-01 |
| HU-0012 | Asignación de asesor a grupo | RF-01 |
| HU-0013 | Registro del Visto Bueno del asesor (vía correo, sin acceso) | RF-01 / RF-03 |
| HU-0014 | Programación de pensiones del Taller | RF-01 |
| HU-0015 | Registro de pagos y deudores | RF-01 |
| HU-0016 | Creación automática de carpeta digital | RF-01 |
| HU-0017 | Copia automática de plantillas | RF-01 |
| HU-0018 | Inserción automática de datos en plantillas | RF-01 |
| HU-0019 | Validación automática nombre-DNI (tildes) | RF-01 |
| HU-0020 | Carátula con formato institucional fijo | RF-01 |
| HU-0021 | Grado académico exacto del asesor | RF-01 |
| HU-0022 | Administración integral del expediente | RF-01 / RF-02 |
| HU-0023 | Registro directo — Vía Regular | RF-01 |
| HU-0024 | Listado general de expedientes | RF-01 / RNF-04 |
| HU-0025 | Carga de documentos — Etapa 1 | RF-01 |
| HU-0026 | Revisión de conformidad — Etapa 1 (Angela) | RF-02 |
| HU-0027 | Asignación automática de terna | RF-02 |
| HU-0028 | Plazo y alerta de revisión del Plan (3–5 d.h.) | RF-02 |
| HU-0029 | Levantamiento de observaciones — Plan (2–5 d.h.) | RF-02 |
| HU-0030 | Generación de Decreto de aprobación | RF-02 |
| HU-0031 | Carga de documentos — Etapa 2 (13 docs: Anexos 8, 27, 2 y 32…) | RF-03 |
| HU-0032 | Validación de completitud — Etapa 2 (Magnolia/Marietha) | RF-03 |
| HU-0033 | Apoyo en generación de constancias académicas | RF-03 |
| HU-0034 | Recepción y validación previa al sorteo (2–7 d.) | RF-04 |
| HU-0035 | Control de plazo de revisión y observaciones de jurados | RF-04 |
| HU-0036 | Levantamiento de observaciones — Borrador (2–10 d.h.) | RF-04 |
| HU-0037 | Cierre de etapa por conformidad de terna | RF-04 |
| HU-0038 | Propuesta de fechas de sustentación (rango) | RF-05 |
| HU-0039 | Publicación oficial de fecha de sustentación | RF-05 |
| HU-0040 | Carga de versión final de tesis | RF-05 |
| HU-0041 | Registro de resultado de similitud Turnitin (5–20 d.h.) | RF-06 |
| HU-0042 | Regla automática de límite de similitud (20 %) | RF-06 |
| HU-0043 | Registro de la firma del informe de similitud | RF-06 |
| HU-0044 | Registro en Repositorio Institucional + URL (5–15 d.h.) | RF-06 |
| HU-0045 | Informe para Secretaría Académica FIPS | RF-07 |
| HU-0046 | Listado consolidado para Consejo de Facultad | RF-07 |
| HU-0047 | Registro de Resolución de Consejo de Facultad | RF-07 |
| HU-0048 | Registro de carga a SISGRAD | RF-07 |
| HU-0049 | Seguimiento de firma del decano y revisiones finales | RF-07 |
| HU-0050 | Programación de colación y emisión de título | RF-07 |
| HU-0051 | Registro de inscripción en SUNEDU | RF-07 |
| HU-0052 | Etapas y subetapas configurables | RF-02…RF-07 (RN-09) |
| HU-0053 | Bloqueo de avance por subetapas pendientes | RF-02…RF-07 (RN-09) |
| HU-0054 | Derivación de subetapas entre responsables | Transversal (RF-02…RF-07) |
| HU-0055 | Manejo de plazos vencidos en subetapas | `calendar-rules.md` RN-PLZ-07/08 |
| HU-0056 | Consulta de avance — Portal del Alumno | RNF-04 |
| HU-0057 | Documentos filtrados por subetapa activa | RNF-04 (RN-06) |
| HU-0058 | Notificaciones al alumno con enlace directo | RNF-04 |
| HU-0059 | Interfaz simplificada para usuarios mayores | RNF-04 |
| HU-0060 | Consulta de pensiones — Portal del Alumno | RF-01 (vía taller) |
| HU-0061 | Notificaciones automáticas por evento | RNF-04 |
| HU-0062 | Plantilla de correo con enlace y estado | RNF-04 |
| HU-0063 | Registro cronológico de historial | RNF-01 |
| HU-0064 | Consulta de historial por expediente | RNF-01 |
| HU-0065 | Designación de jurados con rol | RF-04 |
| HU-0066 | Registro de resultado y acta de sustentación | RF-05 |
| HU-0067 | Registro de validaciones institucionales independientes | RF-06 / RF-07 |
| HU-0068 | Catálogo de plantillas versionado | RF-01 (RN-L12/L13) |
| HU-0069 | Catálogos reutilizables | RF-01 (RN-L14/L15) |

> Verificación 2026-09-18: las 69 HU (HU-0001–HU-0069, sin huecos) fueron leídas
> en el PDF; no quedan nombres inferidos. Tres HU confirman el patrón de
> **registro delegado**: HU-0013 (Visto Bueno del asesor comunicado por correo),
> HU-0035 (observaciones de jurados sin acceso al sistema) y HU-0043 (firma del
> Director UI sin acceso) — el responsable los registra con evidencia adjunta
> (ver `permissions-matrix.md`).

## 3. Reglas legacy → RF (DoD #2)

| Regla legacy | RF destino | Estado |
|---|---|---|
| RN-L01…RN-L06 (identidad, DNI/CUI texto, grupo 1–2) | RF-01 | ✅ |
| RN-L07…RN-L13 (carátula, etiquetas, dedup, resaltado) | RF-01 (+ RF-06 RN-06.2) | ✅ |
| RN-L14/RN-L15 (13 programas, columnas expediente) | RF-01 | ✅ |
| RN-L16…RN-L20 (7 etapas/38 subetapas, agenda, checklist E2, reaperturas) | RF-02…RF-07, RNF-01 | ✅ |
| RN-L21/RN-L22 (auth hash, DNI/CUI, correos) | RNF-01 (+ RNF-04 notificaciones) | ✅ |
| RN-L23 ( dashboards masivos) | RNF-02 / RNF-04 | ✅ |
| Brechas #1–#5 (días hábiles, Turnitin, Drive, WhatsApp, carátula total) | calendar-rules, RF-06, RNF-01/02/04, RF-01 | ✅ |

## 4. Dolores de entrevista → RF (DoD #3)

| Dolor | Solución RF |
|---|---|
| Errores de carátula (tildes, logo, mayúsculas, grado asesor) | RF-01 RN-01.4 (autogeneración) |
| Analfabetismo digital / egresados antiguos | RNF-04 wizard + RF-01 RN-01.7 |
| Jurados que no revisan / observan en sustentación | RF-04 RN-04.5 (reiteraciones) |
| Coordinación de fechas de sustentación | RF-05 (coordinador de agenda) |
| Correo no leído | RNF-04 multicanal + RF-02/RF-04 reiteraciones |
| Copia/pega entre tesis (coronel) | RF-06 (Turnitin <20 %) |
| Cronograma asesor–tesista incumplido | RF-01 RN-01.6 + state-machine |
| Pagos Yape/caja confusos | RF-03 RN-03.5 + RNF-04 |

Sin huérfanos: 7 etapas → RF-01…RF-07; 69 HU → RF/RNF; 23 reglas legacy → RF;
8 dolores → RF. ✅
