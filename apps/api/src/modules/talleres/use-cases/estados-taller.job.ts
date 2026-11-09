import { db, talleres } from "@pis/db";
import { estadoPorFechaFin, estadoPorFechaInicio } from "@pis/domain";
import { and, eq, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import { enviarReportesProgramados, procesarHitosVencidos } from "../alertas/alertas.service.js";
import { procesarPensiones } from "../pagos/pagos.use-cases.js";
import { appendAuditoriaTaller } from "../taller-auditoria.js";

function hoyLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/**
 * Proceso diario (spec v1.0 §6, propuesta): un taller abierto o completo
 * pasa a EN_CURSO en su fecha de inicio. Idempotente; deja el cambio en el
 * historial del taller con el actor SISTEMA.
 */
export async function actualizarEstadosPorFecha(hoy: string = hoyLima()): Promise<number> {
  const candidatos = await db
    .select({ id: talleres.id, estado: talleres.estado, inicio: talleres.fechaInicio })
    .from(talleres)
    .where(
      and(
        inArray(talleres.estado, ["ABIERTO_INSCRIPCIONES", "COMPLETO"]),
        isNotNull(talleres.fechaInicio),
        lte(talleres.fechaInicio, hoy),
      ),
    );
  let cambiados = 0;
  for (const t of candidatos) {
    const nuevo = estadoPorFechaInicio(t.estado, t.inicio, hoy);
    if (nuevo === t.estado) continue;
    await new DrizzleUnitOfWork(db).run(async (tx) => {
      const r = await tx
        .update(talleres)
        .set({ estado: nuevo, updatedAt: new Date() })
        .where(and(eq(talleres.id, t.id), eq(talleres.estado, t.estado)))
        .returning({ id: talleres.id });
      if (r.length === 0) return;
      await appendAuditoriaTaller(tx, {
        tallerId: t.id,
        actorId: null,
        actorDni: "SISTEMA",
        accion: "INICIO_TALLER",
        detalle: `El taller empezó el ${t.inicio}: pasa a ${nuevo}`,
      });
      cambiados += 1;
    });
  }
  return cambiados;
}

/**
 * Proceso diario del taller (00:10 Lima): inicio de talleres, pensiones
 * vencidas y su aviso previo, hitos no entregados (con alerta) y fin del
 * taller (FINALIZADO). Al
 * arrancar el servidor se corre sin el aviso previo (no se duplica).
 */
export async function procesoDiarioTaller(
  opciones: { avisosPrevios?: boolean } = {},
): Promise<void> {
  const hoy = hoyLima();
  await actualizarEstadosPorFecha(hoy);
  await procesarPensiones(hoy, opciones.avisosPrevios ?? true);
  await procesarHitosVencidos(hoy);
  await finalizarTalleres(hoy);
  await enviarReportesProgramados(hoy);
}

/** §8 paso 13: EN_CURSO → FINALIZADO tras la fecha de fin (historial con actor SISTEMA). */
export async function finalizarTalleres(hoy: string = hoyLima()): Promise<number> {
  const candidatos = await db
    .select({ id: talleres.id, estado: talleres.estado, fin: talleres.fechaFin })
    .from(talleres)
    .where(
      and(
        eq(talleres.estado, "EN_CURSO"),
        isNotNull(talleres.fechaFin),
        lt(talleres.fechaFin, hoy),
      ),
    );
  let n = 0;
  for (const t of candidatos) {
    const nuevo = estadoPorFechaFin(t.estado, t.fin, hoy);
    if (nuevo === t.estado) continue;
    await new DrizzleUnitOfWork(db).run(async (tx) => {
      const r = await tx
        .update(talleres)
        .set({ estado: nuevo, updatedAt: new Date() })
        .where(and(eq(talleres.id, t.id), eq(talleres.estado, "EN_CURSO")))
        .returning({ id: talleres.id });
      if (r.length === 0) return;
      await appendAuditoriaTaller(tx, {
        tallerId: t.id,
        actorId: null,
        actorDni: "SISTEMA",
        accion: "FIN_TALLER",
        detalle: `El taller terminó el ${t.fin}: pasa a FINALIZADO`,
      });
      n += 1;
    });
  }
  return n;
}
