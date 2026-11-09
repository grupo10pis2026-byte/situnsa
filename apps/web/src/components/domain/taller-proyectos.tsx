import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { ApiError } from "../../api/errores.js";
import {
  type CandidatoTallerDTO,
  esVigente,
  useAsignarProyecto,
  useCandidato,
  useProyectos,
} from "../../api/taller.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { Card, CardEncabezado } from "../ui/card.js";
import { DataTable } from "../ui/data-table.js";
import { Dialogo } from "../ui/dialog.js";
import { controlClase, Field } from "../ui/field.js";
import { Select } from "../ui/select.js";
import { useToast } from "../ui/toast.js";
import { Tooltip } from "../ui/tooltip.js";

/**
 * P3 pestaña Alumnos (spec v1.0 §9) y D1 Asignar alumno (§10). Un proyecto
 * tiene 1 o 2 tesistas y cuenta 1 en el cupo. La asignación habitual la hace
 * la validación de la inscripción; este botón sirve para agregar o corregir.
 */
export function ProyectosTab({
  tallerId,
  puedeAsignar,
}: {
  tallerId: string;
  puedeAsignar: boolean;
}) {
  const q = useProyectos(tallerId);
  const [asignar, setAsignar] = useState(false);
  const datos = q.data;
  const lleno = datos ? datos.cupo.asignados >= datos.cupo.cupo : false;
  const cerrado = datos ? !esVigente(datos.estadoTaller) : false;
  const motivo = cerrado
    ? "El taller ya no recibe alumnos"
    : lleno
      ? `Cupo lleno: ${datos?.cupo.asignados} de ${datos?.cupo.cupo} proyectos`
      : null;

  return (
    <Card>
      <CardEncabezado
        titulo="Proyectos del taller"
        descripcion={
          datos
            ? `${datos.cupo.asignados} de ${datos.cupo.cupo} proyectos. Un proyecto tiene 1 o 2 tesistas y cuenta 1 en el cupo; al llegar al cupo el taller se cierra a inscripciones.`
            : undefined
        }
        accion={
          puedeAsignar ? (
            motivo ? (
              <Tooltip texto={motivo}>
                <Button
                  aria-disabled="true"
                  aria-label={`Asignar alumno: no disponible. ${motivo}`}
                  className="cursor-not-allowed opacity-55"
                  tamano="sm"
                  variante="oscuro"
                  type="button"
                >
                  <UserPlus size={14} />
                  Asignar alumno
                </Button>
              </Tooltip>
            ) : (
              <Button tamano="sm" variante="oscuro" onClick={() => setAsignar(true)} type="button">
                <UserPlus size={14} />
                Asignar alumno
              </Button>
            )
          ) : null
        }
      />
      <div className="p-4 md:p-5">
        <DataTable
          cargando={q.isPending}
          vacio="Aún no hay proyectos asignados. La asignación habitual ocurre al validar la inscripción."
          columnas={[
            {
              encabezado: "Proyecto",
              celda: (p) => (
                <span>
                  <Link
                    to="/proyectos/$id/entregas"
                    params={{ id: p.id }}
                    className="font-bold tabular-nums text-navy-800 hover:underline"
                  >
                    {p.codigo}
                  </Link>
                  {p.expedienteCodigo && (
                    <span className="block text-xs text-grafito-600">{p.expedienteCodigo}</span>
                  )}
                </span>
              ),
            },
            {
              encabezado: "Tesistas",
              celda: (p) => (
                <ul className="space-y-0.5">
                  {p.tesistas.map((t) => (
                    <li key={t.alumnoId}>
                      {t.nombre}
                      {t.estado === "RETIRADO" && (
                        <span className="ml-1 text-xs font-semibold text-red-700">(retirado)</span>
                      )}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              encabezado: "Grupo de horario",
              celda: (p) =>
                p.grupoHorario
                  ? `${p.grupoHorario.nombre} · ${p.grupoHorario.horaInicio}`
                  : "Sin grupo",
            },
            {
              encabezado: "Asistencia",
              celda: (p) => (
                <ul className="space-y-0.5 tabular-nums">
                  {p.tesistas.map((t) => (
                    <li
                      key={t.alumnoId}
                      className={cn(t.asistenciaBaja && "font-semibold text-red-700")}
                    >
                      {t.asistenciaPct === null ? "—" : `${t.asistenciaPct} %`}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              encabezado: "Pensiones",
              celda: (p) => (
                <ul className="space-y-0.5">
                  {p.tesistas.map((t) => (
                    <li key={t.alumnoId}>
                      {t.pensionesPagadas} de {t.pensionesTotal || 3} pagadas
                    </li>
                  ))}
                </ul>
              ),
            },
          ]}
          filas={datos?.items ?? []}
        />
      </div>
      {asignar && datos && (
        <AsignarDialogo
          tallerId={tallerId}
          cupo={datos.cupo}
          grupos={datos.grupos}
          onCerrar={() => setAsignar(false)}
        />
      )}
    </Card>
  );
}

function Chips({ c }: { c: CandidatoTallerDTO }) {
  if (!c.encontrado) return <p className="mt-1 text-xs font-medium text-red-700">{c.motivo}</p>;
  const chip = (bien: boolean, texto: string) => (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        bien
          ? "border-green-300 bg-verde-inst-100 text-verde-inst-700"
          : "border-red-300 bg-red-100 text-red-800",
      )}
    >
      {bien ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
      {texto}
    </span>
  );
  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-sm font-semibold text-navy-950">{c.nombre}</p>
      <div className="flex flex-wrap gap-1.5">
        {chip(
          c.inscripcionValidada,
          c.inscripcionValidada ? "Inscripción VALIDADA" : "Inscripción sin validar",
        )}
        {chip(
          c.tallerActivo === null,
          c.tallerActivo ? `En ${c.tallerActivo.nombre}` : "Sin taller activo",
        )}
      </div>
      {c.motivo && <p className="text-xs font-medium text-red-700">{c.motivo}</p>}
    </div>
  );
}

function AsignarDialogo({
  tallerId,
  cupo,
  grupos,
  onCerrar,
}: {
  tallerId: string;
  cupo: { asignados: number; cupo: number };
  grupos: Array<{ id: string; nombre: string; horaInicio: string; horaFin: string }>;
  onCerrar: () => void;
}) {
  const avisar = useToast();
  const asignar = useAsignarProyecto(tallerId);
  const [dni1, setDni1] = useState("");
  const [dni2, setDni2] = useState("");
  const [grupo, setGrupo] = useState("");
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});
  const c1 = useCandidato(tallerId, dni1);
  const c2 = useCandidato(tallerId, dni2);
  const bloqueo = c1.data?.motivo ?? (dni2 !== "" ? c2.data?.motivo : null) ?? null;
  const listo =
    /^\d{8}$/.test(dni1) &&
    c1.data !== undefined &&
    (dni2 === "" || (/^\d{8}$/.test(dni2) && c2.data !== undefined && dni2 !== dni1)) &&
    !bloqueo;

  async function confirmar(): Promise<void> {
    try {
      const r = await asignar.mutateAsync({
        dni1,
        dni2: dni2 === "" ? null : dni2,
        grupoHorarioId: grupo === "" ? null : grupo,
      });
      avisar(
        r.estadoTaller === "COMPLETO"
          ? "Alumno asignado. El taller llegó al cupo y quedó COMPLETO"
          : "Alumno asignado. Se le avisó por correo",
      );
      onCerrar();
    } catch (e) {
      if (e instanceof ApiError) setErrores(e.campos);
      avisar(e instanceof Error ? e.message : "No se pudo asignar", "error");
    }
  }

  const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 8);

  return (
    <Dialogo
      abierto
      onAbierto={(v) => {
        if (!v) onCerrar();
      }}
      titulo="Asignar alumno"
      descripcion="Al asignar se crean su asistencia y sus 3 pensiones (la 1.ª pagada) y se le avisa por correo."
    >
      <div className="mt-4 space-y-3">
        <Field etiqueta="DNI del alumno *" error={errores.dni1}>
          <input
            aria-label="DNI del alumno"
            className={cn(controlClase, "h-10", errores.dni1 && "border-red-400")}
            inputMode="numeric"
            value={dni1}
            onChange={(e) => {
              setDni1(soloDigitos(e.target.value));
              setErrores((x) => ({ ...x, dni1: undefined }));
            }}
          />
          {c1.data && <Chips c={c1.data} />}
        </Field>
        <Field etiqueta="DNI del segundo tesista (opcional)" error={errores.dni2}>
          <input
            aria-label="DNI del segundo tesista"
            className={cn(controlClase, "h-10", errores.dni2 && "border-red-400")}
            inputMode="numeric"
            value={dni2}
            onChange={(e) => {
              setDni2(soloDigitos(e.target.value));
              setErrores((x) => ({ ...x, dni2: undefined }));
            }}
          />
          {dni2 !== "" && dni2 === dni1 && (
            <span className="mt-1 block text-xs font-medium text-red-700">
              El segundo tesista debe ser otra persona
            </span>
          )}
          {c2.data && dni2 !== dni1 && <Chips c={c2.data} />}
        </Field>
        <Select label="GRUPO DE HORARIO (OPCIONAL)" value={grupo} onChange={setGrupo}>
          <option value="">
            {grupos.length === 0 ? "El asesor aún no creó grupos" : "Sin grupo"}
          </option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nombre} · {g.horaInicio}–{g.horaFin}
            </option>
          ))}
        </Select>
        <p className="text-sm text-grafito-600">
          Cupo: {cupo.asignados} de {cupo.cupo} proyectos.
        </p>
        <div className="flex justify-end gap-2">
          <Button variante="contorno" onClick={onCerrar} type="button">
            Cancelar
          </Button>
          <Button
            variante="oscuro"
            disabled={!listo || asignar.isPending}
            title={bloqueo ?? undefined}
            onClick={() => void confirmar()}
            type="button"
          >
            Asignar
          </Button>
        </div>
      </div>
    </Dialogo>
  );
}
