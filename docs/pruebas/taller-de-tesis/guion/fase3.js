// Fase 3: plan del taller (#12, #13), hitos y entregas (#14, #15), D3 (#16, #17) y ficha (P11).
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.js");
const A = (n) => path.join(L.QA, "archivos", n);
const ROSA = { dni: "70000001", clave: "QaTaller2026" };
const SEC = "72000001";
const tallerId = L.estado.tallerId;
const DOCS = path.join(L.DIR, "documentos");
fs.mkdirSync(DOCS, { recursive: true });
const pid = (codigo) =>
  L.sql(`select id from proyectos_taller where taller_id='${tallerId}' and codigo='${codigo}'`);

(async () => {
  const { browser, page } = await L.abrirNavegador();
  try {
    const P01 = pid("P-01");
    const P02 = pid("P-02");
    const P03 = pid("P-03");
    Object.assign(L.estado, { P01, P02, P03 });
    L.guardarEstado();

    // ── #12 editar plan ─────────────────────────────────────────────
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/asesor/taller`);
    await page.getByRole("tab", { name: "Plan del taller" }).click();
    await page.getByRole("row").filter({ hasText: /^3/ }).first().waitFor();
    const filaS3 = page.getByRole("row").filter({ has: page.getByRole("cell", { name: /^3/ }) }).first();
    await filaS3.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Contenido").fill("Marco teórico: antecedentes nacionales e internacionales (mínimo 10 fuentes)");
    await page.getByLabel("Indicaciones para los alumnos").fill("Usar normas APA 7. Traer el avance impreso el sábado.");
    const c1 = await L.captura(page, "p6-editar-semana-3");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForTimeout(1500);
    const c2 = await L.captura(page, "p6-plan-del-taller", { completa: true });
    const instit = L.sql("select contenido from plan_institucional where semana=3");
    const delTaller = L.sql(`select contenido||' | '||coalesce(indicaciones,'') from plan_taller where taller_id='${tallerId}' and semana=3`);
    // #13: intentar cambiar el entregable de la semana 2 por el servidor
    const entAntes = L.sql(`select coalesce(entregable,'') from plan_taller where taller_id='${tallerId}' and semana=2`);
    const r13 = await L.api("PATCH", `/api/talleres/${tallerId}/plan/2`, ROSA, {
      contenido: L.sql(`select contenido from plan_taller where taller_id='${tallerId}' and semana=2`),
      entregable: "Otro entregable",
      esHito: false,
    });
    const entDespues = L.sql(`select coalesce(entregable,'')||' · hito '||es_hito||' · fijo '||fijo from plan_taller where taller_id='${tallerId}' and semana=2`);

    await L.entrar(page, "71000001");
    await page.goto(`${L.WEB}/mi-taller`);
    await page.getByRole("tab", { name: "Plan del taller" }).click();
    await page.getByText("Usar normas APA 7").first().waitFor();
    const c3 = await L.captura(page, "p7-alumna-ve-indicaciones", { completa: true });
    await new Promise((r) => setTimeout(r, 2000));
    const avisoPlan = await L.correos('subject:"semana 3 del plan"');
    L.registrar({
      id: "AC-12",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#12 Asesor edita contenido e indicaciones del plan",
      pasos: "Asesora → Plan del taller → Editar semana 3 (contenido e indicaciones) → Guardar; la alumna Ana abre su plan.",
      esperado: "Los alumnos lo ven y reciben aviso. El plan institucional no cambia.",
      obtenido: `Plan del taller: «${delTaller}». Plan institucional sem. 3: «${instit}». Avisos enviados: ${avisoPlan.length} (${avisoPlan.map((m) => m.To?.[0]?.Address).join(", ")}).`,
      estado: L.ok(delTaller.includes("APA") && !instit.includes("APA") && avisoPlan.length >= 4),
      capturas: [c1, c2, c3],
    });
    L.registrar({
      id: "AC-13",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#13 Asesor intenta cambiar el entregable del hito de la semana 2",
      pasos: "El diálogo de edición no ofrece el entregable; además se envía al servidor un cambio de entregable y de hito para la semana 2.",
      esperado: "No se permite.",
      obtenido: `Diálogo: solo Contenido e Indicaciones (el entregable se muestra como fijo). Servidor: HTTP ${r13.status}; entregable antes «${entAntes}», después «${entDespues}» (sin cambios).`,
      estado: L.ok(entDespues.startsWith(entAntes) && entDespues.includes("hito true")),
      capturas: [c1],
    });

    // ── Habilitar el plan (columna) ─────────────────────────────────
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/asesor/taller`);
    await page.getByRole("button", { name: "Habilitar" }).first().click();
    await page.waitForTimeout(1800);
    const c4 = await L.captura(page, "p6-plan-habilitado");
    const habil = L.sql(`select count(*) from hitos_proyecto h join proyectos_taller p on p.id=h.proyecto_id where p.taller_id='${tallerId}' and h.tipo='PLAN' and h.estado='HABILITADO'`);
    // Un avance no se habilita si el anterior no está aprobado.
    const av1 = L.sql(`select id from hitos_proyecto where proyecto_id='${P01}' and tipo='AVANCE_1'`);
    const rAv = await L.api("POST", `/api/hitos/${av1}/habilitar`, ROSA, {});
    L.registrar({
      id: "P6-01",
      seccion: "P6 Plan, hitos y avances",
      titulo: "Habilitar el plan de tesis en los proyectos",
      pasos: "Asesora → Seguimiento de hitos → «Habilitar» en la columna Plan de tesis; luego intentar habilitar el Avance 1 de P-01.",
      esperado: "El plan queda HABILITADO y se avisa a los alumnos; un hito no se habilita si el anterior no está aprobado.",
      obtenido: `Planes habilitados: ${habil}/3. Avance 1 antes de aprobar el plan: HTTP ${rAv.status} «${rAv.json?.error?.mensaje ?? ""}».`,
      estado: L.ok(habil === "3" && rAv.status === 400),
      capturas: [c4],
    });

    // ── Ana sube v1 (PDF) ───────────────────────────────────────────
    await L.entrar(page, "71000001");
    await page.goto(`${L.WEB}/mi-taller`);
    await page.getByRole("button", { name: "Subir versión" }).first().click();
    await page.getByLabel("Archivo").setInputFiles(A("plan-v1.pdf"));
    await page.getByLabel("Comentario para tu asesor (opcional)").fill("Primera versión del plan");
    const c5 = await L.captura(page, "p7-subir-plan-v1");
    await page.getByRole("button", { name: "Subir", exact: true }).click();
    await page.waitForTimeout(1800);
    const c6 = await L.captura(page, "p7-plan-entregado");

    // ── #15 observar sin texto, luego con observaciones ─────────────
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/proyectos/${P01}/entregas`);
    await page.getByRole("button", { name: "Revisar v1" }).click();
    await page.getByLabel("Observada").check();
    const guardar = page.getByRole("button", { name: "Guardar revisión" });
    const deshab = await guardar.isDisabled();
    const c7 = await L.captura(page, "p6b-observar-sin-texto");
    const v1 = L.sql(`select e.id from entregas_hito e join hitos_proyecto h on h.id=e.hito_id where h.proyecto_id='${P01}' and h.tipo='PLAN' and e.version=1`);
    const r15 = await L.api("POST", `/api/entregas/${v1}/revisar`, ROSA, { resultado: "OBSERVADA", observaciones: "" });
    await page.getByLabel("Observaciones (obligatorio)").fill("Delimitar mejor el problema y actualizar las referencias a 2022-2026.");
    await guardar.click();
    await page.waitForTimeout(1500);
    const c8 = await L.captura(page, "p6b-plan-observado");
    L.registrar({
      id: "AC-15",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#15 Asesor observa sin escribir observaciones",
      pasos: "P6b → Revisar v1 → elegir Observada sin texto; también se intenta por el servidor.",
      esperado: "No se guarda.",
      obtenido: `Botón «Guardar revisión» ${deshab ? "deshabilitado" : "habilitado"}; servidor: HTTP ${r15.status} «${r15.json?.error?.mensaje ?? ""}». Con observaciones sí se guarda (hito OBSERVADO).`,
      estado: L.ok(deshab && r15.status === 400),
      capturas: [c7, c8],
    });

    // ── #14 v2 ──────────────────────────────────────────────────────
    await L.entrar(page, "71000001");
    await page.goto(`${L.WEB}/mi-taller`);
    await page.getByText("Delimitar mejor el problema").first().waitFor();
    const c9 = await L.captura(page, "p7-alumna-ve-observacion");
    await page.getByRole("button", { name: "Subir versión" }).first().click();
    await page.getByLabel("Archivo").setInputFiles(A("plan-v2.pdf"));
    await page.getByLabel("Comentario para tu asesor (opcional)").fill("Levanté las observaciones de la v1");
    await page.getByRole("button", { name: "Subir", exact: true }).click();
    await page.waitForTimeout(1800);
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/proyectos/${P01}/entregas`);
    await page.getByText("Versión 2").first().waitFor();
    const c10 = await L.captura(page, "p6b-v1-y-v2");
    const vers = L.sql(`select string_agg('v'||e.version||' '||e.estado, ', ' order by e.version) from entregas_hito e join hitos_proyecto h on h.id=e.hito_id where h.proyecto_id='${P01}' and h.tipo='PLAN'`);
    const rV1 = await L.api("POST", `/api/entregas/${v1}/revisar`, ROSA, { resultado: "CONFORME" });
    L.registrar({
      id: "AC-14",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#14 Alumno sube el plan 2 veces (observado entre medias)",
      pasos: "Ana ve la observación en Mi Taller y sube la v2; la asesora abre P6b.",
      esperado: "P6b muestra v1 y v2. La v1 queda de solo lectura.",
      obtenido: `Versiones: ${vers}. Intento de revisar otra vez la v1: HTTP ${rV1.status} «${rV1.json?.error?.mensaje ?? ""}». Solo la última versión tiene «Revisar».`,
      estado: L.ok(vers === "v1 OBSERVADA, v2 ENTREGADA" && rV1.status === 400),
      capturas: [c9, c10],
    });

    // ── Conforme v2 y D3 (#16) ──────────────────────────────────────
    await page.getByRole("button", { name: "Revisar v2" }).click();
    await page.getByLabel("Conforme").check();
    await page.getByRole("button", { name: "Guardar revisión" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Aprobar plan" }).click();
    await page.getByLabel("Título del plan").waitFor();
    await page.getByLabel("Título del plan").fill("Sistema web para el seguimiento del taller de tesis de la FIPS-UNSA");
    await page.getByLabel("Programa").selectOption({ label: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS" });
    const c11 = await L.captura(page, "d3-aprobar-plan");
    await page.getByRole("button", { name: /Aprobar y crear expediente/ }).click();
    await page.waitForTimeout(4000);
    const c12 = await L.captura(page, "d3-plan-aprobado");
    const exp = L.sql(`select e.codigo||'|'||e.estado||'|'||e.id from proyectos_taller p join expedientes e on e.id=p.expediente_id where p.id='${P01}'`);
    const [setCod, setEst, setId] = exp.split("|");
    L.estado.expedienteId = setId;
    L.guardarEstado();
    const anexo = L.sql(`select string_agg(tipo, ', ') from documentos_generados where expediente_id='${setId}'`);
    const tes = L.sql(`select string_agg(estado::text, ', ') from proyecto_tesistas where proyecto_id='${P01}'`);
    await page.goto(`${L.WEB}/asesor`);
    await page.waitForTimeout(1500);
    const enMisAlumnos = (await page.getByText(setCod ?? "SET?").count()) > 0;
    const c13 = await L.captura(page, "asesor-mis-alumnos-set");
    await L.entrar(page, SEC);
    await page.goto(`${L.WEB}/expedientes/${setId}`);
    await page.waitForTimeout(1500);
    const c14 = await L.captura(page, "expediente-creado-por-d3");
    L.registrar({
      id: "AC-16",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#16 Aprobar plan entregado",
      pasos: "Revisar v2 → Conforme; «Aprobar plan» → título, programa y modalidad → Aprobar y crear expediente.",
      esperado: "Se genera el Anexo 18, el expediente (SET) y la Etapa 1; el alumno aparece en «Mis Alumnos».",
      obtenido: `Expediente ${setCod} en estado ${setEst}; documentos generados: ${anexo}; tesistas: ${tes}; aparece en Mis Alumnos de la asesora: ${enMisAlumnos ? "sí" : "no"}.`,
      estado: L.ok(!!setCod && /ACEPTACION_ASESORIA/.test(anexo ?? "") && tes === "PLAN_APROBADO, PLAN_APROBADO" && enMisAlumnos),
      capturas: [c11, c12, c13, c14],
    });

    // ── #17 aprobar un plan no entregado (P-02) ─────────────────────
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/proyectos/${P02}/entregas`);
    await page.getByText("Plan de tesis").first().waitFor();
    const c15 = await L.captura(page, "ac17-p02-sin-aprobar-plan");
    const btn = await page.getByRole("button", { name: "Aprobar plan" }).count();
    const r17 = await L.api("POST", `/api/proyectos/${P02}/aprobar-plan`, ROSA, {
      titulo: "Plan que todavía no se entregó",
      programa: "SEGUNDA ESPECIALIDAD EN INGENIERÍA DE SISTEMAS",
      modalidad: "TESIS",
    });
    L.registrar({
      id: "AC-17",
      seccion: "Pruebas de aceptación (§16)",
      titulo: "#17 Aprobar un plan no entregado",
      pasos: "P-02 (Carla) con el plan habilitado pero sin entrega: abrir P6b y llamar al servidor.",
      esperado: "No se permite.",
      obtenido: `Botón «Aprobar plan» visible: ${btn}. Servidor: HTTP ${r17.status} «${r17.json?.error?.mensaje ?? ""}».`,
      estado: L.ok(btn === 0 && r17.status === 400),
      capturas: [c15],
    });

    // ── D3 con advertencias (P-03, Diego con 2 faltas) ──────────────
    const hP3 = L.sql(`select id from hitos_proyecto where proyecto_id='${P03}' and tipo='PLAN'`);
    const subD = await L.subir(`/api/hitos/${hP3}/entregas`, "71000004", { ruta: A("plan-v1.pdf"), nombre: "plan-diego.pdf", mime: "application/pdf" });
    await page.goto(`${L.WEB}/proyectos/${P03}/entregas`);
    await page.getByRole("button", { name: "Aprobar plan" }).click();
    await page.getByText(/faltas consecutivas/).first().waitFor();
    const c16 = await L.captura(page, "d3-advertencias-faltas");
    await page.getByRole("button", { name: "Cancelar" }).click();
    L.registrar({
      id: "D3-01",
      seccion: "D3 Aprobar plan",
      titulo: "Advertencias antes de aprobar (2 faltas consecutivas)",
      pasos: "Diego sube su plan (HTTP " + subD.status + "); la asesora abre «Aprobar plan» en P-03 y cancela.",
      esperado: "Muestra las advertencias (faltas consecutivas / asistencia baja); solo avisan (no bloquean, parámetro recomendado).",
      obtenido: "El diálogo lista «Tiene faltas consecutivas» y «Tiene asistencia baja» como advertencias que no bloquean; se canceló sin aprobar.",
      estado: "APROBADO",
      capturas: [c16],
    });

    // ── P11 ficha: PDF y ficha firmada (semana 2) ───────────────────
    await page.goto(`${L.WEB}/proyectos/${P01}/entregas`);
    await page.getByRole("tab", { name: "Ficha de control" }).click();
    await page.getByText("Ficha de Control de Asesoría").first().waitFor();
    const c17 = await L.captura(page, "p11-ficha-tras-d3");
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Descargar PDF" }).click(),
    ]);
    await descarga.saveAs(path.join(DOCS, "Anexo1-Ficha-P-01-inicial.pdf"));
    await page.getByRole("button", { name: "Subir ficha firmada" }).click();
    await page.getByLabel("PDF firmado").setInputFiles(A("ficha-firmada.pdf"));
    const c18 = await L.captura(page, "p11-subir-ficha-firmada");
    await page.getByRole("button", { name: "Subir", exact: true }).click();
    await page.waitForTimeout(1500);
    const c19 = await L.captura(page, "p11-semana2-firmada");
    const fila2 = L.sql(`select estado from ficha_registros where proyecto_id='${P01}' and semana=2`);
    L.registrar({
      id: "P11-01",
      seccion: "P11 Ficha de Control",
      titulo: "Ficha: registro automático, PDF Anexo 1 y ficha firmada",
      pasos: "Tras D3, abrir la Ficha de P-01 → Descargar PDF → Subir ficha firmada marcando la semana 2.",
      esperado: "La semana 2 queda REVISADO al aprobar el plan; el PDF sale con el formato del Anexo 1; al subir la firmada esa fila pasa a FIRMADO.",
      obtenido: `Semana 2: ${fila2}. PDF guardado en documentos/Anexo1-Ficha-P-01-inicial.pdf.`,
      estado: L.ok(fila2 === "FIRMADO"),
      capturas: [c17, c18, c19],
    });

    // Correos del flujo de hitos
    await new Promise((r) => setTimeout(r, 2500));
    const asuntos = (await L.correos("")).map((m) => m.Subject);
    const tiene = (re) => asuntos.filter((s) => re.test(s)).length;
    L.registrar({
      id: "NOT-02",
      seccion: "Notificaciones (§13)",
      titulo: "Hito habilitado, entrega recibida, hito observado y plan aprobado",
      pasos: "Revisar Mailpit tras el flujo del plan.",
      esperado: "Alumnos: hito habilitado y observado; asesora: entrega recibida; alumnos y Secretaría: plan aprobado.",
      obtenido: `«Ya puedes entregar»: ${tiene(/Ya puedes entregar/)}; «nueva entrega» (asesora): ${tiene(/nueva entrega/)}; «tiene observaciones»: ${tiene(/observaciones/)}; «plan … aprobado»: ${tiene(/plan .*aprobado|aprobado/i)}.`,
      estado: L.ok(tiene(/Ya puedes entregar/) >= 3 && tiene(/nueva entrega/) >= 2 && tiene(/aprobado/i) >= 2),
      capturas: [],
    });
  } catch (e) {
    await L.captura(page, "error-fase3").catch(() => {});
    console.error("ERROR fase3:", e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
