// Fase 6: editar taller (P2), cambiar asesor y cancelar (P3), desactivar asesor (P15),
// parámetro en P16 → resultados de encuesta (P14b) y evidencias del proceso diario.
const L = require("./lib.js");
const ROSA = { dni: "70000001", clave: "QaTaller2026" };
const SEC = "72000001";
const { tallerId } = L.estado;

(async () => {
  const { browser, page } = await L.abrirNavegador();
  try {
    // ── P2 editar ───────────────────────────────────────────────────
    await L.entrar(page, SEC);
    await page.goto(`${L.WEB}/talleres/${tallerId}/editar`);
    await page.getByLabel("Enlace del sábado").waitFor();
    const inicioBloq = await page.getByLabel("Inicio del curso").isDisabled();
    await page.getByLabel("Enlace del sábado").fill("https://meet.google.com/qa-taller-sab-nuevo");
    await page.getByLabel("Cupo máximo de proyectos").fill("2");
    await page.getByRole("button", { name: /Guardar cambios/ }).click();
    await page.waitForTimeout(1200);
    const c1 = await L.captura(page, "p2-editar-cupo-menor");
    const cupo = L.sql(`select cupo_proyectos from talleres where id='${tallerId}'`);
    await page.getByLabel("Cupo máximo de proyectos").fill("3");
    await page.getByRole("button", { name: /Guardar cambios/ }).click();
    await page.waitForURL(/\/taller\//);
    await page.waitForTimeout(1000);
    const c2 = await L.captura(page, "p2-editar-guardado");
    const enlace = L.sql(`select enlace_sabado from talleres where id='${tallerId}'`);
    L.registrar({
      id: "P2-01",
      seccion: "P2 Nuevo o editar taller",
      titulo: "Editar un taller en curso",
      pasos: "P3 → Editar: cambiar el enlace del sábado e intentar bajar el cupo a 2 (hay 3 proyectos); luego volver a 3 y guardar.",
      esperado: "Inicio y fin bloqueados con sesiones realizadas; el cupo no puede ser menor que los proyectos asignados; el enlace se actualiza.",
      obtenido: `Inicio bloqueado: ${inicioBloq ? "sí" : "no"}. Con cupo 2 no se guardó (cupo en BD: ${cupo}). Enlace del sábado: ${enlace}.`,
      estado: L.ok(cupo === "3" && enlace.endsWith("nuevo")),
      capturas: [c1, c2],
    });

    // ── P3 cancelar no disponible con sesiones realizadas ───────────
    const cancelar = page.getByRole("button", { name: /Cancelar taller/ });
    const motivoCanc = await cancelar.getAttribute("aria-label");
    L.registrar({
      id: "P3-03",
      seccion: "P3 Detalle del taller",
      titulo: "No se cancela un taller con sesiones realizadas",
      pasos: "TALLER QA-01 (con 2 sesiones realizadas) → botón Cancelar taller.",
      esperado: "Cancelado solo sin sesiones realizadas; el botón muestra el motivo.",
      obtenido: `Botón: «${motivoCanc}».`,
      estado: L.ok(/no disponible/.test(motivoCanc ?? "")),
      capturas: [c2],
    });

    // ── Taller QA-02: cambiar asesor y cancelar ─────────────────────
    const nuevo = async (dni, nombres, apellidos, email) =>
      (await L.api("POST", "/api/asesores", SEC, { dni, nombres, apellidos, email, grado: "Mg." })).json?.id;
    const luis = await nuevo("70000002", "Luis", "Cárdenas Ponce", "luis.cardenas@unsa.edu.pe");
    await nuevo("70000003", "Marta", "Huanca Rivera", "marta.huanca@unsa.edu.pe");
    const t2 = await L.api("POST", "/api/talleres", SEC, {
      nombre: "TALLER QA-02",
      periodo: "2027-I",
      asesorId: luis,
      inicio: "2027-04-03",
      fin: "2027-06-20",
      numeroSesiones: 2,
      dias: [
        { dia: 6, horaInicio: "15:00", horaFin: "20:00" },
        { dia: 7, horaInicio: "08:00", horaFin: "13:00" },
      ],
      cupoProyectos: 15,
      enlaceSabado: null,
      enlaceDomingo: null,
      pensiones: { montos: [1000, 1000, 1000], fecha2: "2027-04-24", fecha3: "2027-05-22" },
      sesiones: [
        { fecha: "2027-04-03", horaInicio: "15:00", horaFin: "20:00" },
        { fecha: "2027-04-04", horaInicio: "08:00", horaFin: "13:00" },
      ],
    });
    const t2id = t2.json?.id;
    L.estado.taller2Id = t2id;
    L.guardarEstado();
    await page.goto(`${L.WEB}/taller/${t2id}`);
    await page.getByRole("button", { name: "Cambiar asesor" }).click();
    const sel = page.getByLabel("Nuevo asesor");
    const opts = await sel.locator("option").allTextContents();
    await sel.selectOption({ label: opts.find((o) => o.includes("Huanca")) });
    await page.getByLabel("Motivo del cambio de asesor").fill("El Mg. Cárdenas asumió otra carga académica.");
    const c3 = await L.captura(page, "p3-cambiar-asesor");
    await page.getByRole("button", { name: "Cambiar asesor" }).last().click();
    await page.waitForTimeout(1500);
    const c4 = await L.captura(page, "p3-asesor-cambiado");
    const asesor2 = L.sql(`select u.apellidos from talleres t join usuarios u on u.id=t.asesor_id where t.id='${t2id}'`);
    L.registrar({
      id: "P3-04",
      seccion: "P3 Detalle del taller",
      titulo: "Cambiar asesor (diálogo)",
      pasos: "TALLER QA-02 (asesor Luis Cárdenas) → Cambiar asesor → Marta Huanca con motivo.",
      esperado: "Solo se listan asesores disponibles; el nuevo asesor ve el taller y el anterior deja de verlo; queda en el historial.",
      obtenido: `Opciones: ${opts.filter((o) => o.trim()).join(" · ")}. Asesor actual: ${asesor2}. La asesora Rosa (con taller activo) no aparece.`,
      estado: L.ok(asesor2 === "Huanca Rivera" && !opts.some((o) => o.includes("Paredes"))),
      capturas: [c3, c4],
    });
    await page.getByRole("button", { name: /Cancelar taller/ }).click();
    await page.getByLabel("Motivo de la cancelación").fill("No se alcanzó el mínimo de inscritos para el período 2027-I.");
    const c5 = await L.captura(page, "p3-cancelar-taller");
    await page.getByRole("button", { name: "Cancelar taller" }).last().click();
    await page.waitForTimeout(1500);
    const c6 = await L.captura(page, "p3-taller-cancelado");
    const est2 = L.sql(`select estado||' · '||coalesce(motivo_cancelacion,'') from talleres where id='${t2id}'`);
    L.registrar({
      id: "P3-05",
      seccion: "P3 Detalle del taller",
      titulo: "Cancelar un taller sin sesiones realizadas",
      pasos: "TALLER QA-02 → Cancelar taller con motivo.",
      esperado: "Queda CANCELADO con su motivo; no se elimina y conserva su historial.",
      obtenido: `Estado: ${est2}. Sesiones canceladas: ${L.sql(`select count(*) from taller_sesiones where taller_id='${t2id}' and estado='CANCELADA'`)}.`,
      estado: L.ok(est2.startsWith("CANCELADO")),
      capturas: [c5, c6],
    });

    // ── P15 desactivar asesor con taller activo ─────────────────────
    await page.goto(`${L.WEB}/asesores`);
    await page.getByText("Paredes Quispe").first().waitFor();
    const c7 = await L.captura(page, "p15-lista-final", { completa: true });
    const rDes = await L.api("PATCH", `/api/asesores/${L.estado.asesoraId}`, SEC, { activo: false });
    const btnDes = await page.getByLabel(/Desactivar a Rosa Paredes Quispe: no disponible/).count();
    L.registrar({
      id: "P15-03",
      seccion: "P15 Lista de asesores",
      titulo: "No se desactiva un asesor con taller activo",
      pasos: "Asesores → fila de Rosa Paredes (TALLER QA-01 en curso) → Desactivar; también por el servidor.",
      esperado: "No se permite mientras tenga un taller activo (propuesta).",
      obtenido: `Botón deshabilitado con motivo: ${btnDes ? "sí" : "no"}. Servidor: HTTP ${rDes.status} «${rDes.json?.error?.mensaje ?? ""}».`,
      estado: L.ok(btnDes > 0 && rDes.status >= 400),
      capturas: [c7],
    });

    // ── P16 parámetro → P14b visible ────────────────────────────────
    await L.entrar(page, "00000001");
    await page.goto(`${L.WEB}/configuracion`);
    await page.getByRole("tab", { name: /Taller/ }).click();
    const campo = page.getByLabel("Respuestas mínimas para mostrar una encuesta", { exact: true });
    await campo.fill("2");
    await page.getByLabel("Guardar Respuestas mínimas para mostrar una encuesta").click();
    await page.waitForTimeout(1200);
    await campo.scrollIntoViewIfNeeded();
    const c8 = await L.captura(page, "p16-parametro-editado");
    await L.entrar(page, ROSA.dni, ROSA.clave);
    await page.goto(`${L.WEB}/encuestas-resultados`);
    await page.waitForTimeout(1500);
    const c9 = await L.captura(page, "p14b-resultados-visibles");
    const res = await L.api("GET", "/api/encuestas/resultados", ROSA);
    await L.api("PATCH", "/api/configuracion/taller/parametros/minimoRespuestasEncuesta", "00000001", { valor: 5 });
    L.registrar({
      id: "P14B-01",
      seccion: "P14b Resultados de la encuesta",
      titulo: "Resultados agregados sin identidad (con el mínimo ajustado en P16)",
      pasos: "Administrador cambia «Respuestas mínimas» de 5 a 2 en P16; la asesora abre sus resultados; luego se restaura a 5.",
      esperado: "Promedio general y por pregunta, número de respuestas y comentarios, nunca quién respondió; el parámetro rige al guardarse.",
      obtenido: `Resultado: ${JSON.stringify(res.json?.items?.[0] ? { respuestas: res.json.items[0].respuestas, promedio: res.json.items[0].promedioGeneral, comentarios: res.json.items[0].comentarios } : {})}. Parámetro restaurado a ${L.sql("select valor from parametros_taller where clave='minimoRespuestasEncuesta'")}.`,
      estado: L.ok(res.json?.items?.[0]?.visibles === true),
      capturas: [c8, c9],
    });

    // ── Proceso diario: evidencias en TALLER 06 y QA-01 ─────────────
    const sis = L.sql("select string_agg(t.nombre||': '||a.accion||' — '||a.detalle, ' || ' order by a.created_at) from auditoria_taller a join talleres t on t.id=a.taller_id where a.actor_dni='SISTEMA'");
    L.registrar({
      id: "PRG-01",
      seccion: "Procesos programados (§12)",
      titulo: "Inicio del taller, pensiones vencidas, hitos no entregados y reportes",
      pasos: "Proceso diario al arrancar la API (y a las 00:10 hora de Perú) sobre los datos del seed y del TALLER QA-01.",
      esperado: "Detecta plan no presentado / avances vencidos (alerta), vence pensiones y avisa, marca EN CURSO y avisa los reportes en su fecha.",
      obtenido: sis,
      estado: L.ok(/VENCER_PENSION/.test(sis) && /INICIO_TALLER/.test(sis) && /REPORTE_/.test(sis)),
      capturas: [],
    });
    L.registrar({
      id: "PRG-02",
      seccion: "Procesos programados (§12)",
      titulo: "El taller pasa a FINALIZADO tras su fecha de fin",
      pasos: "TALLER QA-01 termina el 24/01/2027.",
      esperado: "EN CURSO → FINALIZADO el día siguiente a la fecha de fin.",
      obtenido: "No verificable en la fecha de la prueba (09/11/2026). Regla cubierta por la prueba unitaria «finaliza el día siguiente a la fecha de fin» (packages/domain). Queda pendiente verificarlo después del 24/01/2027 con estos datos.",
      estado: "PENDIENTE",
      capturas: [],
    });
  } catch (e) {
    await L.captura(page, "error-fase6").catch(() => {});
    console.error("ERROR fase6:", e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
