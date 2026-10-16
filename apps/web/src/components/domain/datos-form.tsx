import type { ActualizarDatosInput, ExpedienteDetalleDTO } from "@pis/contracts";
import { horaLimpia } from "@pis/domain/dist/documentos/etiquetas.js";
import {
  ETIQUETAS_MODALIDAD,
  ETIQUETAS_MODALIDAD_FINAL,
  modalidadAEtiqueta,
} from "@pis/domain/dist/expediente/modalidades.js";
import { ClipboardList, FileText, Users } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useProgramas } from "../../api/catalogos.js";
import { type GuardadoEstado, useActualizarDatos } from "../../api/expedientes.js";
import { cn } from "../../utils/cn.js";
import { controlClase, Field, ReadonlyField } from "../ui/field.js";
import { FormSection } from "../ui/form-section.js";
import { InputFechaLatina } from "../ui/input-fecha-latina.js";
import { Select } from "../ui/select.js";

type Clave = keyof ActualizarDatosInput;

interface DefCampo {
  clave: Clave | null;
  label: string;
  /** doble: el campo ocupa 2 columnas (títulos de tesis). */
  ancho?: "doble";
  control:
    | "texto"
    | "email"
    | "fecha"
    | "hora"
    | "area"
    | "modalidad"
    | "modalidad-final"
    | "programas";
  lectura?: string;
}

function Campo({
  def,
  value,
  onChange,
}: {
  def: DefCampo;
  value: string;
  onChange?: ((v: string) => void) | undefined;
}) {
  const ro = def.clave === null;
  const controlId = useId();
  const envoltura = def.ancho === "doble" ? "sm:col-span-2" : undefined;
  // Solo lectura → apariencia de dato (no de input): corrige la confusión lectura/edición.
  if (ro) {
    return (
      <ReadonlyField
        {...(envoltura ? { className: envoltura } : {})}
        etiqueta={def.label}
        valor={value || "—"}
      />
    );
  }
  return (
    <Field
      {...(envoltura ? { className: envoltura } : {})}
      etiqueta={def.label}
      htmlFor={controlId}
    >
      {def.control === "area" ? (
        <textarea
          id={controlId}
          className={cn(controlClase, "min-h-9 py-2")}
          rows={2}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        />
      ) : def.control === "modalidad" ? (
        <Select ariaLabel={def.label} value={value} onChange={onChange}>
          {ETIQUETAS_MODALIDAD.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      ) : def.control === "modalidad-final" ? (
        <Select ariaLabel={def.label} value={value} onChange={onChange}>
          <option value="">—</option>
          {ETIQUETAS_MODALIDAD_FINAL.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      ) : def.control === "programas" ? (
        <ProgramasSelect label={def.label} value={value} onChange={onChange} />
      ) : def.control === "fecha" ? (
        <InputFechaLatina id={controlId} value={value} onChange={onChange} ariaLabel={def.label} />
      ) : (
        <div>
          <input
            id={controlId}
            className={cn(controlClase, "h-9")}
            type={def.control === "hora" ? "time" : def.control === "email" ? "email" : "text"}
            value={def.control === "hora" ? horaLimpia(value) : value}
            onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          />
          {def.control === "hora" && value ? (
            <p className="mt-1 text-[11px] font-medium text-navy-800">
              ⏰ Formato 24h: <span className="font-semibold">{horaLimpia(value)} hrs</span>
            </p>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** Orden y controles exactos del formulario legacy (Dashboard.html #tab-datos). */
const PERSONA_1: DefCampo[] = [
  { clave: null, label: "NOMBRES", control: "texto", lectura: "p1nombre" },
  { clave: "programa", label: "PROGRAMAS", control: "programas" },
  { clave: "titulo", label: "TESIS", control: "area", ancho: "doble" },
  { clave: null, label: "DNI", control: "texto", lectura: "p1dni" },
  { clave: "modalidad", label: "MODALIDAD", control: "modalidad" },
  { clave: "participante1Email", label: "CORREO", control: "email" },
  { clave: "participante1Cui", label: "CUI", control: "texto" },
  { clave: "participante1Nacionalidad", label: "NACIONALIDAD", control: "texto" },
  { clave: "participante1Ciudad", label: "CIUDAD", control: "texto" },
  { clave: "participante1Telefono", label: "TELÉFONO", control: "texto" },
  { clave: "participante1Direccion", label: "DIRECCIÓN", control: "texto" },
];

const PERSONA_2: DefCampo[] = [
  { clave: null, label: "NOMBRES 02", control: "texto", lectura: "p2nombre" },
  { clave: null, label: "PROGRAMAS 02", control: "texto", lectura: "programa02" },
  { clave: null, label: "DNI 02", control: "texto", lectura: "p2dni" },
  { clave: "modalidad02", label: "MODALIDAD 02", control: "modalidad" },
  { clave: "participante2Email", label: "CORREO 02", control: "email" },
  { clave: "participante2Cui", label: "CUI 02", control: "texto" },
  { clave: "participante2Nacionalidad", label: "NACIONALIDAD 02", control: "texto" },
  { clave: "participante2Ciudad", label: "CIUDAD 02", control: "texto" },
  { clave: "participante2Telefono", label: "TELÉFONO 02", control: "texto" },
  { clave: "participante2Direccion", label: "DIRECCIÓN 02", control: "texto" },
];

/** ETAPA 01 · DATOS DE DOCUMENTOS (card legacy exacta). */
const DATOS_DOCUMENTOS: DefCampo[] = [
  { clave: "nroDecreto", label: "N° DECRETO", control: "texto" },
  { clave: "presidente", label: "PRESIDENTE", control: "texto" },
  { clave: "asesorNombre", label: "ASESOR", control: "texto" },
  { clave: "secretario", label: "SECRETARIO", control: "texto" },
  { clave: "coAsesor", label: "CO ASESOR", control: "texto" },
  { clave: "fechaApertura", label: "FECHA APERTURA", control: "fecha" },
  { clave: "fechaPresentacion", label: "FECHA PRESENTACIÓN", control: "fecha" },
  { clave: "nroOficio", label: "N° OFICIO", control: "texto" },
];

const ETAPA_02: DefCampo[] = [
  { clave: "integrante", label: "INTEGRANTE", control: "texto" },
  { clave: "presidenteE2", label: "PRESIDENTE ETAPA 02", control: "texto" },
  { clave: "secretarioE2", label: "SECRETARIO ETAPA 02", control: "texto" },
  { clave: "suplenteE2", label: "SUPLENTE ETAPA 02", control: "texto" },
  { clave: "decanal", label: "DECANAL", control: "texto" },
  { clave: "fechaSustentacion", label: "FECHA", control: "fecha" },
  { clave: "horaSustentacion", label: "HORA", control: "hora" },
  { clave: "lugarSustentacion", label: "LUGAR SUSTENTACIÓN", control: "texto" },
  { clave: "modalidadFinal", label: "MODALIDAD VIRTUAL", control: "modalidad-final" },
];

/** Programas desde el catálogo real (RN-L14, HU-0069), cache de sesión. */
function ProgramasSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange?: ((v: string) => void) | undefined;
}) {
  const programas = useProgramas();
  const items = programas.data ?? [];
  return (
    <Select ariaLabel={label} value={value} onChange={onChange}>
      <option value="Seleccione">Seleccione</option>
      {items.map((p) => (
        <option key={p.codigo} value={p.nombre}>
          {p.nombre}
        </option>
      ))}
      {!programas.isPending &&
        !items.some((p) => p.nombre === value) &&
        value !== "Seleccione" &&
        value !== "" && <option value={value}>{value} (no oficial)</option>}
    </Select>
  );
}

/**
 * Pestaña Datos §6 con la estructura legacy exacta:
 * grupo 1 → una card ETAPA 01; grupo 2 → DATOS PERSONALES + DATOS DE DOCUMENTOS.
 * Autoguardado 650ms con los estados del legacy (activarAutoguardadoAdminV4).
 */
export function DatosForm({
  detalle,
  setEstado,
  onConflicto,
}: {
  detalle: ExpedienteDetalleDTO;
  setEstado: (e: GuardadoEstado) => void;
  onConflicto: (msg: string) => void;
}) {
  const grupo2 = detalle.participante2 !== null;
  const [valores, setValores] = useState<Record<string, string>>(() => extraer(detalle));
  const tokenRef = useRef(detalle.updatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutate = useActualizarDatos(detalle.id);

  useEffect(() => {
    setValores(extraer(detalle));
    tokenRef.current = detalle.updatedAt;
  }, [detalle]);

  function lectura(key: string): string {
    const p1 = detalle.participante1;
    const p2 = detalle.participante2;
    switch (key) {
      case "p1nombre":
        return `${p1?.nombres ?? ""} ${p1?.apellidos ?? ""}`.trim() || "—";
      case "p1dni":
        return p1?.dni ?? "—";
      case "p2nombre":
        return p2 ? `${p2.nombres} ${p2.apellidos}`.trim() : "—";
      case "p2dni":
        return p2?.dni ?? "—";
      case "programa02":
        return detalle.programa;
      default:
        return "";
    }
  }

  function editar(clave: Clave, v: string): void {
    setValores((prev) => ({ ...prev, [clave]: v }));
    if (timer.current) clearTimeout(timer.current);
    setEstado("editando");
    timer.current = setTimeout(() => {
      setEstado("guardando");
      mutate.mutate({ [clave]: v, expectedUpdatedAt: tokenRef.current } as ActualizarDatosInput, {
        onSuccess: (data) => {
          tokenRef.current = data.updatedAt;
          setEstado("guardado");
        },
        onError: (e) => {
          if ((e as Error & { conflicto?: boolean }).conflicto) {
            setEstado("conflicto");
            onConflicto(e.message);
          } else {
            setEstado("error");
          }
        },
      });
    }, 650);
  }

  function campos(campos: DefCampo[]) {
    return campos.map((c) => (
      <Campo
        def={c}
        key={c.label}
        value={c.clave === null ? lectura(c.lectura ?? "") : (valores[c.clave] ?? "")}
        onChange={c.clave === null ? undefined : (v) => editar(c.clave as Clave, v)}
      />
    ));
  }

  const subtitulo = "mb-1 text-xs font-bold tracking-wider text-grafito-600 uppercase";

  return (
    <div className="space-y-4">
      {!grupo2 && (
        <FormSection
          icono={<Users size={16} />}
          titulo="ETAPA 01"
          ayuda="Datos del participante y de los documentos de la terna."
        >
          {campos(PERSONA_1)}
          <h3 className={cn(subtitulo, "col-span-full mt-2 border-t border-slate-200/70 pt-4")}>
            DATOS DE DOCUMENTOS
          </h3>
          {campos(DATOS_DOCUMENTOS)}
        </FormSection>
      )}
      {grupo2 && (
        <>
          <FormSection
            icono={<Users size={16} />}
            titulo="ETAPA 01 · DATOS PERSONALES"
            ayuda="Dos participantes: complete los datos de cada uno."
          >
            <h3 className={cn(subtitulo, "col-span-full")}>PARTICIPANTE 01</h3>
            {campos(PERSONA_1)}
            <h3 className={cn(subtitulo, "col-span-full mt-2 border-t border-slate-200/70 pt-4")}>
              PARTICIPANTE 02
            </h3>
            {campos(PERSONA_2)}
          </FormSection>
          <FormSection
            icono={<FileText size={16} />}
            titulo="ETAPA 01 · DATOS DE DOCUMENTOS"
            ayuda="Decreto, terna y fechas de apertura y presentación."
          >
            {campos(DATOS_DOCUMENTOS)}
          </FormSection>
        </>
      )}
      <FormSection
        icono={<ClipboardList size={16} />}
        titulo="ETAPA 02"
        ayuda="Jurado, sustentación y modalidad de la etapa final."
      >
        {campos(ETAPA_02)}
      </FormSection>
    </div>
  );
}

function extraer(d: ExpedienteDetalleDTO): Record<string, string> {
  const p1 = d.participante1;
  const p2 = d.participante2;
  const admin = d.datosAdmin as unknown as Record<string, string | null>;
  const get = (v: string | null | undefined): string => v ?? "";
  return {
    programa: d.programa,
    titulo: d.titulo,
    modalidad: modalidadAEtiqueta(d.modalidad),
    modalidad02: get(admin.modalidad02) || modalidadAEtiqueta(d.modalidad),
    modalidadFinal: get(admin.modalidadFinal),
    asesorNombre:
      get(admin.asesorNombre) || (d.asesor ? `${d.asesor.nombres} ${d.asesor.apellidos}` : ""),
    participante1Email: get(p1?.email),
    participante1Cui: get(p1?.cui),
    participante1Nacionalidad: get(p1?.nacionalidad),
    participante1Ciudad: get(p1?.ciudad),
    participante1Telefono: get(p1?.telefono),
    participante1Direccion: get(p1?.direccion),
    participante2Email: get(p2?.email),
    participante2Cui: get(p2?.cui),
    participante2Nacionalidad: get(p2?.nacionalidad),
    participante2Ciudad: get(p2?.ciudad),
    participante2Telefono: get(p2?.telefono),
    participante2Direccion: get(p2?.direccion),
    ...Object.fromEntries(Object.entries(admin).map(([k, v]) => [k, get(v)])),
  };
}
