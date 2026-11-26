# Matriz de Permisos ABAC — Actor × Rol × Estado → Acciones

> Actor × Rol × **Estado del expediente** → acciones permitidas.
> Fuentes: Taller §25–26 (roles por subetapa), RN-06/RN-07/RN-08, entrevista (roles
> operativos reales), `legacy-code/21_AuthUsuariosRepositoriesV6.js`,
> `71_BD_AuthHashV13.js` (hash de credenciales), `90_BD_LoginTesistaFixV181.js` /
> `91_BD_LoginCuiConsistencyV182.js` / `93_BD_PortalInvitadoRelacionalV184.js`
> (login tesista/invitado por DNI-CUI), `94_BD_AutoPortalV188.gs.js`.

## 1. Roles del sistema

| Rol | Operador real | Alcance |
|---|---|---|
| `ADMIN_SISTEMA` | (TI / Carlos) | Usuarios, roles, parámetros, catálogos, etapas/subetapas, reaperturas especiales |
| `RESP_TITULACION` | Srta. Angela, Sra. Magnolia (etapas 1–2) | Registro/administración de expedientes, revisión formal, asignación de terna, decretos, derivación, finalización de subetapas |
| `RESP_AREA` | Sra. Magnolia / `fips_usesp@unsa.edu.pe` (etapas 3–7) | Validación administrativa, sorteos, sustentaciones, validaciones institucionales |
| `VALIDADOR_TALLER` | Srta. Angela | Revisión/validación de inscripciones, asignación a grupo |
| `RESP_TALLER` | (coordinación) | Grupos, periodos, asesores, pensiones |
| `ASESOR` | Docentes designados | **Solo** sus grupos/alumnos/expedientes: revisar plan/borrador, observar, Visto Bueno |
| `JURADO` | Terna (E1) / jurados sorteados (E3–E4) | Revisar y dictaminar lo asignado; proponer/confirmar fechas |
| `TESISTA` | Alumno (portal invitado, credenciales DNI/CUI o Google `@unsa.edu.pe`) | Ver su expediente, cargar/subsanar documentos de la **subetapa activa**, proponer rango de fechas, ver pensiones. Antes del expediente: ver **su** solicitud de Mesa de Partes y subsanarla si está observada (cuenta creada al observar, CR-MOD-OBT-002) |
| `AUTORIDAD` | Director Unidad, Decano, Secretaría, Comisión, Consejo, Grados y Títulos | Validaciones/aprobaciones/firmas de su instancia |
| `INVITADO` | Público | Invitación de sustentación (lectura) |

Autenticación: personal con usuario + hash (`BD13_verifyPassword_`, espejo de
credenciales `72_BD_AuthMirrorV13.js`); tesistas/invitados con DNI/CUI por portal
relacional (`BD181_*`, `93_*V184`, `94_*V188`). DNI y CUI siempre **texto**
(`BD188_ASEGURAR_FORMATO_IDENTIFICADORES`, `BD2_COLUMN_TYPES`).

## 2. Matriz (extracto normativo; el resto hereda por defecto-deny)

`✓` permitido · `—` denegado · `(estado)` solo en ese estado/macro-estado.

| Acción | ADMIN | RESP_TIT (E1–E2) | RESP_AREA (E3–E7) | VAL_TALLER | ASESOR | JURADO | TESISTA | AUTORIDAD |
|---|---|---|---|---|---|---|---|---|
| Crear expediente regular / validar inscripción | ✓ | ✓ | — | validar ✓ | — | — | — | — |
| Editar datos personales/académicos | ✓ | ✓ (`REGISTRADO..EN_BORRADOR`) | ✓ (sus etapas) | ✓ (inscripción) | — | — | — (solo sus datos contacto) | — |
| Cargar plan / borrador / subsanación | ✓ | — | — | — | — | — | ✓ (subetapa activa) | — |
| Ver bandeja y detalle de solicitudes (Mesa de Partes) | ✓ | ✓ | ✓ (`reportes.ver`) | ✓ | — | — | — (solo la suya, en «Mi trámite») | ✓ (`reportes.ver`) |
| Subsanar solicitud observada (reemplazar documentos y reenviar) | — | — | — | — | — | — | ✓ (participante vinculado, `OBSERVADA`) | — |
| Revisar plan/borrador y observar | ✓ | — | — | — | ✓ (asignados) | ✓ (asignado) | — | — |
| **Visto Bueno** académico | ✓ | — | — | — | ✓ (asignados) | — | — | — |
| **Aprobar / finalizar subetapa** | ✓ | ✓ (E1–E2) | ✓ (E3–E7) | ✓ (inscripción) | — | — | — | — |
| Asignar terna E1 / designar jurados E3 | ✓ | ✓ (terna) | ✓ (jurados) | — | — | — | — | — (Decano firma resolución) |
| Sortear jurado / registrar resolución | ✓ | — | ✓ | — | — | — | presencia | firma ✓ |
| Proponer rango de fechas | ✓ | — | — | — | — | — | ✓ (`APTO_SUSTENT.`) | — |
| Fijar fecha/hora definitiva | ✓ | — | ✓ | — | confirma | confirma | — | — |
| Registrar acta y veredicto | ✓ | — | ✓ | — | — | ✓ | — | — |
| Enviar/recibir Turnitin OTI, referenciar | ✓ | — | ✓ (`EN_VALIDACION`) | — | — | — | subsana si ≥20 % | — (OTI externo) |
| Firmar informe similitud | ✓ | — | — | — | — | — | — | Director UI ✓ |
| Informe Secretaría / Excel Consejo | ✓ | — | ✓ (`EN_APROBACION`) | — | — | — | — | consejeros marcan XXX |
| Cargar SISGRAD / etnia-lengua | ✓ | — | carga ✓ | — | — | — | etnia/lengua ✓ | — |
| Firma Decano / SUNEDU / colación | ✓ | — | registra ✓ | — | — | — | — | Decano ✓ |
| Derivar subetapa | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| Reabrir etapa / nueva carga autorizada | ✓ (permiso especial) | — | — | — | — | — | — | — |
| Gestionar usuarios/roles/catálogos/plantillas | ✓ | — | — | — | — | — | — | — |
| Consultar historial | ✓ | ✓ (sus etapas) | ✓ (sus etapas) | ✓ | ✓ (asignados) | ✓ (asignado) | ✓ (propio) | ✓ (su instancia) |

Reglas transversales:
- **RN-06**: el tesista solo ve/carga documentos de la **subetapa activa**.
- **RN-07**: el asesor solo ve grupos/alumnos/expedientes **asignados**.
- **RN-08**: Visto Bueno (académico) ≠ aprobación (administrativa); la subetapa solo la
  cierra el responsable (`APROBADA → FINALIZADA`).
- **Registro delegado**: asesor (HU-0013), jurados (HU-0035) y Director UI (HU-0043)
  **no necesitan acceder al sistema**; el responsable registra su pronunciamiento
  (correo/acta como evidencia adjunta) y el sistema lo audita como tal.
- Responsable por defecto: etapas 1–2 → `fips_usesp_aaa@unsa.edu.pe`;
  etapas 3–7 → `fips_usesp@unsa.edu.pe` (`responsableDefectoEtapa`).
- Borrado lógico: `ELIMINADO` conserva la fila y corta visibilidad
  (`86_BD_EliminarExpedienteV176.js`); indietro solo ADMIN.
- Credenciales nunca en claro: hash + espejo (`71/72_BD_Auth*V13.js`).

## 3. Derivación

Cualquier responsable puede derivar sus subetapas a otro usuario del área; queda en
historial + correo al nuevo responsable (`delegarSubetapa`,
`enviarCorreoDerivacionEtapaV23`). Casos típicos: Srta. Angela ↔ Sra. Magnolia ↔
Srta. Marietha según carga.
