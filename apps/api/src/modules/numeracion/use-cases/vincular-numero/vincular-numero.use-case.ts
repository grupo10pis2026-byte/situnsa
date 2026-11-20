import { db, expedientes, registroNumeracion, vinculosNumeracion } from "@pis/db";
import {
  claveNumero,
  DomainError,
  fail,
  formatearNumeroRegistro,
  ok,
  type Result,
  type TipoNumeracion,
} from "@pis/domain";
import { and, eq, or, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { appendAuditoria } from "../../../expedientes/expedientes.auditoria.js";
import { sincronizarExpediente } from "../../numeracion.repository.js";

export interface Actor {
  id: string;
  dni: string;
}

export const NOMBRE_TIPO: Record<TipoNumeracion, string> = {
  OFICIO: "oficio circular",
  DECRETO: "decreto",
};

/**
 * Vincula un número del registro al expediente. Unicidad en ambos
 * sentidos: el número no puede estar en otro expediente y el expediente no
 * puede tener otro número del mismo tipo (desvincular primero).
 */
export class VincularNumeroUseCase {
  async execute(input: {
    expedienteId: string;
    tipo: TipoNumeracion;
    numero: string;
    actor: Actor;
  }): Promise<Result<{ numero: string }, DomainError>> {
    const clave = claveNumero(input.numero);
    if (!clave) return fail(new DomainError("VALIDACION_FALLIDA", "Indique el número"));
    const nombre = NOMBRE_TIPO[input.tipo];
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      // Serializa vínculos del mismo tipo (el índice único es la última defensa).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`vinculo:${input.tipo}`}))`);
      const [exp] = await tx
        .select({ estado: expedientes.estado, codigo: expedientes.codigo })
        .from(expedientes)
        .where(eq(expedientes.id, input.expedienteId))
        .limit(1);
      if (!exp) return fail(new DomainError("NO_ENCONTRADO", "Expediente no encontrado"));
      if (exp.estado === "ANULADO") {
        return fail(new DomainError("TRANSICION_INVALIDA", "El expediente está anulado"));
      }
      const [registro] = await tx
        .select()
        .from(registroNumeracion)
        .where(and(eq(registroNumeracion.tipo, input.tipo), eq(registroNumeracion.clave, clave)))
        .limit(1);
      if (!registro) {
        return fail(
          new DomainError(
            "NO_ENCONTRADO",
            `El ${nombre} N° ${input.numero} no figura en el registro importado. Actualice el Excel y vuelva a importarlo.`,
          ),
        );
      }
      if (!registro.vigente) {
        return fail(
          new DomainError(
            "VALIDACION_FALLIDA",
            `El ${nombre} N° ${registro.numero} ya no figura en el último Excel importado`,
          ),
        );
      }
      const existentes = await tx
        .select({
          clave: vinculosNumeracion.clave,
          expedienteId: vinculosNumeracion.expedienteId,
          codigo: expedientes.codigo,
        })
        .from(vinculosNumeracion)
        .innerJoin(expedientes, eq(expedientes.id, vinculosNumeracion.expedienteId))
        .where(
          and(
            eq(vinculosNumeracion.tipo, input.tipo),
            or(
              eq(vinculosNumeracion.clave, clave),
              eq(vinculosNumeracion.expedienteId, input.expedienteId),
            ),
          ),
        );
      const delNumero = existentes.find((e) => e.clave === clave);
      if (delNumero && delNumero.expedienteId === input.expedienteId) {
        return ok({ numero: formatearNumeroRegistro(registro.numero) });
      }
      if (delNumero) {
        return fail(
          new DomainError(
            "DATOS_DUPLICADOS",
            `El ${nombre} N° ${formatearNumeroRegistro(registro.numero)} ya pertenece al expediente ${delNumero.codigo}`,
          ),
        );
      }
      const propio = existentes.find((e) => e.expedienteId === input.expedienteId);
      if (propio) {
        return fail(
          new DomainError(
            "DATOS_DUPLICADOS",
            `El expediente ya tiene el ${nombre} N° ${formatearNumeroRegistro(propio.clave)}. Desvincúlelo antes de asignar otro.`,
          ),
        );
      }
      await tx.insert(vinculosNumeracion).values({
        tipo: input.tipo,
        clave,
        expedienteId: input.expedienteId,
        origen: "MANUAL",
        vinculadoPor: input.actor.id || null,
      });
      const s = await sincronizarExpediente(tx, input.expedienteId, input.tipo, registro);
      await appendAuditoria(tx, {
        expedienteId: input.expedienteId,
        actorId: input.actor.id || null,
        actorDni: input.actor.dni,
        estadoAnterior: exp.estado,
        estadoNuevo: exp.estado,
        detalle: `${nombre[0]?.toUpperCase()}${nombre.slice(1)} N° ${s.despues} vinculado desde el registro${s.antes && s.antes !== s.despues ? ` (antes: ${s.antes})` : ""}`,
      });
      return ok({ numero: s.despues ?? formatearNumeroRegistro(registro.numero) });
    });
  }
}
