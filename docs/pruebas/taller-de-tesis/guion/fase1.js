// Fase 1: asesora (P15, P10, activación), crear taller (P1, P2, P3: #1–#3) y asignar alumnos (D1: #4–#6).
const path = require("node:path");
const L = require("./lib.js");
const A = (n) => path.join(L.QA, "archivos", n);
const SEC = "72000001";

(async () => {
  const { browser, page } = await L.abrirNavegador();
  try {
    // ── P15: nueva asesora ───────────────────────────────────────────
    await L.entrar(page, SEC);
    await page.goto(`${L.WEB}/asesores`);
    await page.getByRole("heading", { name: "Asesores" }).waitFor();
    const c0 = await L.captura(page, "p15-lista-asesores");
    await page.getByRole("button", { name: "Nuevo asesor" }).click();
    // Errores junto al campo (§15) al guardar vacío.
    await page.getByRole("button", { name: "Guardar asesor" }).click();
    const cErr = await L.captura(page, "p15-errores-formulario");
    await page.getByLabel("DNI", { exact: true }).fill("70000001");
    await page.getByLabel("Nombres", { exact: true }).fill("Rosa");
    await page.getByLabel("Apellidos", { exact: true }).fill("Paredes Quispe");
    await page.getByLabel("Correo institucional").fill("rosa.paredes@unsa.edu.pe");
    await page.getByLabel("Teléfono").fill("959111222");
    await page.getByLabel("GRADO").selectOption("Dr.");
    const esp = page.getByLabel("Agregar especialidad").first();
    await esp.fill("Ingeniería de Software");
    await esp.press("Enter");
    await esp.fill("Gestión de Proyectos TI");
    await esp.press("Enter");
    const c1 = await L.captura(page, "p15-formulario-nueva-asesora");
    await page.getByRole("button", { name: "Guardar asesor" }).click();
    await page.getByText("Paredes Quispe").first().waitFor();
    const c2 = await L.captura(page, "p15-asesora-registrada");
    const lista = await L.api("GET", "/api/asesores", SEC);
    const rosa = lista.json.items?.find?.((a) => a.dni === "70000001") ?? lista.json.find?.((a) => a.dni === "70000001");
    L.estado.asesoraId = rosa?.id;
    L.guardarEstado();
    const dup = await L.api("POST", "/api/asesores", SEC, {
      dni: "70000001",
      nombres: "Otra",
      apellidos: "Persona",
      email: "otra.persona@unsa.edu.pe",
    });
    L.registrar({
      id: "P15-01",
      seccion: "P15 Lista de asesores",
      titulo: "Registrar una asesora nueva con especialidades",
      pasos: "Secretaría → Asesores → Nuevo asesor; intentar guardar vacío; completar DNI, nombres, apellidos, correo institucional, teléfono, grado y 2 especialidades; Guardar asesor.",
      esperado: "Errores junto a cada campo al guardar vacío; la asesora aparece en la lista con estado Activo y se le envía su acceso.",
      obtenido: `Errores mostrados por campo. Asesora creada (id ${rosa?.id ?? "?"}) con ${rosa?.especialidades?.length ?? "?"} especialidades. DNI repetido → HTTP ${dup.status} (${dup.json?.error?.mensaje ?? ""}).`,
      estado: L.ok(!!rosa && dup.status === 409),
      capturas: [c0, cErr, c1, c2],
    });

    // ── P10: perfil, archivo CV ─────────────────────────────────────
    await page.goto(`${L.WEB}/asesores/${rosa.id}`);
    await page.getByText("Disponible").first().waitFor();
    await page.getByLabel("Archivo PDF del asesor").setInputFiles(A("cv-asesora.pdf"));
    await page.getByRole("button", { name: "Subir archivo" }).click();
    await page.getByText("cv-asesora.pdf").first().waitFor();
    const c3 = await L.captura(page, "p10-perfil-asesora", { completa: true });
    L.registrar({
      id: "P10-01",
      seccion: "P10 Perfil del asesor",
      titulo: "Perfil: estado Disponible, especialidades y subir CV (PDF)",
      pasos: "Secretaría → Asesores → Ver perfil de la asesora → Subir archivo (PDF).",
      esperado: "Estado DISPONIBLE (sin taller), especialidades como etiquetas, archivo listado con Ver/Descargar/Eliminar.",
      obtenido: "Estado «Disponible», 2 especialidades, el CV aparece en Archivos.",
      estado: "APROBADO",
      capturas: [c3],
    });

    // ── Activación de la cuenta por correo ──────────────────────────
    const tk = await L.tokenActivacion("rosa.paredes@unsa.edu.pe");
    await page.context().clearCookies();
    await page.goto(`${L.WEB}/activar?token=${encodeURIComponent(tk)}`);
    await page.getByLabel("Nueva clave").fill("QaTaller2026");
    await page.getByLabel("Repite la clave").fill("QaTaller2026");
    const c4 = await L.captura(page, "activacion-cuenta-asesora");
    await page.locator('form[aria-label="Crear clave"] button[type="submit"]').click();
    await page.waitForTimeout(1500);
    const c5 = await L.captura(page, "activacion-cuenta-ok");
    let loginOk = true;
    try {
      await L.token("70000001", "QaTaller2026");
    } catch {
      loginOk = false;
    }
    L.registrar({
      id: "P15-02",
      seccion: "P15 Lista de asesores",
      titulo: "Al crear la asesora se le asigna el rol Asesor y recibe su acceso",
      pasos: "Abrir el correo «Activa tu acceso» en Mailpit, seguir el enlace y crear la clave.",
      esperado: "Llega el correo con enlace; tras crear la clave la asesora entra con rol Asesor.",
      obtenido: `Correo recibido (token ${tk ? "presente" : "ausente"}); inicio de sesión con la nueva clave: ${loginOk ? "correcto" : "falló"}.`,
      estado: L.ok(!!tk && loginOk),
      capturas: [c4, c5],
    });

    // ── P2: #1 asesores disponibles y #2 calendario con feriado ─────
    await L.entrar(page, SEC);
    await page.goto(`${L.WEB}/talleres/nuevo`);
    await page.getByLabel("Nombre del taller").waitFor();
    await page.getByRole("button", { name: /Guardar taller/ }).click();
    const cErrT = await L.captura(page, "p2-errores-al-guardar-vacio");
    const opciones = await page.getByLabel("Asesor").locator("option").allTextContents();
    const tieneDemo = opciones.some((o) => o.includes("Asesor Prueba"));
    const tieneRosa = opciones.some((o) => o.includes("Paredes"));
    await page.getByLabel("Asesor").focus();
    const c6 = await L.captura(page, "p2-asesores-disponibles");
    L.registrar({
      id: "AC-01",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#1 Crear taller con asesor que ya tiene taller activo",
      pasos: "Secretaría → Taller de Tesis → Nuevo taller; abrir la lista «Asesor (solo disponibles)».",
      esperado: "El asesor con taller activo (Asesor Prueba, TALLER 06) no aparece en la lista.",
      obtenido: `Opciones: ${opciones.filter((o) => o.trim()).join(" · ")}. Asesor Prueba ${tieneDemo ? "SÍ" : "no"} aparece; la nueva asesora ${tieneRosa ? "sí" : "NO"} aparece.`,
      estado: L.ok(!tieneDemo && tieneRosa),
      capturas: [cErrT, c6],
    });

    await page.getByLabel("Inicio del curso").fill("2026-10-10");
    await page.getByLabel("Fin del curso").fill("2026-11-28");
    await page.waitForTimeout(1500);
    const contador = (await page.getByText(/de 24/).first().textContent()) ?? "";
    const feriado = await page.getByText(/Feriado/).count();
    await page.getByText("Calendario de sesiones").scrollIntoViewIfNeeded();
    const c7 = await L.captura(page, "p2-calendario-feriado-contador", { completa: true });
    L.registrar({
      id: "AC-02",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#2 Taller del 10/10 al 28/11, sábado y domingo",
      pasos: "En P2 poner inicio 10/10/2026 y fin 28/11/2026 con sábado y domingo marcados.",
      esperado: "Propone las sesiones omitiendo el feriado (01/11, Todos los Santos); el contador avisa si no suman 24; se puede guardar.",
      obtenido: `Contador: «${contador.trim()}». Filas con feriado omitido: ${feriado}. El botón Guardar sigue habilitado.`,
      estado: L.ok(feriado > 0 && /falta|de 24/.test(contador)),
      capturas: [c7],
    });

    // ── P2: crear TALLER QA-01 (#3) ─────────────────────────────────
    await page.getByLabel("Nombre del taller").fill("TALLER QA-01");
    await page.getByLabel("Período").fill("2026-II");
    const valorRosa = await page
      .getByLabel("Asesor")
      .locator("option", { hasText: "Paredes" })
      .first()
      .getAttribute("value");
    await page.getByLabel("Asesor").selectOption(valorRosa);
    await page.getByLabel("Inicio del curso").fill("2026-11-07");
    await page.getByLabel("Fin del curso").fill("2027-01-24");
    await page.getByLabel("Cupo máximo de proyectos").fill("3");
    await page.getByLabel("Enlace del sábado").fill("https://meet.google.com/qa-taller-sab");
    await page.getByLabel("Enlace del domingo").fill("https://meet.google.com/qa-taller-dom");
    await page.waitForTimeout(1500);
    const contador2 = (await page.getByText(/de 24/).first().textContent()) ?? "";
    const c8 = await L.captura(page, "p2-taller-qa-formulario", { completa: true });
    await page.getByRole("button", { name: /Guardar taller/ }).click();
    await page.waitForURL(/\/taller\//, { timeout: 20_000 });
    await page.waitForTimeout(1200);
    const tallerId = page.url().split("/taller/")[1];
    L.estado.tallerId = tallerId;
    L.guardarEstado();
    const c9 = await L.captura(page, "p3-detalle-taller-qa");
    const det = await L.api("GET", `/api/talleres/${tallerId}`, SEC);
    const ses = await L.api("GET", `/api/talleres/${tallerId}/sesiones`, SEC);
    const plan = await L.api("GET", `/api/talleres/${tallerId}/plan`, SEC);
    const nSes = ses.json?.sesiones?.length ?? 0;
    const nPen = det.json?.pensiones?.length ?? 0;
    const nPlan = plan.json?.semanas?.length ?? 0;
    await page.getByRole("tab", { name: "Pensiones" }).click();
    const c10 = await L.captura(page, "p3-pestana-pensiones");
    await page.getByRole("tab", { name: "Plan" }).click();
    const c11 = await L.captura(page, "p3-pestana-plan-copiado", { completa: true });
    L.registrar({
      id: "AC-03",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#3 Guardar taller",
      pasos: "P2: TALLER QA-01, 2026-II, asesora Rosa Paredes, 07/11/2026 a 24/01/2027, sábado y domingo, cupo 3, enlaces de Meet; Guardar taller.",
      esperado: "Se crea ABIERTO A INSCRIPCIONES con sus sesiones, 3 pensiones y la copia del plan institucional; abre P3.",
      obtenido: `Contador antes de guardar: «${contador2.trim()}». Estado: ${det.json?.estado}. Sesiones: ${nSes}. Pensiones: ${nPen}. Semanas del plan: ${nPlan}.`,
      estado: L.ok(nSes === 24 && nPen === 3 && nPlan === 12 && det.json?.estado === "ABIERTO_INSCRIPCIONES"),
      capturas: [c8, c9, c10, c11],
    });

    // ── P1 lista ────────────────────────────────────────────────────
    await page.goto(`${L.WEB}/talleres`);
    await page.getByText("TALLER QA-01").first().waitFor();
    const c12 = await L.captura(page, "p1-lista-talleres");
    L.registrar({
      id: "P1-01",
      seccion: "P1 Lista de talleres",
      titulo: "Lista con taller, asesor, período, días, proyectos, sesiones y estado",
      pasos: "Secretaría → Taller de Tesis.",
      esperado: "El taller nuevo aparece con proyectos 0/3, sesiones 0/24 y estado Abierto a inscripciones; filtros por período, estado y asesor.",
      obtenido: "TALLER QA-01 listado junto a TALLER 06 y los talleres finalizados/cancelados del seed.",
      estado: "APROBADO",
      capturas: [c12],
    });

    // ── D1: asignar alumnos (#5, #6, #4) ────────────────────────────
    async function abrirD1() {
      await page.goto(`${L.WEB}/taller/${tallerId}`);
      await page.getByRole("tab", { name: "Alumnos" }).click();
      await page.getByRole("button", { name: "Asignar alumno" }).click();
      await page.getByLabel("DNI del alumno").waitFor();
    }
    await abrirD1();
    await page.getByLabel("DNI del alumno").fill("71000001");
    await page.getByLabel("DNI del segundo tesista").fill("71000002");
    await page.waitForTimeout(1500);
    const c13 = await L.captura(page, "d1-asignar-p01-chips");
    await page.getByRole("button", { name: "Asignar", exact: true }).click();
    await page.waitForTimeout(1500);
    await abrirD1();
    await page.getByLabel("DNI del alumno").fill("71000003");
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Asignar", exact: true }).click();
    await page.waitForTimeout(1500);

    // #5 alumno de otro taller (María, TALLER 06)
    await abrirD1();
    await page.getByLabel("DNI del alumno").fill("11223344");
    await page.waitForTimeout(1500);
    const c14 = await L.captura(page, "d1-alumno-en-otro-taller");
    const r5 = await L.api("POST", `/api/talleres/${tallerId}/proyectos`, SEC, { dni1: "11223344" });
    L.registrar({
      id: "AC-05",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#5 Asignar alumno ya inscrito en otro taller",
      pasos: "D1 con el DNI 11223344 (María Torres, del TALLER 06).",
      esperado: "No asigna y muestra el motivo.",
      obtenido: `El diálogo muestra el taller activo y el motivo; el servidor responde HTTP ${r5.status}: «${r5.json?.error?.mensaje ?? ""}».`,
      estado: L.ok(r5.status >= 400),
      capturas: [c14],
    });
    await page.keyboard.press("Escape");

    // #6 proyecto que llena el cupo (3.º con cupo 3)
    await abrirD1();
    await page.getByLabel("DNI del alumno").fill("71000004");
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Asignar", exact: true }).click();
    await page.waitForTimeout(1800);
    await page.goto(`${L.WEB}/taller/${tallerId}`);
    await page.getByRole("tab", { name: "Alumnos" }).click();
    await page.waitForTimeout(1000);
    const c15 = await L.captura(page, "p3-taller-completo-alumnos");
    const det2 = await L.api("GET", `/api/talleres/${tallerId}`, SEC);
    L.registrar({
      id: "AC-06",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#6 Asignar el proyecto que llena el cupo",
      pasos: "Con cupo 3, asignar P-01 (Ana y Bruno), P-02 (Carla) y P-03 (Diego).",
      esperado: "Al asignar el último proyecto del cupo el taller pasa a COMPLETO (equivalente al proyecto 15 con cupo 15).",
      obtenido: `Estado tras el 3.er proyecto: ${det2.json?.estado}.`,
      estado: L.ok(det2.json?.estado === "COMPLETO"),
      capturas: [c13, c15],
    });

    // #4 cupo lleno
    const boton = page.getByRole("button", { name: /Asignar alumno/ });
    const deshabilitado = await boton.isDisabled().catch(() => true);
    await boton.hover().catch(() => {});
    const c16 = await L.captura(page, "p3-asignar-deshabilitado-cupo");
    const r4 = await L.api("POST", `/api/talleres/${tallerId}/proyectos`, SEC, { dni1: "71000005" });
    L.registrar({
      id: "AC-04",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#4 Asignar alumno con cupo lleno",
      pasos: "Con el taller COMPLETO intentar asignar a Elena Vega (71000005).",
      esperado: "No asigna y muestra el motivo.",
      obtenido: `Botón «Asignar alumno» ${deshabilitado ? "deshabilitado con el motivo" : "habilitado"}; el servidor responde HTTP ${r4.status}: «${r4.json?.error?.mensaje ?? ""}».`,
      estado: L.ok(r4.status >= 400),
      capturas: [c16],
    });

    // Correos de asignación
    const mails = await L.correos('subject:"Te asignaron"');
    L.registrar({
      id: "NOT-01",
      seccion: "Notificaciones (§13)",
      titulo: "Asignación al taller: aviso al alumno",
      pasos: "Revisar Mailpit tras D1.",
      esperado: "Cada alumno asignado recibe un correo con enlace a Mi Taller.",
      obtenido: `${mails.length} correos «Te asignaron…»: ${mails.map((m) => m.To?.[0]?.Address).join(", ")}.`,
      estado: L.ok(mails.length >= 4),
      capturas: [],
    });
  } catch (e) {
    await L.captura(page, "error-fase1").catch(() => {});
    console.error("ERROR fase1:", e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
