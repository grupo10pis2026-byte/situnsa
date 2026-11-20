import { db, expedientes, vinculosNumeracion } from "@pis/db";
import {
  DomainError,
  fail,
  formatearNumeroRegistro,
  ok,
  type Result,
  type TipoNumeracion,
} from "@pis/domain";
import { and, eq } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../../infra/db/unit-of-work.js";
import { appendAuditoria } from "../../../expedientes/expedientes.auditoria.js";
import { sincronizarExpediente } from "../../numeracion.repository.js";
import { NOMBRE_TIPO } from "../vincular-numero/vincular-numero.use-case.js";

export interface Actor {
  id: string;
  dni: string;
}

/** Libera el número del expediente (queda disponible para otro) y limpia el campo. */
export class DesvincularNumeroUseCase {
  async execute(input: {
    expedienteId: string;
    tipo: TipoNumeracion;
    actor: Actor;
  }): Promise<Result<{ liberado: string }, DomainError>> {
    const nombre = NOMBRE_TIPO[input.tipo];
    const uow = new DrizzleUnitOfWork(db);
    return uow.run(async (tx) => {
      const [exp] = await tx
        .select({ estado: expedientes.estado })
        .from(expedientes)
        .where(eq(expedientes.id, input.expedienteId))
        .limit(1);
      if (!exp) return fail(new DomainError("NO_ENCONTRADO", "Expediente no encontrado"));
      if (exp.estado === "ANULADO") {
        return fail(new DomainError("TRANSICION_INVALIDA", "El expediente está anulado"));
      }
      const borrados = await tx
        .delete(vinculosNumeracion)
        .where(
          and(
            eq(vinculosNumeracion.tipo, input.tipo),
            eq(vinculosNumeracion.expedienteId, input.expedienteId),
          ),
        )
        .returning({ clave: vinculosNumeracion.clave });
      const v = borrados[0];
      if (!v) {
        return fail(new DomainError("NO_ENCONTRADO", `El expediente no tiene ${nombre} vinculado`));
      }
      await sincronizarExpediente(tx, input.expedienteId, input.tipo, null);
      const liberado = formatearNumeroRegistro(v.clave);
      await appendAuditoria(tx, {
        expedienteId: input.expedienteId,
        actorId: input.actor.id || null,
        actorDni: input.actor.dni,
        estadoAnterior: exp.estado,
        estadoNuevo: exp.estado,
        detalle: `${nombre[0]?.toUpperCase()}${nombre.slice(1)} N° ${liberado} desvinculado (número liberado)`,
      });
      return ok({ liberado });
    });
  }
}
