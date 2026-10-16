import { Calendar } from "lucide-react";
import { useId, useRef } from "react";
import {
  fechaIso,
  fechaLarga,
  fechaLatina,
} from "@pis/domain/dist/documentos/etiquetas.js";
import { cn } from "../../utils/cn.js";
import { controlClase } from "./field.js";

interface Props {
  id?: string | undefined;
  value: string;
  onChange?: ((valLatino: string) => void) | undefined;
  className?: string | undefined;
  ariaLabel?: string | undefined;
}

/**
 * Control estricto de fecha civil latinoamericana (DD/MM/AAAA).
 * Elimina la confusión con el formato anglosajón (MM/DD/AAAA).
 * Admite ingreso manual con máscara DD/MM/AAAA y selección visual mediante calendario.
 */
export function InputFechaLatina({ id, value, onChange, className, ariaLabel }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const pickerRef = useRef<HTMLInputElement>(null);

  const valLatino = fechaLatina(value);
  const valIso = fechaIso(value);
  const textoHumano = fechaLarga(value);

  function handleTextChange(raw: string) {
    const soloNum = raw.replace(/[^\d/]/g, "");
    let formateado = soloNum;
    const digitos = soloNum.replace(/\D/g, "");
    if (digitos.length >= 5) {
      formateado = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4, 8)}`;
    } else if (digitos.length >= 3) {
      formateado = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}`;
    }
    onChange?.(formateado);
  }

  function handlePickerChange(isoVal: string) {
    if (!isoVal) return;
    const latino = fechaLatina(isoVal);
    onChange?.(latino);
  }

  function abrirCalendario() {
    if (pickerRef.current) {
      if (typeof pickerRef.current.showPicker === "function") {
        pickerRef.current.showPicker();
      } else {
        pickerRef.current.focus();
      }
    }
  }

  return (
    <div className="space-y-1">
      <div className="relative flex items-center">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="DD/MM/AAAA"
          aria-label={ariaLabel}
          className={cn(controlClase, "pr-10 tracking-wide font-medium", className)}
          value={valLatino}
          onChange={(e) => handleTextChange(e.target.value)}
        />
        <button
          type="button"
          onClick={abrirCalendario}
          className="absolute right-2.5 p-1 text-slate-400 hover:text-navy-900 transition-colors focus:outline-none"
          title="Abrir selector de calendario"
          tabIndex={-1}
        >
          <Calendar size={16} />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          value={valIso}
          onChange={(e) => handlePickerChange(e.target.value)}
        />
      </div>
      {textoHumano ? (
        <p className="text-[11px] font-medium text-navy-800">
          📅 Formato: <span className="font-semibold">{textoHumano}</span>
        </p>
      ) : null}
    </div>
  );
}
