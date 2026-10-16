import { db, documentos, expedientes } from "@pis/db";
import {
  CHECKLIST_COMPLETO,
  type ChecklistDef,
  cargaHabilitadaTesista,
  DomainError,
  fail,
  ok,
  type Result,
} from "@pis/domain";
import { and, desc, eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import type { AlmacenamientoPort } from "../../../../infra/storage/almacenamiento.port.js";
import { LocalStorageService } from "../../../../infra/storage/local-storage.service.js";
import { appendAuditoria } from "../../../expedientes/expedientes.auditoria.js";
import { leerChecklist, subetapaActivaDe } from "../../../expedientes/expedientes.repository.js";

const MAX_BYTES = 50 * 1024 * 1024; // R2: tesis de 20–50MB

/** Magic bytes PDF: el archivo debe empezar con `%PDF-` (no basta la extensión). */
const CABECERA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export function esPdfReal(bytes: Uint8Array): boolean {
  if (bytes.length < CABECERA_PDF.length) return false;
  return CABECERA_PDF.every((b, i) => bytes[i] === b);
}

export interface SubirDocumentoInput {
  expedienteId: string;
  tipo: string;
  filename: string;
  bytes: Uint8Array;
  actor: { id: string; dni: string };
  /** true = el actor es el tesista (RN-06: solo su subetapa activa). */
  comoTesista?: boolean;
}

export interface DocumentoSubido {
  id: string;
  tipo: string;
  version: number;
  sha256: string;
  estado: string;
}

/**
 * Upload real: valida → disco → nueva versión (historial íntegro) →
 * auditoría hash, en un COMMIT. El tesista solo carga lo de su subetapa
 * activa o lo observado (RN-06) y no reemplaza un documento aprobado.
 */
export class SubirDocumentoUseCase {
  constructor(
    private readonly storage: AlmacenamientoPort = new LocalStorageService(),
    private readonly catalogo?: readonly ChecklistDef[],
  ) {}

  async execute(input: SubirDocumentoInput): Promise<Result<DocumentoSubido, DomainError>> {
    // Validaciones puras primero: un archivo inválido nunca toca la DB ni el disco.
    if (!input.filename.toLowerCase().endsWith(".pdf")) {
      return fail(new DomainError("DOCUMENTO_INVALIDO", "Solo se admiten archivos PDF"));
    }
    if (input.bytes.length === 0 || input.bytes.length > MAX_BYTES) {
      return fail(new DomainError("DOCUMENTO_INVALIDO", "El archivo debe pesar entre 1B y 50MB"));
    }
    if (!esPdfReal(input.bytes)) {
      return fail(
        new DomainError("DOCUMENTO_INVALIDO", "El archivo no es un PDF válido (cabecera)"),
      );
    }
    const enCodigo = CHECKLIST_COMPLETO.find((d) => d.tipo === input.tipo);
    if (this.catalogo && !this.catalogo.some((d) => d.tipo === input.tipo)) {
      return fail(new DomainError("DOCUMENTO_INVALIDO", `Tipo desconocido: ${input.tipo}`));
    }
    const uow = new DrizzleUnitOfWork(db);
    const r = await uow.run(async (tx) => {
      const catalogo = this.catalogo ?? (await leerChecklist(tx));
      const def = catalogo.find((d) => d.tipo === input.tipo) ?? enCodigo;
      if (!def)
        return fail(new DomainError("DOCUMENTO_INVALIDO", `Tipo desconocido: ${input.tipo}`));
      const exp = await tx
        .select({ id: expedientes.id, estado: expedientes.estado })
        .from(expedientes)
        .where(eq(expedientes.id, input.expedienteId))
        .limit(1);
      const expediente = exp[0];
      if (!expediente) return fail(new DomainError("NO_ENCONTRADO", "Expediente no encontrado"));
      if (expediente.estado === "ANULADO") {
        return fail(new DomainError("TRANSICION_INVALIDA", "El expediente está anulado"));
      }
      const previos = await tx
        .select({ version: documentos.version, estado: documentos.estado })
        .from(documentos)
        .where(
          and(eq(documentos.expedienteId, input.expedienteId), eq(documentos.tipo, input.tipo)),
        )
        .orderBy(desc(documentos.version))
        .limit(1);
      const ultimo = previos[0] ?? null;
      if (input.comoTesista) {
        const activa = await subetapaActivaDe(tx, input.expedienteId);
        const habilitado = cargaHabilitadaTesista(
          { tipo: def.tipo, requeridoEn: def.requeridoEn, estado: ultimo?.estado ?? "PENDIENTE" },
          activa?.clave ?? null,
        );
        if (!habilitado) {
          return fail(
            new DomainError(
              "PERMISO_DENEGADO",
              "Este documento no corresponde a la subetapa en curso de tu trámite (RN-06)",
            ),
          );
        }
        if (ultimo?.estado === "APROBADO") {
          return fail(
            new DomainError(
              "PERMISO_DENEGADO",
              "El documento ya fue aprobado; no puede reemplazarse",
            ),
          );
        }
      }
      const version = (ultimo?.version ?? 0) + 1;
      const nombre = `${input.tipo}_v${version}.pdf`;
      const { ruta, sha256 } = await this.storage.save(input.expedienteId, nombre, input.bytes);
      const inserted = await tx
        .insert(documentos)
        .values({
          expedienteId: input.expedienteId,
          tipo: input.tipo,
          etapa: def.etapa,
          ruta,
          version,
          sha256,
          estado: "CARGADO",
          origen: "WEB",
          driveSyncEstado: process.env.GOOGLE_DRIVE_ENABLED === "true" ? "PENDIENTE" : "NO_APLICA",
        })
        .returning({ id: documentos.id });
      const doc = inserted[0];
      if (!doc)
        return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo registrar el documento"));
      await tx
        .update(expedientes)
        .set({ updatedAt: new Date() })
        .where(eq(expedientes.id, input.expedienteId));
      await appendAuditoria(tx, {
        expedienteId: input.expedienteId,
        actorId: input.actor.id,
        actorDni: input.actor.dni,
        estadoAnterior: expediente.estado,
        estadoNuevo: expediente.estado,
        detalle: `Documento ${input.tipo} v${version} cargado (sha256 ${sha256.slice(0, 12)}…)`,
      });
      return ok({ id: doc.id, tipo: input.tipo, version, sha256, estado: "CARGADO" });
    });
    if (r.ok && process.env.GOOGLE_DRIVE_ENABLED === "true") {
      try {
        const { getBoss } = await import("../../../../infra/jobs/pg-boss.client.js");
        const { COLAS } = await import("../../../../infra/jobs/colas.js");
        const boss = await getBoss();
        await boss.send(
          COLAS.SYNC_DRIVE_INSTITUCIONAL,
          { documentoId: r.value.id, expedienteId: input.expedienteId },
          { retryLimit: 5, retryDelay: 30, retryBackoff: true },
        );
      } catch (err) {
        console.error("[SubirDocumentoUseCase] no se pudo encolar sync drive", err);
      }
    }
    return r;
  }
}
