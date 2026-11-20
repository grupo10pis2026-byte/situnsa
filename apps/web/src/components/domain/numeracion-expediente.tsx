import type { EstadoNumeracionDTO, RegistroNumeracionDTO } from "@pis/contracts";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Link2, Unlink } from "lucide-react";
import { type ReactNode, useState } from "react";
import { esStaff, rolGuardado } from "../../api/guard.js";
import { useCambiarVinculo, useNumeracionExpediente } from "../../api/numeracion.js";
import { Button } from "../ui/button.js";
import { ConfirmDialog } from "../ui/confirm-dialog.js";
import { controlClase, Field, ReadonlyField } from "../ui/field.js";
import { StatusBadge } from "../ui/status-badge.js";
import { useToast } from "../ui/toast.js";

const ETIQUETA = { OFICIO: "N° OFICIO CIRCULAR", DECRETO: "N° DECRETO" } as const;

function fechaCorta(iso: string | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE");
}

/** Resumen de una fila del Excel para reconocerla de un vistazo. */
function resumen(r: RegistroNumeracionDTO): string {
  const d = r.datos;
  const partes =
    r.tipo === "OFICIO"
      ? [fechaCorta(d.fechaDoc), d.asunto, d.expediente]
      : [fechaCorta(d.fechaEmision), d.nombreAlumno, d.tesis];
  return partes.filter(Boolean).join(" · ") || "Sin datos en el Excel";
}

/**
 * N° de oficio circular y de decreto desde el registro (Excel maestro).
 * Sin registro importado se muestran los campos manuales (`manual`).
 */
export function NumeracionExpediente({
  expedienteId,
  manual,
}: {
  expedienteId: string;
  manual: ReactNode;
}) {
  const numeracion = useNumeracionExpediente(expedienteId);
  if (numeracion.isPending) return <p className="text-sm text-grafito-600">Cargando…</p>;
  if (numeracion.isError || !numeracion.data.registroDisponible) {
    return (
      <>
        {manual}
        <p className="col-span-full text-xs text-grafito-600">
          Cuando se importe el Excel en{" "}
          <Link className="font-semibold text-navy-800 hover:underline" to="/registro-oficios">
            Oficios y decretos
          </Link>
          , estos números se asignarán desde el registro.
        </p>
      </>
    );
  }
  return (
    <>
      <BloqueNumero estado={numeracion.data.OFICIO} expedienteId={expedienteId} />
      <BloqueNumero estado={numeracion.data.DECRETO} expedienteId={expedienteId} />
    </>
  );
}

function BloqueNumero({
  estado,
  expedienteId,
}: {
  estado: EstadoNumeracionDTO;
  expedienteId: string;
}) {
  const cambiar = useCambiarVinculo(expedienteId);
  const avisar = useToast();
  const [numero, setNumero] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const puedeEditar = esStaff(rolGuardado());
  const nombre = estado.tipo === "OFICIO" ? "oficio circular" : "decreto";
  const r = estado.registro;

  async function aplicar(valor: string | null) {
    setConfirmar(false);
    try {
      await cambiar.mutateAsync({ tipo: estado.tipo, numero: valor });
      setNumero("");
      avisar(valor === null ? `Se liberó el ${nombre}` : `Se vinculó el ${nombre}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : "No se pudo actualizar el vínculo", "error");
    }
  }

  if (r) {
    return (
      <div className="space-y-1.5">
        <ReadonlyField
          etiqueta={ETIQUETA[estado.tipo]}
          valor={
            <span className="flex items-center justify-between gap-2">
              <span className="font-bold tabular-nums">{r.numeroFormateado}</span>
              <StatusBadge
                estado={r.vigente ? "VALIDADO" : "RECHAZADO"}
                etiqueta={r.vigente ? "Del registro" : "Retirado del Excel"}
              />
            </span>
          }
        />
        <p className="line-clamp-2 text-xs text-grafito-600">{resumen(r)}</p>
        {!r.vigente && (
          <p className="flex gap-1 text-xs text-aviso-800">
            <AlertTriangle className="mt-0.5 shrink-0" size={13} />
            Este número ya no figura en el último Excel importado. Revíselo con el área.
          </p>
        )}
        {puedeEditar && (
          <Button
            disabled={cambiar.isPending}
            onClick={() => setConfirmar(true)}
            tamano="xs"
            variante="fantasma"
          >
            <Unlink size={13} /> Desvincular
          </Button>
        )}
        {confirmar && (
          <ConfirmDialog
            confirmar="Desvincular"
            mensaje={`El ${nombre} N° ${r.numeroFormateado} quedará libre y el expediente sin número hasta vincular otro.`}
            onCancelar={() => setConfirmar(false)}
            onConfirmar={() => void aplicar(null)}
            peligroso
            titulo={`¿Desvincular el ${nombre}?`}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Field
        {...(puedeEditar ? { ayuda: "Número tal como figura en el Excel." } : {})}
        etiqueta={ETIQUETA[estado.tipo]}
      >
        {puedeEditar ? (
          <div className="flex gap-2">
            <input
              className={controlClase}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && numero.trim()) void aplicar(numero.trim());
              }}
              placeholder="Sin vincular"
              value={numero}
            />
            <Button
              disabled={!numero.trim() || cambiar.isPending}
              onClick={() => void aplicar(numero.trim())}
              tamano="md"
              variante="oscuro"
            >
              Vincular
            </Button>
          </div>
        ) : (
          <p className="rounded-lg bg-slate-100/70 px-3 py-2 text-sm text-grafito-600">
            Sin vincular
          </p>
        )}
      </Field>
      {puedeEditar && estado.candidatos.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-bold tracking-wider text-grafito-600 uppercase">
            Coincidencias en el registro
          </p>
          {estado.candidatos.slice(0, 3).map((c) => (
            <div
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 px-2.5 py-1.5"
              key={c.registro.id}
            >
              <p className="min-w-0 text-xs text-grafito-900">
                <span className="font-bold tabular-nums">N° {c.registro.numeroFormateado}</span>
                <span className="line-clamp-1 text-grafito-600">{resumen(c.registro)}</span>
              </p>
              <Button
                disabled={cambiar.isPending}
                onClick={() => void aplicar(c.registro.numero)}
                tamano="xs"
                variante="contorno"
              >
                <Link2 size={13} /> Vincular
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
