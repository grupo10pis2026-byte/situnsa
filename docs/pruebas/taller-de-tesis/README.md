# Pruebas funcionales — Módulo Gestión del Taller de Tesis

Informe de pruebas contra la *Especificación funcional y guía de implementación v1.0*
(03/11/2026), ejecutado el 09/11/2026 sobre la rama `feat/taller-v1-modelo-dominio`.

| Archivo / carpeta | Contenido |
|---|---|
| `Informe de pruebas - Taller de Tesis.docx` | Informe completo: resumen, datos de prueba, matriz de las 24 pruebas de aceptación, flujo completo, resultados por caso con capturas, observaciones y pendientes |
| `capturas/` | Capturas numeradas en el orden de ejecución |
| `documentos/` | Documentos generados por el sistema: Anexo 1 (inicial y completo), Anexo 21 y reporte quincenal (PDF y Excel) |
| `guion/` | Guion automatizado (Playwright + Edge), archivos de prueba y resultados (`resultados.json`) |

Resultado: 60 casos, 59 aprobados y 1 pendiente por fecha (el paso a FINALIZADO,
verificable después del 24/01/2027). Las 24 pruebas de aceptación del §16 aprobadas.

## Datos de prueba

Los datos quedan en la base local (no se reinició al terminar). Usuarios principales:

| Rol | DNI | Clave |
|---|---|---|
| Secretaría del Taller (RESP_TALLER) | 72000001 | `x` |
| Asesora (TALLER QA-01) | 70000001 | `QaTaller2026` |
| Alumnos QA | 71000001 a 71000005 | `x` |
| Administrador | 00000001 | `x` |

La Secretaría (72000001) y los alumnos QA no están en el seed: se crearon directamente en la
base. Tras `make setup` (o al reiniciar la base) hay que volver a crearlos y ejecutar el
guion desde la fase 1.

## Repetir las pruebas

Requiere la API (`:3001`, con SMTP a Mailpit), la web (`:5173`), Mailpit (`:8025`),
Microsoft Edge y los alumnos QA cargados. Desde `guion/`:

```bash
node fase1.js && node fase2.js && node fase3.js && node fase4.js && node fase5.js && node fase6.js
```

Entre la fase 1 y la 2 hay que reiniciar la API para que el proceso diario pase el taller a
EN CURSO.
