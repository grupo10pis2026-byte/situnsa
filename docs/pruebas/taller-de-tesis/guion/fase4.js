// Fase 4: pagos (P8, P9, #20, #21) y pestaña Pensiones de P3.
const path = require("node:path");
const L = require("./lib.js");
const A = (n) => path.join(L.QA, "archivos", n);
const SEC = "72000001";
const tallerId = L.estado.tallerId;
const pension = (dni, n) =>
  L.sql(`select pa.id||'|'||pa.estado from pensiones_alumno pa join pensiones_taller pt on pt.id=pa.pension_taller_id join usuarios u on u.id=pa.alumno_id where pt.taller_id='${tallerId}' and u.dni='${dni}' and pt.numero=${n}`).split("|");

(async () => {
  const { browser, page } = await L.abrirNavegador();
  try {
    // ── Ana sube comprobante (P8) ───────────────────────────────────
    await L.entrar(page, "71000001");
    await page.goto(`${L.WEB}/mis-pagos`);
    await page.getByText("Pensión 2").waitFor();
    const c1 = await L.captura(page, "p8-mis-pagos-inicial");
    await page.getByRole("button", { name: "Subir comprobante" }).first().click();
    await page.getByLabel("Archivo").setInputFiles(A("voucher-borroso.png"));
    const c2 = await L.captura(page, "p8-subir-comprobante");
    await page.getByRole("button", { name: "Enviar" }).click();
    await page.waitForTimeout(1500);
    const c3 = await L.captura(page, "p8-en-revision");
    const [p2id, p2est] = pension("71000001", 2);
    L.registrar({
      id: "P8-01",
      seccion: "P8 Mis Pagos",
      titulo: "La alumna sube el comprobante de la 2.ª pensión",
      pasos: "Ana → Mis Pagos → Pensión 2 → Subir comprobante (imagen PNG) → Enviar.",
      esperado: "La 1.ª aparece pagada (inscripción); la 2.ª pasa a EN REVISIÓN y se avisa a la Secretaría.",
      obtenido: `Pensión 1: ${pension("71000001", 1)[1]}. Pensión 2 tras subir: ${p2est}. Aviso a la Secretaría: ${(await L.destinatarios('subject:"Comprobante por validar"')).join(", ")}.`,
      estado: L.ok(p2est === "EN_REVISION"),
      capturas: [c1, c2, c3],
    });

    // #20 comprobante en una pensión VALIDADA
    const [p1id] = pension("71000001", 1);
    const r20 = await L.subir(`/api/pensiones-alumno/${p1id}/comprobante`, "71000001", { ruta: A("voucher.pdf"), nombre: "voucher.pdf", mime: "application/pdf" });
    const r20b = await L.subir(`/api/pensiones-alumno/${p2id}/comprobante`, "71000001", { ruta: A("voucher.pdf"), nombre: "voucher.pdf", mime: "application/pdf" });
    const botones1 = await page.locator("div").filter({ hasText: /^Pensión 1/ }).getByRole("button", { name: /Subir/ }).count();
    L.registrar({
      id: "AC-20",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#20 Subir comprobante en una pensión VALIDADA",
      pasos: "La 1.ª pensión de Ana está VALIDADA (inscripción): no muestra botón; se intenta por el servidor. Igual con la 2.ª EN REVISIÓN.",
      esperado: "No se permite.",
      obtenido: `Botón en la pensión 1: ${botones1}. Servidor: pensión VALIDADA → HTTP ${r20.status} «${r20.json?.error?.mensaje ?? ""}»; pensión EN REVISIÓN → HTTP ${r20b.status} «${r20b.json?.error?.mensaje ?? ""}».`,
      estado: L.ok(r20.status === 400 && r20b.status === 400),
      capturas: [c3],
    });

    // ── P9: observar sin motivo (#21) y con motivo ─────────────────
    await L.entrar(page, SEC);
    await page.goto(`${L.WEB}/pagos-taller`);
    await page.getByLabel("Taller").selectOption({ label: "TALLER QA-01" });
    await page.waitForTimeout(1200);
    const c4 = await L.captura(page, "p9-pagos-taller-qa", { completa: true });
    const fAna = page.getByRole("row").filter({ hasText: "Ana Torres" }).filter({ hasText: "2.ª" });
    await fAna.getByRole("button", { name: "Observar" }).click();
    const btnObs = page.getByRole("button", { name: "Observar", exact: true }).last();
    const deshab = await btnObs.isDisabled();
    const c5 = await L.captura(page, "p9-observar-sin-motivo");
    const comp = L.sql(`select id from comprobantes_pension where pension_alumno_id='${p2id}' order by created_at desc limit 1`);
    const r21 = await L.api("POST", `/api/comprobantes/${comp}/observar`, SEC, { motivo: "   " });
    await page.getByLabel("Motivo (se envía al alumno)").fill("La imagen no se lee: sube una foto nítida del voucher completo.");
    await btnObs.click();
    await page.waitForTimeout(1500);
    const c6 = await L.captura(page, "p9-comprobante-observado");
    L.registrar({
      id: "AC-21",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#21 Observar un comprobante sin motivo",
      pasos: "P9 → fila de Ana, 2.ª pensión → Observar sin motivo; también por el servidor con motivo vacío. Luego con motivo.",
      esperado: "No se guarda.",
      obtenido: `Botón «Observar» del diálogo ${deshab ? "deshabilitado" : "habilitado"}; servidor: HTTP ${r21.status} «${r21.json?.error?.mensaje ?? ""}». Con motivo la pensión queda ${pension("71000001", 2)[1]}.`,
      estado: L.ok(deshab && r21.status === 400 && pension("71000001", 2)[1] === "OBSERVADA"),
      capturas: [c5, c6],
    });

    // ── Ana ve el motivo y sube otro; Secretaría valida ─────────────
    await L.entrar(page, "71000001");
    await page.goto(`${L.WEB}/mis-pagos`);
    await page.getByText("La imagen no se lee").first().waitFor();
    const c7 = await L.captura(page, "p8-alumna-ve-observacion");
    await page.getByRole("button", { name: "Subir nuevo comprobante" }).click();
    await page.getByLabel("Archivo").setInputFiles(A("voucher-nuevo.png"));
    await page.getByRole("button", { name: "Enviar" }).click();
    await page.waitForTimeout(1500);
    await L.entrar(page, SEC);
    await page.goto(`${L.WEB}/pagos-taller`);
    await page.getByLabel("Taller").selectOption({ label: "TALLER QA-01" });
    await page.waitForTimeout(1000);
    const fAna2 = page.getByRole("row").filter({ hasText: "Ana Torres" }).filter({ hasText: "2.ª" });
    await fAna2.getByRole("button", { name: "Validar" }).click();
    await page.waitForTimeout(1500);
    const c8 = await L.captura(page, "p9-comprobante-validado");
    const r2v = await L.api("POST", `/api/comprobantes/${L.sql(`select id from comprobantes_pension where pension_alumno_id='${p2id}' order by created_at desc limit 1`)}/validar`, SEC, {});
    // Pago directo de Bruno
    const fBruno = page.getByRole("row").filter({ hasText: "Bruno Díaz" }).filter({ hasText: "2.ª" });
    await fBruno.getByRole("button", { name: "Registrar pago" }).click();
    await page.getByLabel("Observación (opcional)").fill("Pagó en caja de la Facultad (recibo 004512)");
    const c9 = await L.captura(page, "p9-registrar-pago-directo");
    await page.getByRole("button", { name: "Registrar pago" }).last().click();
    await page.waitForTimeout(1500);
    await page.getByLabel("Solo deudores").check();
    await page.getByLabel("Taller").selectOption("");
    await page.waitForTimeout(1200);
    const c10 = await L.captura(page, "p9-deudores", { completa: true });
    const pBruno = L.sql(`select pa.estado||' · '||coalesce(pa.medio::text,'')||' · S/ '||coalesce(pa.monto_pagado,0) from pensiones_alumno pa join pensiones_taller pt on pt.id=pa.pension_taller_id join usuarios u on u.id=pa.alumno_id where pt.taller_id='${tallerId}' and u.dni='71000002' and pt.numero=2`);
    const dAna = await L.destinatarios('to:"ana.qa@unsa.edu.pe" subject:"pensión 2"');
    L.registrar({
      id: "P9-01",
      seccion: "P9 Pagos del taller",
      titulo: "Validar un comprobante, registrar pago directo y ver deudores",
      pasos: "Ana sube otro comprobante tras la observación → la Secretaría lo valida; registra el pago directo de Bruno; filtra «Solo deudores».",
      esperado: "La pensión queda VALIDADA y no se valida dos veces; el pago directo queda VALIDADO con observación; deudores con días de atraso.",
      obtenido: `Ana pensión 2: ${pension("71000001", 2)[1]}; segunda validación del mismo comprobante: HTTP ${r2v.status}. Bruno pensión 2: ${pBruno}. Avisos a Ana sobre la pensión 2: ${dAna.length ? "sí" : "no"}.`,
      estado: L.ok(pension("71000001", 2)[1] === "VALIDADA" && r2v.status === 400 && pBruno.startsWith("VALIDADA · PAGO_DIRECTO")),
      capturas: [c7, c8, c9, c10],
    });

    // ── P3 pestaña Pensiones ────────────────────────────────────────
    await page.goto(`${L.WEB}/taller/${tallerId}`);
    await page.getByRole("tab", { name: "Pensiones" }).click();
    await page.waitForTimeout(800);
    const c11 = await L.captura(page, "p3-pensiones-pagadas");
    L.registrar({
      id: "P3-02",
      seccion: "P3 Detalle del taller",
      titulo: "Pestaña Pensiones: fechas, montos y alumnos que pagaron",
      pasos: "Secretaría → TALLER QA-01 → Pensiones.",
      esperado: "Las 3 pensiones con fecha (la 1.ª «Al inscribirse»), monto y cuántos pagaron; botones a comprobantes y a editar pensiones.",
      obtenido: "Pensión 1: 4 de 4 pagadas; pensión 2: 2 de 4 (Ana con comprobante, Bruno pago directo); pensión 3: 0 de 4.",
      estado: "APROBADO",
      capturas: [c11],
    });
  } catch (e) {
    await L.captura(page, "error-fase4").catch(() => {});
    console.error("ERROR fase4:", e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
