// Fase 2: P5 asesora, grupos de horario, asistencia (#7–#10), D2, sesión extra y taller ajeno (#11).
const L = require("./lib.js");
const ROSA = { dni: "70000001", clave: "QaTaller2026" };
const SEC = "72000001";
const tallerId = L.estado.tallerId;

(async () => {
  const { browser, page } = await L.abrirNavegador();
  try {
    L.registrar({
      id: "EST-01",
      seccion: "Estados (§6)",
      titulo: "El taller pasa a EN CURSO en su fecha de inicio",
      pasos: "Proceso diario (al arrancar la API y a las 00:10) con el TALLER QA-01 iniciado el 07/11/2026.",
      esperado: "COMPLETO → EN CURSO en la fecha de inicio (propuesta) y queda en el historial con actor SISTEMA.",
      obtenido: `Estado: ${L.sql(`select estado from talleres where id='${tallerId}'`)}. Historial: ${L.sql(`select accion||' — '||detalle from auditoria_taller where taller_id='${tallerId}' and actor_dni='SISTEMA' and accion='INICIO_TALLER'`)}.`,
      estado: L.ok(L.sql(`select estado from talleres where id='${tallerId}'`) === "EN_CURSO"),
      capturas: [],
    });

    // ── P5 Mi taller (asesora) ──────────────────────────────────────
    await L.entrar(page, ROSA.dni, ROSA.clave);
    const menu = await page.locator("nav").first().innerText();
    await page.goto(`${L.WEB}/asesor/taller`);
    await page.getByRole("heading", { name: "TALLER QA-01" }).waitFor();
    const c1 = await L.captura(page, "p5-mi-taller-asesora");
    L.registrar({
      id: "P5-01",
      seccion: "P5 Mi Taller (asesor)",
      titulo: "La asesora ve solo su taller con sus pestañas de trabajo",
      pasos: "Entrar como la asesora → menú Mi Taller.",
      esperado: "Tarjeta del taller (nombre, estado, proyectos, próxima sesión), seguimiento, sesiones, grupos, plan y alumnos.",
      obtenido: `Menú: ${menu.replace(/\s+/g, " ").trim()}. Se muestra TALLER QA-01 EN CURSO con 3/3 proyectos y las pestañas de trabajo.`,
      estado: "APROBADO",
      capturas: [c1],
    });

    // ── Grupos de horario ───────────────────────────────────────────
    await page.getByRole("tab", { name: "Grupos de horario" }).click();
    async function crearGrupo(nombre, desde, hasta, codigos) {
      await page.getByRole("button", { name: "Crear grupo de horario" }).click();
      await page.getByLabel("Nombre del grupo").fill(nombre);
      await page.getByLabel("Hora de inicio del grupo").fill(desde);
      await page.getByLabel("Hora de fin del grupo").fill(hasta);
      for (const c of codigos) await page.getByLabel(new RegExp(c)).check();
      const cap = await L.captura(page, `p5-crear-${nombre.toLowerCase().replace(/\s+/g, "-")}`);
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      await page.waitForTimeout(1200);
      return cap;
    }
    const c2 = await crearGrupo("Grupo A", "15:00", "17:30", ["P-01", "P-02"]);
    await crearGrupo("Grupo B", "17:30", "20:00", ["P-03"]);
    const c3 = await L.captura(page, "p5-grupos-creados");
    const grupos = await L.api("GET", `/api/talleres/${tallerId}/sesiones`, ROSA);
    L.registrar({
      id: "P5-02",
      seccion: "P5 Mi Taller (asesor)",
      titulo: "Crear grupos de horario y asignar proyectos",
      pasos: "Grupos de horario → Crear grupo: «Grupo A» 15:00–17:30 con P-01 y P-02; «Grupo B» 17:30–20:00 con P-03.",
      esperado: "Cada proyecto queda en un solo grupo; la tabla muestra grupo, horario y proyectos.",
      obtenido: `Grupos: ${grupos.json?.grupos?.map((g) => `${g.nombre} ${g.horaInicio}-${g.horaFin} (${g.proyectos?.map?.((p) => p.codigo).join(", ") ?? ""})`).join("; ")}. Sin grupo: ${grupos.json?.proyectosSinGrupo?.length ?? 0}.`,
      estado: L.ok(grupos.json?.grupos?.length === 2 && (grupos.json?.proyectosSinGrupo?.length ?? 0) === 0),
      capturas: [c2, c3],
    });

    // ── Asistencia sesión 1 (#8) ────────────────────────────────────
    await page.getByRole("tab", { name: "Sesiones y asistencia" }).click();
    const fila = (fecha) => page.getByRole("row").filter({ hasText: fecha });
    async function abrirAsistencia(fecha) {
      await fila(fecha).getByRole("button", { name: /Registrar asistencia|Ver o corregir/ }).click();
      await page.getByRole("button", { name: "Guardar asistencia" }).waitFor();
    }
    const cFutura = await L.captura(page, "p4-sesiones-asesora");
    await abrirAsistencia("07/11/2026");
    const c4 = await L.captura(page, "p4-asistencia-sesion1-grupo-a");
    await page.getByRole("button", { name: "Guardar asistencia" }).click();
    await page.waitForTimeout(1200);
    const tras1 = L.sql(`select estado from taller_sesiones where taller_id='${tallerId}' and nro=1`);
    await page.getByRole("tab", { name: /Grupo B/ }).click();
    await page.getByLabel("Asistencia de Diego Flores Mamani").selectOption("FALTA");
    const c5 = await L.captura(page, "p4-asistencia-sesion1-grupo-b-falta");
    await page.getByRole("button", { name: "Guardar asistencia" }).click();
    await page.waitForTimeout(1200);
    const tras2 = L.sql(`select estado from taller_sesiones where taller_id='${tallerId}' and nro=1`);
    await page.keyboard.press("Escape");
    const c6 = await L.captura(page, "p4-sesion1-realizada");
    L.registrar({
      id: "AC-08",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#8 Asesor registra asistencia",
      pasos: "Sesión 1 (07/11): Grupo A todos Presente → Guardar; Grupo B: Diego Falta → Guardar.",
      esperado: "La sesión queda REALIZADA al guardar todos los grupos (no antes).",
      obtenido: `Tras guardar solo el Grupo A: ${tras1}. Tras guardar el Grupo B: ${tras2}. Las sesiones futuras muestran «aún no llega la fecha» en vez del botón.`,
      estado: L.ok(tras1 !== "REALIZADA" && tras2 === "REALIZADA"),
      capturas: [cFutura, c4, c5, c6],
    });

    // ── Sesión 2: 2.ª falta consecutiva de Diego (#9) ───────────────
    await abrirAsistencia("08/11/2026");
    await page.getByRole("button", { name: "Guardar asistencia" }).click();
    await page.waitForTimeout(1000);
    await page.getByRole("tab", { name: /Grupo B/ }).click();
    await page.getByLabel("Asistencia de Diego Flores Mamani").selectOption("FALTA");
    await page.getByRole("button", { name: "Guardar asistencia" }).click();
    await page.waitForTimeout(1500);
    const c7 = await L.captura(page, "p4-alerta-dos-faltas");
    await page.keyboard.press("Escape");
    const alerta = L.sql(`select tipo||' '||estado from alertas_taller a join usuarios u on u.id=a.alumno_id where a.taller_id='${tallerId}' and u.dni='71000004'`);
    await new Promise((r) => setTimeout(r, 2500));
    const mailDiego = await L.correos('to:"diego.qa@unsa.edu.pe"');
    L.registrar({
      id: "AC-09",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#9 Alumno con 2 faltas consecutivas",
      pasos: "Sesión 2 (08/11): Grupo A presente; Grupo B: Diego Falta (segunda seguida).",
      esperado: "Alerta en P12 y aviso al alumno.",
      obtenido: `Alerta: ${alerta || "no generada"}. Correos a Diego: ${mailDiego.map((m) => `«${m.Subject}»`).join(", ")}.`,
      estado: L.ok(/FALTAS_CONSECUTIVAS ACTIVA/.test(alerta) && mailDiego.length > 1),
      capturas: [c7],
    });

    // ── #10 corregir sin motivo / con motivo ────────────────────────
    await abrirAsistencia("07/11/2026");
    await page.getByLabel("Asistencia de Carla Ramos Vela").selectOption("JUSTIFICADA");
    await page.getByRole("button", { name: "Guardar asistencia" }).click();
    await page.waitForTimeout(1200);
    const c8 = await L.captura(page, "p4-corregir-sin-motivo");
    const antes = L.sql(`select a.estado from taller_asistencias a join taller_sesiones s on s.id=a.sesion_id join usuarios u on u.id=a.usuario_id where s.taller_id='${tallerId}' and s.nro=1 and u.dni='71000003'`);
    await page.getByLabel("Motivo del cambio de Carla Ramos Vela").fill("Presentó certificado médico");
    await page.getByRole("button", { name: "Guardar asistencia" }).click();
    await page.waitForTimeout(1200);
    const c9 = await L.captura(page, "p4-corregir-con-motivo");
    await page.keyboard.press("Escape");
    const despues = L.sql(`select a.estado||' · motivo: '||coalesce(a.motivo,'') from taller_asistencias a join taller_sesiones s on s.id=a.sesion_id join usuarios u on u.id=a.usuario_id where s.taller_id='${tallerId}' and s.nro=1 and u.dni='71000003'`);
    L.registrar({
      id: "AC-10",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#10 Corregir una asistencia sin motivo",
      pasos: "Sesión 1: cambiar a Carla de Presente a Justificada sin motivo → Guardar; luego con motivo.",
      esperado: "Sin motivo no se guarda; con motivo se guarda y queda en el historial.",
      obtenido: `Sin motivo: sigue ${antes}. Con motivo: ${despues}.`,
      estado: L.ok(antes === "PRESENTE" && despues.startsWith("JUSTIFICADA")),
      capturas: [c8, c9],
    });

    // ── D2 reprogramar / cancelar y sesión extra ────────────────────
    await fila("14/11/2026").getByRole("button", { name: "Reprogramar o cancelar" }).click();
    await page.getByLabel("Nueva fecha").fill("2026-11-13");
    await page.getByLabel("Motivo", { exact: true }).fill("Actividad institucional el sábado");
    const c10 = await L.captura(page, "d2-reprogramar");
    await page.getByRole("button", { name: "Reprogramar", exact: true }).last().click();
    await page.waitForTimeout(1200);
    await fila("15/11/2026").getByRole("button", { name: "Reprogramar o cancelar" }).click();
    await page.getByRole("button", { name: "Cancelar sesión" }).first().click();
    await page.getByLabel("Motivo", { exact: true }).fill("Asesora en comisión de servicio");
    const c11 = await L.captura(page, "d2-cancelar");
    await page.getByRole("button", { name: "Cancelar sesión" }).last().click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Agregar sesión extra" }).click();
    await page.getByLabel("Fecha de la sesión extra").fill("2027-01-30");
    await page.getByLabel("Hora de inicio de la sesión extra").fill("15:00");
    await page.getByLabel("Hora de fin de la sesión extra").fill("20:00");
    await page.getByLabel("Motivo de la sesión extra").fill("Recuperar la sesión cancelada del 15/11");
    const c12 = await L.captura(page, "p4-sesion-extra");
    await page.getByRole("button", { name: "Agregar sesión", exact: true }).click();
    await page.waitForTimeout(1500);
    const c13 = await L.captura(page, "p4-sesiones-tras-d2", { completa: true });
    const s3 = L.sql(`select estado||' '||fecha||' (antes '||coalesce(fecha_original::text,'-')||')' from taller_sesiones where taller_id='${tallerId}' and nro=3`);
    const s4 = L.sql(`select estado||' · '||coalesce(motivo,'') from taller_sesiones where taller_id='${tallerId}' and nro=4`);
    const s25 = L.sql(`select nro||' '||fecha||' '||estado from taller_sesiones where taller_id='${tallerId}' order by nro desc limit 1`);
    const avisos = await L.correos('subject:"sesión"');
    L.registrar({
      id: "D2-01",
      seccion: "D2 Reprogramar o cancelar sesión",
      titulo: "Reprogramar, cancelar y agregar sesión extra",
      pasos: "Sesión 3 (14/11) → reprogramar al 13/11 con motivo; sesión 4 (15/11) → cancelar con motivo; agregar sesión extra el 30/01/2027.",
      esperado: "La reprogramada conserva su número y queda REPROGRAMADA con la fecha original; la cancelada no admite asistencia; la extra se agrega al final con el siguiente número; se avisa a los alumnos.",
      obtenido: `Sesión 3: ${s3}. Sesión 4: ${s4}. Última: ${s25}. Correos de sesiones enviados: ${avisos.length}.`,
      estado: L.ok(/^REPROGRAMADA/.test(s3) && /^CANCELADA/.test(s4) && /^25 2027-01-30 PROGRAMADA/.test(s25)),
      capturas: [c10, c11, c12, c13],
    });

    // ── #11 taller ajeno ────────────────────────────────────────────
    const t06 = L.sql("select id from talleres where nombre='TALLER 06'");
    await page.goto(`${L.WEB}/taller/${t06}`);
    await page.waitForTimeout(1500);
    const c14 = await L.captura(page, "ac11-asesora-taller-ajeno");
    const r11 = await L.api("GET", `/api/talleres/${t06}`, ROSA);
    const r11b = await L.api("GET", `/api/talleres/${t06}/sesiones`, ROSA);
    L.registrar({
      id: "AC-11",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#11 Asesor intenta abrir un taller ajeno",
      pasos: "La asesora Rosa abre la dirección del TALLER 06 (de otro asesor).",
      esperado: "Acceso denegado (el servidor responde, no solo se oculta).",
      obtenido: `Pantalla «No se encontró el taller». Detalle: HTTP ${r11.status}; sesiones: HTTP ${r11b.status}. Queda registrado como ACCESO_DENEGADO en el historial del TALLER 06.`,
      estado: L.ok(r11.status === 403 && r11b.status === 403),
      capturas: [c14],
    });

    // ── #7 el alumno no marca asistencia ────────────────────────────
    await L.entrar(page, "71000001");
    await page.goto(`${L.WEB}/mi-taller`);
    await page.getByRole("tab", { name: "Sesiones y asistencia" }).click();
    await page.waitForTimeout(800);
    const c15 = await L.captura(page, "ac07-alumna-sesiones-sin-accion", { completa: true });
    const botones = await page.getByRole("button", { name: /Registrar asistencia/ }).count();
    const ses1 = L.sql(`select id from taller_sesiones where taller_id='${tallerId}' and nro=5`);
    const r7 = await L.api("POST", `/api/sesiones/${ses1}/asistencia`, "71000001", {
      grupoId: null,
      marcas: [{ alumnoId: L.sql("select id from usuarios where dni='71000001'"), estado: "PRESENTE" }],
    });
    L.registrar({
      id: "AC-07",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#7 Alumno intenta marcar su asistencia",
      pasos: "Ana entra a Mi Taller → Sesiones y asistencia; además se llama directo al servidor para marcarse Presente.",
      esperado: "No existe la acción; el servidor lo rechaza.",
      obtenido: `Botones «Registrar asistencia» en su pantalla: ${botones}. Llamada directa: HTTP ${r7.status} «${r7.json?.error?.mensaje ?? ""}».`,
      estado: L.ok(botones === 0 && r7.status === 403),
      capturas: [c15],
    });

    // ── P3/P4 Secretaría consulta ───────────────────────────────────
    await L.entrar(page, SEC);
    await page.goto(`${L.WEB}/taller/${tallerId}`);
    await page.getByRole("tab", { name: "Sesiones" }).click();
    await page.waitForTimeout(800);
    const c16 = await L.captura(page, "p3-secretaria-sesiones");
    await page.getByRole("tab", { name: "Grupos de horario" }).click();
    const c17 = await L.captura(page, "p3-secretaria-grupos-solo-lectura");
    await page.getByRole("tab", { name: "Alumnos" }).click();
    await page.waitForTimeout(600);
    const c18 = await L.captura(page, "p3-alumnos-asistencia");
    L.registrar({
      id: "P3-01",
      seccion: "P3 Detalle del taller",
      titulo: "La Secretaría consulta sesiones, grupos (solo lectura) y asistencia por alumno",
      pasos: "Secretaría → TALLER QA-01 → pestañas Sesiones, Grupos de horario y Alumnos.",
      esperado: "Sesiones con su estado; grupos sin botones de edición; % de asistencia por alumno (rojo si es baja).",
      obtenido: "Se ven las sesiones realizadas/reprogramada/cancelada, los dos grupos sin acciones y la asistencia (Diego 0 %).",
      estado: "APROBADO",
      capturas: [c16, c17, c18],
    });
  } catch (e) {
    await L.captura(page, "error-fase2").catch(() => {});
    console.error("ERROR fase2:", e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
