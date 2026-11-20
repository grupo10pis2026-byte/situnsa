import {
  combinarSugerencias,
  revisarFormatoTitulo,
  type SugerenciaTitulo,
} from "@pis/domain/dist/solicitud/revision-titulo.js";
import { useEffect, useMemo, useState } from "react";
import type { PeticionCorrector, RespuestaCorrector } from "../workers/corrector.worker.js";

export type EstadoCorrector = "inactivo" | "cargando" | "listo" | "error";

/* Un único worker para toda la app (los diccionarios se cargan una vez). */
let worker: Worker | null = null;
let secuencia = 0;
const pendientes = new Map<number, (r: RespuestaCorrector) => void>();

function obtenerWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/corrector.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (ev: MessageEvent<RespuestaCorrector>) => {
      pendientes.get(ev.data.id)?.(ev.data);
      pendientes.delete(ev.data.id);
    };
  }
  return worker;
}

function revisarOrtografia(texto: string): Promise<RespuestaCorrector> {
  const id = ++secuencia;
  return new Promise((resolve) => {
    pendientes.set(id, resolve);
    const peticion: PeticionCorrector = { id, texto };
    obtenerWorker().postMessage(peticion);
  });
}

/** Clave estable de una sugerencia para poder ignorarla. */
export function claveSugerencia(texto: string, s: SugerenciaTitulo): string {
  return `${s.tipo}|${texto.slice(s.inicio, s.fin).toLocaleLowerCase("es")}|${s.mensaje}`;
}

/**
 * Sugerencias del corrector para `texto` (formato inmediato + ortografía en
 * el worker con espera de 400 ms). No modifica el texto: solo informa.
 * `activo` permite diferir la descarga de diccionarios hasta el primer foco.
 */
export function useCorrectorTitulo(
  texto: string,
  { activo, ignoradas }: { activo: boolean; ignoradas: ReadonlySet<string> },
): { sugerencias: SugerenciaTitulo[]; estado: EstadoCorrector } {
  const [ortografia, setOrtografia] = useState<{ texto: string; sug: SugerenciaTitulo[] }>({
    texto: "",
    sug: [],
  });
  const [estado, setEstado] = useState<EstadoCorrector>("inactivo");

  useEffect(() => {
    if (!activo) return;
    if (texto.trim() === "") {
      setOrtografia({ texto, sug: [] });
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      setEstado((e) => (e === "inactivo" || e === "error" ? "cargando" : e));
      void revisarOrtografia(texto).then((r) => {
        if (!vigente) return;
        if (r.ok) {
          setOrtografia({ texto, sug: r.sugerencias });
          setEstado("listo");
        } else {
          setEstado("error");
        }
      });
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [texto, activo]);

  const sugerencias = useMemo(() => {
    const formato = revisarFormatoTitulo(texto);
    // Las posiciones ortográficas solo valen para el texto que se analizó.
    const orto = ortografia.texto === texto ? ortografia.sug : [];
    return combinarSugerencias(formato, orto).filter(
      (s) => !ignoradas.has(claveSugerencia(texto, s)),
    );
  }, [texto, ortografia, ignoradas]);

  return { sugerencias, estado };
}
