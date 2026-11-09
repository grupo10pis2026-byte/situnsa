import { randomUUID } from "node:crypto";
import {
  comprobantesPension,
  type DbExecutor,
  db,
  pensionesAlumno,
  pensionesTaller,
  proyectosTaller,
  proyectoTesistas,
  usuarios,
} from "@pis/db";
import {
  assertTransicionPension,
  DomainError,
  debeVencer,
  FORMATOS_COMPROBANTE,
  fail,
  ok,
  puedeSubirComprobante,
  type Result,
  tocaAvisoPension,
  validarArchivo,
  validarObservacionComprobante,
} from "@pis/domain";
import { and, eq, isNotNull } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import type { AlmacenamientoPort } from "../../../infra/storage/almacenamiento.port.js";
import { leerParametrosTaller } from "../../taller-config/taller-config.repository.js";
import { hoyLima } from "../sesiones/sesiones.repository.js";
import { appendAuditoriaTaller } from "../taller-auditoria.js";
import { avisar, correosSecretaria } from "../taller-avisos.js";
import { tallerDelAlumno } from "./pagos.repository.js";

/**
 * P8/P9 (spec v1.0): comprobantes de pensión, validación u observación por
 * la Secretaría, pago directo y el proceso diario de vencimiento y aviso.
 */

export interface Actor {
  id: string;
  dni: string;
}

const idActor = (a: Actor) => (a.id === "" ? null : a.id);

interface PensionConTaller {
  pension: typeof pensionesAlumno.$inferSelect;
  tallerId: string;
  numero: number;
  monto: number;
  email: string;
  alumno: string;
}

async function pensionPorId(
  tx: DbExecutor,
  id: string,
  bloquear = false,
): Promise<PensionConTaller | null> {
  const consulta = tx
    .select({
      pension: pensionesAlumno,
      tallerId: pensionesTaller.tallerId,
      numero: pensionesTaller.numero,
      monto: pensionesTaller.monto,
      email: usuarios.email,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
    })
    .from(pensionesAlumno)
    .innerJoin(pensionesTaller, eq(pensionesTaller.id, pensionesAlumno.pensionTallerId))
    .innerJoin(usuarios, eq(usuarios.id, pensionesAlumno.alumnoId))
    .where(eq(pensionesAlumno.id, id))
    .limit(1);
  const [f] = bloquear ? await consulta.for("update", { of: pensionesAlumno }) : await consulta;
  return f
    ? {
        pension: f.pension,
        tallerId: f.tallerId,
        numero: f.numero,
        monto: f.monto,
        email: f.email,
        alumno: `${f.nombres} ${f.apellidos}`,
      }
    : null;
}

export async function pensionDeComprobante(comprobanteId: string): Promise<string | null> {
  const [c] = await db
    .select({ id: comprobantesPension.pensionAlumnoId })
    .from(comprobantesPension)
    .where(eq(comprobantesPension.id, comprobanteId))
    .limit(1);
  return c?.id ?? null;
}

export interface ArchivoSubido {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

function firmaComprobante(mime: string, b: Uint8Array): boolean {
  if (mime === "application/pdf") return new TextDecoder().decode(b.subarray(0, 5)) === "%PDF-";
  if (mime === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  return b[0] === 0xff && b[1] === 0xd8;
}

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export class SubirComprobanteUseCase {
  constructor(private readonly storage: AlmacenamientoPort) {}

  async execute(
    pensionAlumnoId: string,
    archivo: ArchivoSubido,
    actor: Actor,
  ): Promise<Result<true, DomainError>> {
    const parametros = await leerParametrosTaller();
    const v = validarArchivo(
      { mime: archivo.mime, bytes: archivo.bytes.byteLength },
      FORMATOS_COMPROBANTE,
      parametros.maxMbComprobante,
    );
    if (!v.ok) return v;
    if (!firmaComprobante(archivo.mime, archivo.bytes))
      return fail(new DomainError("DOCUMENTO_INVALIDO", "El archivo no coincide con su formato"));
    const p0 = await pensionPorId(db, pensionAlumnoId);
    if (!p0) return fail(new DomainError("NO_ENCONTRADO", "Pensión no encontrada"));
    if (p0.pension.alumnoId !== actor.id)
      return fail(new DomainError("FUERA_DE_ALCANCE", "La pensión no es tuya"));
    const taller = await tallerDelAlumno(db, actor.id);
    if (taller?.estadoTesista === "RETIRADO")
      return fail(new DomainError("PERMISO_DENEGADO", "Retirado: solo lectura"));
    const guardado = await this.storage.save(
      p0.tallerId,
      `pension-${p0.numero}-${randomUUID()}.${EXT[archivo.mime] ?? "bin"}`,
      archivo.bytes,
      "comprobantes",
    );
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const p = await pensionPorId(tx, pensionAlumnoId, true);
      if (!p) return fail(new DomainError("NO_ENCONTRADO", "Pensión no encontrada"));
      const gate = puedeSubirComprobante(p.pension.estado);
      if (!gate.ok) return gate;
      const paso = assertTransicionPension(p.pension.estado, "EN_REVISION");
      if (!paso.ok) return paso;
      await tx.insert(comprobantesPension).values({
        pensionAlumnoId,
        ruta: guardado.ruta,
        sha256: guardado.sha256,
        nombreOriginal: archivo.filename.trim().slice(0, 255) || `comprobante.${EXT[archivo.mime]}`,
        mime: archivo.mime,
        bytes: archivo.bytes.byteLength,
        creadoPor: idActor(actor),
      });
      await tx
        .update(pensionesAlumno)
        .set({ estado: "EN_REVISION", observacion: null, updatedAt: new Date() })
        .where(eq(pensionesAlumno.id, pensionAlumnoId));
      await appendAuditoriaTaller(tx, {
        tallerId: p.tallerId,
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: "SUBIR_COMPROBANTE",
        detalle: `${p.alumno}: pensión ${p.numero}`,
      });
      return ok(p);
    });
    if (!r.ok) return r;
    await avisar(
      await correosSecretaria(),
      `Comprobante por validar: ${r.value.alumno} (pensión ${r.value.numero})`,
      `${r.value.alumno} subió el comprobante de su pensión ${r.value.numero}.`,
      "/pagos-taller",
      "Ver pagos",
    );
    return ok(true);
  }
}

type Revision = { tipo: "validar" } | { tipo: "observar"; motivo: string };

export class RevisarComprobanteUseCase {
  async execute(
    comprobanteId: string,
    rev: Revision,
    actor: Actor,
  ): Promise<Result<string, DomainError>> {
    if (rev.tipo === "observar") {
      const v = validarObservacionComprobante(rev.motivo);
      if (!v.ok) return v;
    }
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const [c] = await tx
        .select()
        .from(comprobantesPension)
        .where(eq(comprobantesPension.id, comprobanteId))
        .limit(1)
        .for("update");
      if (!c) return fail(new DomainError("NO_ENCONTRADO", "Comprobante no encontrado"));
      if (c.estado !== "EN_REVISION")
        return fail(new DomainError("TRANSICION_INVALIDA", "Este comprobante ya fue revisado"));
      const p = await pensionPorId(tx, c.pensionAlumnoId, true);
      if (!p) return fail(new DomainError("NO_ENCONTRADO", "Pensión no encontrada"));
      const destino = rev.tipo === "validar" ? "VALIDADA" : "OBSERVADA";
      const paso = assertTransicionPension(p.pension.estado, destino);
      if (!paso.ok) return paso;
      const ahora = new Date();
      await tx
        .update(comprobantesPension)
        .set({
          estado: rev.tipo === "validar" ? "VALIDADO" : "OBSERVADO",
          motivo: rev.tipo === "observar" ? rev.motivo.trim() : null,
          validadoPor: idActor(actor),
          validadoAt: ahora,
          updatedAt: ahora,
        })
        .where(eq(comprobantesPension.id, comprobanteId));
      await tx
        .update(pensionesAlumno)
        .set(
          rev.tipo === "validar"
            ? {
                estado: "VALIDADA",
                medio: "COMPROBANTE",
                montoPagado: p.monto,
                observacion: null,
                validadaPor: idActor(actor),
                validadaAt: ahora,
                updatedAt: ahora,
              }
            : { estado: "OBSERVADA", observacion: rev.motivo.trim(), updatedAt: ahora },
        )
        .where(eq(pensionesAlumno.id, p.pension.id));
      await appendAuditoriaTaller(tx, {
        tallerId: p.tallerId,
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: rev.tipo === "validar" ? "VALIDAR_COMPROBANTE" : "OBSERVAR_COMPROBANTE",
        detalle: `${p.alumno}: pensión ${p.numero}${rev.tipo === "observar" ? ` (${rev.motivo.trim()})` : ""}`,
      });
      return ok(p);
    });
    if (!r.ok) return r;
    const p = r.value;
    await avisar(
      [p.email],
      rev.tipo === "validar"
        ? `Tu pensión ${p.numero} quedó pagada`
        : `Tu comprobante de la pensión ${p.numero} fue observado`,
      rev.tipo === "validar"
        ? `La Secretaría validó tu comprobante de la pensión ${p.numero} (S/ ${p.monto}).`
        : `Motivo: ${rev.motivo.trim()}. Sube un nuevo comprobante desde Mis pagos.`,
      "/mis-pagos",
      "Ver Mis pagos",
    );
    return ok(p.pension.id);
  }
}

export class RegistrarPagoDirectoUseCase {
  async execute(
    pensionAlumnoId: string,
    observacion: string | null,
    actor: Actor,
  ): Promise<Result<string, DomainError>> {
    const r = await new DrizzleUnitOfWork(db).run(async (tx) => {
      const p = await pensionPorId(tx, pensionAlumnoId, true);
      if (!p) return fail(new DomainError("NO_ENCONTRADO", "Pensión no encontrada"));
      if (p.pension.estado === "EN_REVISION")
        return fail(
          new DomainError(
            "TRANSICION_INVALIDA",
            "Hay un comprobante en revisión: valídalo u obsérvalo",
          ),
        );
      const paso = assertTransicionPension(p.pension.estado, "VALIDADA");
      if (!paso.ok) return paso;
      const ahora = new Date();
      await tx
        .update(pensionesAlumno)
        .set({
          estado: "VALIDADA",
          medio: "PAGO_DIRECTO",
          montoPagado: p.monto,
          observacion: observacion?.trim() || null,
          validadaPor: idActor(actor),
          validadaAt: ahora,
          updatedAt: ahora,
        })
        .where(eq(pensionesAlumno.id, pensionAlumnoId));
      await appendAuditoriaTaller(tx, {
        tallerId: p.tallerId,
        actorId: idActor(actor),
        actorDni: actor.dni,
        accion: "PAGO_DIRECTO",
        detalle: `${p.alumno}: pensión ${p.numero} (S/ ${p.monto})`,
      });
      return ok(p);
    });
    if (!r.ok) return r;
    await avisar(
      [r.value.email],
      `Tu pensión ${r.value.numero} quedó pagada`,
      `La Secretaría registró el pago de tu pensión ${r.value.numero} (S/ ${r.value.monto}).`,
      "/mis-pagos",
      "Ver Mis pagos",
    );
    return ok(pensionAlumnoId);
  }
}

/**
 * Proceso diario (§5/§6): PENDIENTE con fecha pasada → VENCIDA (con aviso)
 * y aviso N días antes del vencimiento. Idempotente por día.
 */
export async function procesarPensiones(
  hoy: string = hoyLima(),
  avisosPrevios = true,
): Promise<{ vencidas: number; avisos: number }> {
  const parametros = await leerParametrosTaller();
  const filas = await db
    .select({
      id: pensionesAlumno.id,
      estado: pensionesAlumno.estado,
      fecha: pensionesTaller.fecha,
      numero: pensionesTaller.numero,
      monto: pensionesTaller.monto,
      tallerId: pensionesTaller.tallerId,
      alumnoId: pensionesAlumno.alumnoId,
      email: usuarios.email,
      nombres: usuarios.nombres,
      apellidos: usuarios.apellidos,
    })
    .from(pensionesAlumno)
    .innerJoin(pensionesTaller, eq(pensionesTaller.id, pensionesAlumno.pensionTallerId))
    .innerJoin(usuarios, eq(usuarios.id, pensionesAlumno.alumnoId))
    .where(and(eq(pensionesAlumno.estado, "PENDIENTE"), isNotNull(pensionesTaller.fecha)));
  // Un retirado no acumula vencimientos ni recibe avisos (su deuda previa se conserva).
  const retirados = new Set(
    (
      await db
        .select({ alumnoId: proyectoTesistas.alumnoId, tallerId: proyectosTaller.tallerId })
        .from(proyectoTesistas)
        .innerJoin(proyectosTaller, eq(proyectosTaller.id, proyectoTesistas.proyectoId))
        .where(eq(proyectoTesistas.estado, "RETIRADO"))
    ).map((r) => `${r.alumnoId}|${r.tallerId}`),
  );
  let vencidas = 0;
  let avisos = 0;
  for (const f of filas) {
    if (retirados.has(`${f.alumnoId}|${f.tallerId}`)) continue;
    if (debeVencer(f.estado, f.fecha, hoy)) {
      const cambio = await new DrizzleUnitOfWork(db).run(async (tx) => {
        const r = await tx
          .update(pensionesAlumno)
          .set({ estado: "VENCIDA", updatedAt: new Date() })
          .where(and(eq(pensionesAlumno.id, f.id), eq(pensionesAlumno.estado, "PENDIENTE")))
          .returning({ id: pensionesAlumno.id });
        if (r.length === 0) return ok(false);
        await appendAuditoriaTaller(tx, {
          tallerId: f.tallerId,
          actorId: null,
          actorDni: "SISTEMA",
          accion: "VENCER_PENSION",
          detalle: `${f.nombres} ${f.apellidos}: pensión ${f.numero} venció el ${f.fecha}`,
        });
        return ok(true);
      });
      if (cambio.ok && cambio.value) {
        vencidas += 1;
        await avisar(
          [f.email],
          `Tu pensión ${f.numero} está vencida`,
          `La pensión ${f.numero} (S/ ${f.monto}) venció el ${f.fecha}. Sube tu comprobante desde Mis pagos.`,
          "/mis-pagos",
          "Ver Mis pagos",
        );
      }
    } else if (
      avisosPrevios &&
      tocaAvisoPension({ estado: f.estado, fecha: f.fecha }, hoy, parametros)
    ) {
      avisos += 1;
      await avisar(
        [f.email],
        `Tu pensión ${f.numero} vence el ${f.fecha}`,
        `Recuerda pagar la pensión ${f.numero} (S/ ${f.monto}) y subir tu comprobante antes del ${f.fecha}.`,
        "/mis-pagos",
        "Ver Mis pagos",
      );
    }
  }
  return { vencidas, avisos };
}
