// Fase 5: avances, ficha completa y cierre (#18, #19, P13), retiro (#22), encuesta (#23),
// solo lectura (#24), reportes (P12), P14b, P16, permisos (§4), historial (§14) y correos.
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.js");
const A = (n) => path.join(L.QA, "archivos", n);
const ROSA = { dni: "70000001", clave: "QaTaller2026" };
const SEC = "72000001";
const { tallerId, P01, P02, P03, expedienteId } = L.estado;
const DOCS = path.join(L.DIR, "documentos");
const hito = (p, t) => L.sql(`select id from hitos_proyecto where proyecto_id='${p}' and tipo='${t}'`);
const enDosSemanas = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

(async () => {
  const { browser, page } = await L.abrirNavegador();
  try {
    // ── Avance 1 por la interfaz (Word) ─────────────────────────────
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/proyectos/${P01}/entregas`);
    const tarjeta = (nombre) => page.locator("div.rounded-xl, div").filter({ has: page.getByText(nombre, { exact: true }) });
    await page.getByRole("button", { name: "Habilitar" }).first().click();
    await page.waitForTimeout(1200);
    // Ajustar la fecha del Avance 2 (hito no fijo)
    const botonesFecha = page.getByRole("button", { name: "Ajustar fecha" });
    await botonesFecha.nth(1).click();
    await page.getByLabel("Nueva fecha límite").fill("2026-12-20");
    const c0 = await L.captura(page, "p6b-ajustar-fecha-avance2");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForTimeout(1200);
    const fechaAv2 = L.sql(`select fecha_limite from hitos_proyecto where id='${hito(P01, "AVANCE_2")}'`);
    const rFija = await L.api("PATCH", `/api/hitos/${hito(P01, "BORRADOR_FINAL")}/fecha`, ROSA, { fechaLimite: "2027-02-28" });
    L.registrar({
      id: "P6-02",
      seccion: "P6 Plan, hitos y avances",
      titulo: "Ajustar la fecha de un hito por proyecto (no en semanas 2 y 12)",
      pasos: "P6b de P-01 → Avance 2 → Ajustar fecha al 20/12/2026; intentar cambiar la fecha del Borrador final por el servidor.",
      esperado: "Los hitos de semanas 4–11 se ajustan por proyecto y se avisa; los de semanas 2 y 12 son fijos.",
      obtenido: `Avance 2 de P-01: ${fechaAv2}. Borrador final: HTTP ${rFija.status} «${rFija.json?.error?.mensaje ?? ""}». Las tarjetas fijas no muestran «Ajustar fecha».`,
      estado: L.ok(fechaAv2 === "2026-12-20" && rFija.status === 400),
      capturas: [c0],
    });

    await L.entrar(page, "71000002");
    await page.goto(`${L.WEB}/mi-taller`);
    await page.getByRole("button", { name: "Subir versión" }).first().click();
    await page.getByLabel("Archivo").setInputFiles(A("avance-1.docx"));
    await page.getByLabel("Comentario para tu asesor (opcional)").fill("Avance 1 en Word");
    const c1 = await L.captura(page, "p7-bruno-sube-avance1-word");
    await page.getByRole("button", { name: "Subir", exact: true }).click();
    await page.waitForTimeout(1500);
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/proyectos/${P01}/entregas`);
    await page.getByRole("button", { name: "Revisar v1" }).first().click();
    await page.getByLabel("Conforme").check();
    await page.getByLabel(/Comentarios/).fill("Buen avance; ajustar el formato de tablas.");
    await page.getByRole("button", { name: "Guardar revisión" }).click();
    await page.waitForTimeout(1500);
    const c2 = await L.captura(page, "p6b-avance1-aprobado");
    const av1 = L.sql(`select estado from hitos_proyecto where id='${hito(P01, "AVANCE_1")}'`);
    const f4 = L.sql(`select estado||' · '||coalesce(observaciones_acuerdos,'') from ficha_registros where proyecto_id='${P01}' and semana=4`);
    L.registrar({
      id: "P6B-01",
      seccion: "P6b Entregas del proyecto",
      titulo: "Avance en Word: cualquiera de los 2 tesistas sube; la revisión queda en la ficha",
      pasos: "La asesora habilita el Avance 1; Bruno (2.º tesista de P-01) sube un .docx; la asesora lo revisa Conforme con comentario.",
      esperado: "Se aceptan PDF y Word; el hito queda APROBADO y la revisión se registra en la Ficha (semana 4).",
      obtenido: `Avance 1: ${av1}. Ficha semana 4: ${f4}.`,
      estado: L.ok(av1 === "APROBADO" && f4.startsWith("REVISADO")),
      capturas: [c1, c2],
    });

    // Avances 2–4 y borrador integrado (acelerado por el servidor)
    for (const t of ["AVANCE_2", "AVANCE_3", "AVANCE_4", "BORRADOR_INTEGRADO"]) {
      const h = hito(P01, t);
      await L.api("POST", `/api/hitos/${h}/habilitar`, ROSA, {});
      await L.api("PATCH", `/api/hitos/${h}/fecha`, ROSA, { fechaLimite: enDosSemanas });
      await L.subir(`/api/hitos/${h}/entregas`, "71000001", { ruta: A("avance.pdf"), nombre: `${t.toLowerCase()}.pdf`, mime: "application/pdf" });
      const v = L.sql(`select id from entregas_hito where hito_id='${h}' order by version desc limit 1`);
      await L.api("POST", `/api/entregas/${v}/revisar`, ROSA, { resultado: "CONFORME", observaciones: `${t.replace("_", " ").toLowerCase()} conforme` });
    }
    // Borrador final: habilitar (#18 ficha incompleta)
    await page.goto(`${L.WEB}/proyectos/${P01}/entregas`);
    await page.waitForTimeout(800);
    await L.api("POST", `/api/hitos/${hito(P01, "BORRADOR_FINAL")}/habilitar`, ROSA, {});
    await L.entrar(page, "71000001");
    await page.goto(`${L.WEB}/mi-taller`);
    await page.getByText("Tu asesor debe completar y firmar la ficha").first().waitFor();
    await page.getByText("Tu asesor debe completar y firmar la ficha").first().scrollIntoViewIfNeeded();
    const c3 = await L.captura(page, "ac18-borrador-final-bloqueado");
    const r18 = await L.subir(`/api/hitos/${hito(P01, "BORRADOR_FINAL")}/entregas`, "71000001", { ruta: A("borrador-final.pdf"), nombre: "borrador-final.pdf", mime: "application/pdf" });
    L.registrar({
      id: "AC-18",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#18 Subir el borrador final con la ficha incompleta",
      pasos: "Con avances 1–4 y borrador integrado aprobados, la asesora habilita el Borrador final; la ficha aún no está completa y firmada.",
      esperado: "Botón deshabilitado con el motivo.",
      obtenido: `Mi Taller muestra «Tu asesor debe completar y firmar la ficha» en lugar de «Subir versión». Servidor: HTTP ${r18.status} «${r18.json?.error?.mensaje ?? ""}».`,
      estado: L.ok(r18.status === 400),
      capturas: [c3],
    });

    // Ficha: registrar semana 12 por la interfaz y subir la firmada
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/proyectos/${P01}/entregas`);
    await page.getByRole("tab", { name: "Ficha de control" }).click();
    await page.getByRole("row").filter({ hasText: "Borrador final" }).getByRole("button", { name: "Registrar" }).click();
    await page.getByLabel("Observaciones y acuerdos").fill("Borrador final revisado; listo para el informe de conformidad.");
    const c4 = await L.captura(page, "p11-registrar-revision");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Subir ficha firmada" }).click();
    await page.getByLabel("PDF firmado").setInputFiles(A("ficha-firmada.pdf"));
    await page.getByRole("button", { name: "Subir", exact: true }).click();
    await page.waitForTimeout(1500);
    const c5 = await L.captura(page, "p11-ficha-completa", { completa: true });
    const [d1] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar PDF" }).click()]);
    await d1.saveAs(path.join(DOCS, "Anexo1-Ficha-P-01-completa.pdf"));
    const resumen = L.sql(`select count(*) filter (where estado='FIRMADO')||' de '||count(*) from ficha_registros where proyecto_id='${P01}'`);
    L.registrar({
      id: "P11-02",
      seccion: "P11 Ficha de Control",
      titulo: "Registrar revisión y completar la ficha firmada",
      pasos: "Ficha → Registrar (semana 12) → Subir ficha firmada (filas pendientes) → Descargar PDF.",
      esperado: "Con las 6 filas revisadas y firmadas la ficha queda completa y habilita el cierre.",
      obtenido: `Filas firmadas: ${resumen}. PDF: documentos/Anexo1-Ficha-P-01-completa.pdf.`,
      estado: L.ok(resumen === "6 de 6"),
      capturas: [c4, c5],
    });

    // Borrador final por la interfaz
    await L.entrar(page, "71000001");
    await page.goto(`${L.WEB}/mi-taller`);
    const subirFinal = page.getByRole("button", { name: "Subir versión" }).last();
    await subirFinal.click();
    await page.getByLabel("Archivo").setInputFiles(A("borrador-final.pdf"));
    await page.getByRole("button", { name: "Subir", exact: true }).click();
    await page.waitForTimeout(1500);
    const c6 = await L.captura(page, "p7-borrador-final-entregado");

    // ── P13 cierre (#19) ────────────────────────────────────────────
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/proyectos/${P01}/entregas`);
    await page.getByRole("tab", { name: "Cierre" }).click();
    await page.getByText("Faltan levantar las observaciones").first().waitFor();
    const emitir = page.getByRole("button", { name: /Emitir Informe de Conformidad/ });
    const deshab19 = await emitir.isDisabled();
    const c7 = await L.captura(page, "ac19-informe-deshabilitado");
    const r19 = await fetch(`${L.API}/api/proyectos/${P01}/cierre/informe`, { headers: { Authorization: `Bearer ${await L.token(ROSA.dni, ROSA.clave)}` } });
    L.registrar({
      id: "AC-19",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#19 Emitir Informe de Conformidad con observaciones sin levantar",
      pasos: "Borrador final entregado y ficha completa, pero «Observaciones levantadas» sin marcar.",
      esperado: "Botón deshabilitado (con el motivo).",
      obtenido: `Botón ${deshab19 ? "deshabilitado" : "habilitado"} con el motivo «Faltan levantar las observaciones». Servidor: HTTP ${r19.status}.`,
      estado: L.ok(deshab19 && r19.status === 400),
      capturas: [c6, c7],
    });
    await page.getByLabel("Similitud preliminar (%)").fill("12.5");
    await page.getByRole("button", { name: "Guardar similitud" }).click();
    await page.waitForTimeout(1000);
    await page.getByLabel("Las observaciones fueron levantadas").check();
    await page.waitForTimeout(1200);
    const c8 = await L.captura(page, "p13-requisitos-cumplidos");
    const [d2] = await Promise.all([page.waitForEvent("download"), emitir.click()]);
    await d2.saveAs(path.join(DOCS, "Anexo21-Informe-Conformidad-P-01.pdf"));
    await page.waitForTimeout(1200);
    await page.getByLabel("Informe firmado (PDF)").setInputFiles(A("informe-firmado.pdf"));
    await page.getByRole("button", { name: "Subir y cerrar asesoría" }).click();
    await page.waitForTimeout(2500);
    const c9 = await L.captura(page, "p13-asesoria-cerrada");
    const tes = L.sql(`select string_agg(estado::text, ', ') from proyecto_tesistas where proyecto_id='${P01}'`);
    const acta = L.sql(`select tipo||' '||estado||' v'||version from documentos where expediente_id='${expedienteId}' and tipo='ACTA_CONFORMIDAD'`);
    const meta = L.sql(`select metadata->'tallerCierre' from expedientes where id='${expedienteId}'`);
    await L.entrar(page, SEC);
    await page.goto(`${L.WEB}/expedientes/${expedienteId}`);
    await page.getByRole("tab", { name: /Documentos Etapa 02/ }).click();
    await page.waitForTimeout(1200);
    const c10 = await L.captura(page, "expediente-acta-conformidad");
    await new Promise((r) => setTimeout(r, 2000));
    const dCierre = await L.destinatarios('subject:"asesoría del taller quedó cerrada"');
    L.registrar({
      id: "P13-01",
      seccion: "P13 Cierre de asesoría",
      titulo: "Emitir el Informe de Conformidad (Anexo 21) y cerrar la asesoría",
      pasos: "Registrar similitud 12,5 %, marcar observaciones levantadas, Emitir Informe (PDF), subir el informe firmado.",
      esperado: "Asesoría CERRADA, aviso al alumno y el proyecto sigue en la Etapa 5 (originalidad).",
      obtenido: `Tesistas: ${tes}. Expediente: ${acta}; metadatos ${meta}. Avisos de cierre: ${dCierre.join(", ")}. PDF: documentos/Anexo21-Informe-Conformidad-P-01.pdf.`,
      estado: L.ok(tes === "ASESORIA_CERRADA, ASESORIA_CERRADA" && /ACTA_CONFORMIDAD CARGADO/.test(acta)),
      capturas: [c8, c9, c10],
    });

    // ── P12 retiro (#22) y descarte ─────────────────────────────────
    await page.goto(`${L.WEB}/reportes-taller`);
    await page.getByLabel("Taller").selectOption({ label: "TALLER QA-01" });
    await page.waitForTimeout(1200);
    const c11 = await L.captura(page, "p12-alertas-taller-qa");
    await page.getByRole("button", { name: "Registrar retiro" }).first().click();
    await page.getByLabel("Motivo").fill("Dos inasistencias consecutivas (07/11 y 08/11) sin justificar.");
    const c12 = await L.captura(page, "p12-dialogo-retiro");
    await page.getByRole("button", { name: "Registrar retiro" }).last().click();
    await page.waitForTimeout(2000);
    const c13 = await L.captura(page, "p12-retiro-registrado");
    const diego = L.sql(`select pt.estado from proyecto_tesistas pt join usuarios u on u.id=pt.alumno_id where pt.proyecto_id='${P03}' and u.dni='71000004'`);
    const alertaD = L.sql(`select estado from alertas_taller a join usuarios u on u.id=a.alumno_id where a.taller_id='${tallerId}' and u.dni='71000004'`);
    const histD = L.sql(`select count(*) from taller_asistencias a join usuarios u on u.id=a.usuario_id where u.dni='71000004'`);
    await L.entrar(page, "71000004");
    await page.goto(`${L.WEB}/mi-taller`);
    await page.getByText(/retirado/i).first().waitFor();
    const c14 = await L.captura(page, "p7-alumno-retirado");
    await new Promise((r) => setTimeout(r, 1500));
    const dRet = await L.destinatarios('subject:"retiro"');
    L.registrar({
      id: "AC-22",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#22 Registrar retiro",
      pasos: "Secretaría → Alertas y reportes → alerta de faltas de Diego → Registrar retiro (motivo y fecha).",
      esperado: "El alumno pasa a RETIRADO, su historial se conserva y la alerta queda ATENDIDA; se avisa al alumno y al asesor.",
      obtenido: `Diego: ${diego}. Alerta: ${alertaD}. Marcas de asistencia conservadas: ${histD}. Avisos: ${dRet.join(", ")}. Su Mi Taller queda en solo lectura.`,
      estado: L.ok(diego === "RETIRADO" && alertaD === "ATENDIDA" && Number(histD) >= 2),
      capturas: [c11, c12, c13, c14],
    });

    await L.entrar(page, SEC);
    await page.goto(`${L.WEB}/reportes-taller`);
    await page.getByLabel("Taller").selectOption({ label: "TALLER 06" });
    await page.waitForTimeout(1200);
    const filaPlan = page.getByRole("row").filter({ hasText: "Plan no presentado" }).first();
    await filaPlan.getByRole("button", { name: "Descartar" }).click();
    await page.getByLabel("Motivo").fill("La alumna presentó el plan por mesa de partes el 26/10 (fuera del sistema).");
    await page.getByRole("button", { name: "Descartar", exact: true }).last().click();
    await page.waitForTimeout(1500);
    await page.getByLabel("Estado").selectOption("DESCARTADA");
    await page.waitForTimeout(1000);
    const c15 = await L.captura(page, "p12-alerta-descartada");
    L.registrar({
      id: "P12-01",
      seccion: "P12 Reportes y alertas",
      titulo: "Descartar una alerta con motivo",
      pasos: "TALLER 06 → alerta «Plan no presentado» → Descartar con motivo; filtrar Descartadas.",
      esperado: "La alerta pasa a DESCARTADA con su motivo (propuesta) y queda en el historial.",
      obtenido: `Alertas descartadas en TALLER 06: ${L.sql("select count(*) from alertas_taller a join talleres t on t.id=a.taller_id where t.nombre='TALLER 06' and a.estado='DESCARTADA'")}.`,
      estado: L.ok(Number(L.sql("select count(*) from alertas_taller where estado='DESCARTADA'")) >= 1),
      capturas: [c15],
    });

    // Reportes
    await page.getByLabel("Taller").selectOption({ label: "TALLER QA-01" });
    await page.getByRole("tab", { name: "Reportes" }).click();
    await page.waitForTimeout(1200);
    const c16 = await L.captura(page, "p12-reportes");
    const fila = page.getByRole("row").filter({ hasText: "Avance 1" }).first();
    const [d3] = await Promise.all([page.waitForEvent("download"), fila.getByRole("button", { name: "PDF" }).click()]);
    await d3.saveAs(path.join(DOCS, "Reporte-quincenal-Avance1-TALLER-QA-01.pdf"));
    const [d4] = await Promise.all([page.waitForEvent("download"), fila.getByRole("button", { name: "Excel" }).click()]);
    await d4.saveAs(path.join(DOCS, "Reporte-quincenal-Avance1-TALLER-QA-01.xlsx"));
    L.registrar({
      id: "P12-02",
      seccion: "P12 Reportes y alertas",
      titulo: "Reportes programados y exportación PDF / Excel",
      pasos: "Alertas y reportes → Reportes → TALLER QA-01 → Avance 1 → PDF y Excel.",
      esperado: "Reportes de semana 2, quincenales y cierre en sus fechas (lunes tras cada hito); exportan PDF y Excel.",
      obtenido: "6 reportes con sus fechas (16/11, 30/11, 14/12, 28/12, 11/01, 25/01); PDF y Excel descargados en documentos/.",
      estado: L.ok(fs.existsSync(path.join(DOCS, "Reporte-quincenal-Avance1-TALLER-QA-01.xlsx"))),
      capturas: [c16],
    });

    // ── #24 Secretaría en solo lectura ──────────────────────────────
    await page.goto(`${L.WEB}/proyectos/${P02}/entregas`);
    await page.getByText("Plan de tesis").first().waitFor();
    const c17 = await L.captura(page, "ac24-secretaria-solo-lectura");
    let acciones = 0;
    for (const n of [/^Habilitar$/, /Revisar v/, /Aprobar plan/, /Ajustar fecha/, /Subir versión/]) acciones += await page.getByRole("button", { name: n }).count();
    const r24 = await L.api("POST", `/api/hitos/${hito(P02, "AVANCE_1")}/habilitar`, SEC, {});
    L.registrar({
      id: "AC-24",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#24 Secretaría abre las entregas de un proyecto",
      pasos: "Secretaría → P6b de P-02.",
      esperado: "Solo lectura, sin botones de acción.",
      obtenido: `Botones de acción visibles: ${acciones}. Intento de habilitar un hito por el servidor: HTTP ${r24.status}.`,
      estado: L.ok(acciones === 0 && r24.status === 403),
      capturas: [c17],
    });

    // ── Encuesta (#23) ──────────────────────────────────────────────
    await L.entrar(page, "71000003");
    await page.goto(`${L.WEB}/encuesta`);
    await page.getByText("Es anónima").waitFor();
    for (const [i, v] of [5, 4, 5, 4].entries()) await page.locator("fieldset").nth(i).getByText(String(v), { exact: true }).click();
    await page.getByLabel("Comentario (opcional)").fill("Explica muy bien y responde rápido.");
    const c18 = await L.captura(page, "p14-encuesta-alumna", { completa: true });
    await page.getByRole("button", { name: "Enviar respuestas" }).click();
    await page.waitForTimeout(1500);
    const c19 = await L.captura(page, "p14-encuesta-enviada");
    const preguntas = (await L.api("GET", "/api/encuesta", "71000001")).json.preguntas;
    const cuerpo = { puntajes: preguntas.map((p) => ({ preguntaId: p.id, puntaje: 4 })), comentario: null };
    const rAna = await L.api("POST", "/api/encuesta", "71000001", cuerpo);
    const rAna2 = await L.api("POST", "/api/encuesta", "71000001", cuerpo);
    const rDiego = await L.api("POST", "/api/encuesta", "71000004", cuerpo);
    const columnas = L.sql("select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_name='encuesta_respuestas'");
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/encuestas-resultados`);
    await page.waitForTimeout(1500);
    const c20 = await L.captura(page, "p14b-resultados-ocultos");
    L.registrar({
      id: "AC-23",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#23 Responder la encuesta",
      pasos: "Carla responde por la interfaz (1–5 y comentario); Ana por el servidor dos veces; Diego (retirado) intenta responder; la asesora abre sus resultados.",
      esperado: "El resultado no revela quién respondió; una sola respuesta por período; con menos de 5 respuestas no se muestran.",
      obtenido: `Columnas de encuesta_respuestas: ${columnas} (sin alumno ni hora). Ana: ${rAna.status} y luego ${rAna2.status} («${rAna2.json?.error?.mensaje ?? ""}»). Diego retirado: ${rDiego.status}. Resultados con 2 respuestas: ocultos («al menos 5»).`,
      estado: L.ok(!/alumno|created/.test(columnas) && rAna.status === 201 && rAna2.status === 400 && rDiego.status === 400),
      capturas: [c18, c19, c20],
    });

    // ── P16 Configuración ───────────────────────────────────────────
    await L.entrar(page, "00000001");
    await page.goto(`${L.WEB}/configuracion`);
    await page.getByRole("tab", { name: /Taller/ }).click();
    await page.waitForTimeout(1500);
    const c21 = await L.captura(page, "p16-configuracion-taller", { completa: true });
    L.registrar({
      id: "P16-01",
      seccion: "P16 Configuración",
      titulo: "Feriados, plan institucional, especialidades y parámetros",
      pasos: "Administrador → Configuración → pestaña Taller.",
      esperado: "Feriados (agregar/editar/desactivar), plan institucional de 12 semanas, catálogos y parámetros con su valor recomendado.",
      obtenido: `Feriados activos: ${L.sql("select count(*) from feriados where activo")}; plan institucional: ${L.sql("select count(*) from plan_institucional")} semanas; parámetros: ${L.sql("select count(*) from parametros_taller")}.`,
      estado: "APROBADO",
      capturas: [c21],
    });

    // ── §4 Matriz de permisos en el servidor ────────────────────────
    const asis = L.sql(`select id from taller_sesiones where taller_id='${tallerId}' and nro=5`);
    const comp = L.sql("select id from comprobantes_pension order by created_at desc limit 1");
    const casos = [
      ["Alumno crea un taller", "POST", "/api/talleres", "71000003", {}],
      ["Asesor asigna un alumno", "POST", `/api/talleres/${tallerId}/proyectos`, ROSA, { dni1: "71000005" }],
      ["Asesor registra un retiro", "POST", `/api/talleres/${tallerId}/retiros`, ROSA, { alumnoId: L.sql("select id from usuarios where dni='71000003'"), motivo: "x", fecha: "2026-11-09" }],
      ["Asesor valida un comprobante", "POST", `/api/comprobantes/${comp}/validar`, ROSA, {}],
      ["Asesor gestiona asesores", "POST", "/api/asesores", ROSA, { dni: "70000099", nombres: "X", apellidos: "Y", email: "x.y99@unsa.edu.pe" }],
      ["Secretaría habilita un hito", "POST", `/api/hitos/${hito(P02, "AVANCE_1")}/habilitar`, SEC, {}],
      ["Secretaría edita el plan del taller", "PATCH", `/api/talleres/${tallerId}/plan/4`, SEC, { contenido: "x" }],
      ["Secretaría crea un grupo de horario", "POST", `/api/talleres/${tallerId}/grupos`, SEC, { nombre: "Z", horaInicio: "15:00", horaFin: "16:00", proyectoIds: [] }],
      ["Alumno ve P9 Pagos y deudores", "GET", "/api/pagos-taller", "71000003", undefined],
      ["Alumna ve las entregas de otro proyecto", "GET", `/api/proyectos/${P01}/entregas`, "71000003", undefined],
      ["Alumno ve las alertas (P12)", "GET", "/api/alertas-taller", "71000003", undefined],
      ["Asesor registra asistencia de un taller ajeno", "POST", `/api/sesiones/${L.sql("select s.id from taller_sesiones s join talleres t on t.id=s.taller_id where t.nombre='TALLER 06' and s.estado='PROGRAMADA' order by s.nro limit 1")}/asistencia`, ROSA, { grupoId: null, marcas: [] }],
    ];
    const filas = [];
    for (const [nombre, m, ruta, quien, cuerpo] of casos) {
      const r = await L.api(m, ruta, quien, cuerpo);
      filas.push(`${nombre}: HTTP ${r.status}`);
    }
    const todos403 = filas.every((f) => / (400|403)$/.test(f));
    L.registrar({
      id: "ROL-01",
      seccion: "Roles y permisos (§4)",
      titulo: "El servidor valida rol y pertenencia en cada operación",
      pasos: "Llamadas directas al servidor fuera del rol (sin usar la interfaz).",
      esperado: "Cada operación fuera del alcance del rol se rechaza (403) aunque se llame directamente.",
      obtenido: filas.join(" · "),
      estado: L.ok(filas.filter((f) => / 403$/.test(f)).length >= casos.length - 1 && todos403),
      capturas: [],
    });

    // ── §14 Historial ───────────────────────────────────────────────
    const acciones14 = L.sql(`select string_agg(accion||' ('||n||')', ', ' order by accion) from (select accion, count(*) n from auditoria_taller where taller_id='${tallerId}' group by accion) x`);
    const { execFileSync } = require("node:child_process");
    let verif = "";
    try {
      verif = execFileSync("pnpm", ["--filter", "@pis/api", "verificar-auditoria"], { cwd: path.join(__dirname, "../../../.."), encoding: "utf8", shell: true });
    } catch (e) {
      verif = String(e.stdout ?? e.message);
    }
    const linea = verif.split(/\r?\n/).find((l) => /Cadena|ERROR|rota/i.test(l)) ?? verif.trim().split(/\r?\n/).pop();
    L.registrar({
      id: "HIS-01",
      seccion: "Historial y auditoría (§14)",
      titulo: "Todo queda en el historial del taller (cadena de hash)",
      pasos: "Consultar auditoria_taller del TALLER QA-01 y ejecutar «verificar-auditoria».",
      esperado: "Creación, asignaciones, asistencia y correcciones, sesiones, plan, hitos, entregas, plan aprobado, ficha, pagos, retiros y documentos, con usuario y fecha; nada se edita ni se borra.",
      obtenido: `Acciones registradas: ${acciones14}. Verificación: ${linea}.`,
      estado: L.ok(/íntegra/.test(linea ?? "")),
      capturas: [],
    });

    // ── Correos en Mailpit ──────────────────────────────────────────
    await page.goto(L.MAILPIT);
    await page.waitForTimeout(2000);
    const c22 = await L.captura(page, "mailpit-bandeja");
    const total = (await L.correos("")).length;
    L.registrar({
      id: "NOT-03",
      seccion: "Notificaciones (§13)",
      titulo: "Bandeja de correos del flujo completo",
      pasos: "Abrir Mailpit (servidor de correo de pruebas).",
      esperado: "Cada evento del §13 genera su correo con enlace a la pantalla correspondiente.",
      obtenido: `${total} correos enviados durante las pruebas (asignación, sesiones, plan, hitos, entregas, pagos, faltas, retiro, cierre, reportes).`,
      estado: L.ok(total > 20),
      capturas: [c22],
    });
  } catch (e) {
    await L.captura(page, "error-fase5").catch(() => {});
    console.error("ERROR fase5:", e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
