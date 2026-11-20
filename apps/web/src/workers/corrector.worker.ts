/**
 * Web Worker del corrector ortográfico (CR-MOD-OBT-001 §3).
 * Carga los diccionarios Hunspell ES/EN (≈1 MB, solo la primera vez que se
 * usa el corrector) y revisa palabras fuera del hilo principal. Una palabra
 * es correcta si lo es en español O en inglés. Nada sale del navegador.
 */

import affEnUrl from "@diccionario-en/index.aff?url";
import dicEnUrl from "@diccionario-en/index.dic?url";
import affEsUrl from "@diccionario-es/index.aff?url";
import dicEsUrl from "@diccionario-es/index.dic?url";
import {
  palabrasRevisables,
  type SugerenciaTitulo,
  variantesOrtograficasEs,
} from "@pis/domain/dist/solicitud/revision-titulo.js";
import nspell from "nspell";

export interface PeticionCorrector {
  id: number;
  texto: string;
}

export type RespuestaCorrector =
  | { id: number; ok: true; sugerencias: SugerenciaTitulo[] }
  | { id: number; ok: false; error: string };

interface ContextoWorker {
  onmessage: ((ev: MessageEvent<PeticionCorrector>) => void) | null;
  postMessage(mensaje: RespuestaCorrector): void;
}
const ctx = self as unknown as ContextoWorker;

type Corrector = ReturnType<typeof nspell>;

async function texto(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo cargar el diccionario (${r.status})`);
  return r.text();
}

let diccionarios: Promise<{ es: Corrector; en: Corrector }> | null = null;
function cargar() {
  diccionarios ??= Promise.all([
    texto(affEsUrl),
    texto(dicEsUrl),
    texto(affEnUrl),
    texto(dicEnUrl),
  ]).then(([affEs, dicEs, affEn, dicEn]) => ({
    es: nspell(affEs, dicEs),
    en: nspell(affEn, dicEn),
  }));
  return diccionarios;
}

/** Caché de resultados por palabra (el título se revisa en cada pausa al escribir). */
const cache = new Map<string, string[] | null>();

function revisarPalabra(palabra: string, d: { es: Corrector; en: Corrector }): string[] | null {
  const previo = cache.get(palabra);
  if (previo !== undefined) return previo;
  let r: string[] | null = null;
  if (!d.es.correct(palabra) && !d.en.correct(palabra)) {
    const propuestas = new Set<string>();
    for (const v of variantesOrtograficasEs(palabra)) if (d.es.correct(v)) propuestas.add(v);
    for (const v of d.es.suggest(palabra)) propuestas.add(v);
    if (propuestas.size === 0) for (const v of d.en.suggest(palabra)) propuestas.add(v);
    r = [...propuestas].slice(0, 4);
  }
  cache.set(palabra, r);
  return r;
}

ctx.onmessage = async (ev) => {
  const { id, texto: t } = ev.data;
  try {
    const d = await cargar();
    const sugerencias: SugerenciaTitulo[] = [];
    for (const p of palabrasRevisables(t)) {
      const reemplazos = revisarPalabra(p.palabra, d);
      if (reemplazos === null) continue;
      sugerencias.push({
        inicio: p.inicio,
        fin: p.fin,
        tipo: "ortografia",
        mensaje:
          reemplazos.length > 0
            ? `Posible error ortográfico: «${p.palabra}».`
            : `«${p.palabra}» no está en el diccionario.`,
        reemplazos,
      });
    }
    ctx.postMessage({ id, ok: true, sugerencias });
  } catch (e) {
    diccionarios = null;
    ctx.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
