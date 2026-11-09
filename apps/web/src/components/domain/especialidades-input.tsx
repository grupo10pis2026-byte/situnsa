import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { useEspecialidades } from "../../api/asesores.js";
import { cn } from "../../utils/cn.js";
import { Button } from "../ui/button.js";
import { controlClase } from "../ui/field.js";

/**
 * Especialidades del asesor (spec P15 y P10): etiquetas con "Agregar
 * especialidad" en texto libre y autocompletar de las existentes (lista
 * ampliable). Sirve para el alta (estado local) y para el perfil (API).
 */
export function EspecialidadesInput({
  etiquetas,
  onAgregar,
  onQuitar,
  ocupado = false,
}: {
  etiquetas: Array<{ clave: string; nombre: string }>;
  /** Devuelve true si se agregó (limpia el campo). */
  onAgregar: (nombre: string) => boolean | Promise<boolean>;
  onQuitar: (clave: string) => void;
  ocupado?: boolean;
}) {
  const sugerencias = useEspecialidades();
  const listaId = useId();
  const [texto, setTexto] = useState("");
  const yaEsta = (n: string) =>
    etiquetas.some((e) => e.nombre.toLowerCase() === n.trim().replace(/\s+/g, " ").toLowerCase());
  const valido = texto.trim().length >= 2 && !yaEsta(texto);

  async function agregar(): Promise<void> {
    if (!valido || ocupado) return;
    if (await onAgregar(texto.trim().replace(/\s+/g, " "))) setTexto("");
  }

  return (
    <div className="space-y-2">
      {etiquetas.length === 0 ? (
        <p className="text-xs text-grafito-600">Sin especialidades registradas.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Especialidades">
          {etiquetas.map((e) => (
            <li
              key={e.clave}
              className="inline-flex items-center gap-1 rounded-full border border-navy-800/25 bg-navy-950/[0.05] py-0.5 pr-1 pl-2.5 text-xs font-semibold text-navy-950"
            >
              {e.nombre}
              <button
                aria-label={`Quitar especialidad ${e.nombre}`}
                className="rounded-full p-0.5 text-grafito-600 hover:bg-navy-950/10 hover:text-navy-950 disabled:opacity-50"
                disabled={ocupado}
                onClick={() => onQuitar(e.clave)}
                type="button"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          aria-label="Agregar especialidad"
          className={cn(controlClase, "h-9")}
          list={listaId}
          placeholder="Agregar especialidad (escribe o elige)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void agregar();
            }
          }}
        />
        <datalist id={listaId}>
          {(sugerencias.data ?? [])
            .filter((s) => !yaEsta(s.nombre))
            .map((s) => (
              <option key={s.id} value={s.nombre} />
            ))}
        </datalist>
        <Button
          tamano="sm"
          variante="contorno"
          className="h-9"
          disabled={!valido || ocupado}
          title={texto.trim() !== "" && yaEsta(texto) ? "Ya tiene esa especialidad" : undefined}
          onClick={() => void agregar()}
          type="button"
        >
          <Plus size={14} />
          Agregar
        </Button>
      </div>
    </div>
  );
}
