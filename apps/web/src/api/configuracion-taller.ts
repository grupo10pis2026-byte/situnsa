import { type ConfigTallerDTO, ConfigTallerDTOSchema } from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta } from "./errores.js";
import { apiFetch } from "./session.js";

/** P16 Configuración del taller: feriados, plan institucional, especialidades y parámetros. */

const clave = ["configuracion", "taller"] as const;

async function leer(res: Response): Promise<ConfigTallerDTO> {
  if (!res.ok) throw await errorDeRespuesta(res, "No se pudo cargar la configuración del taller");
  return ConfigTallerDTOSchema.parse(await res.json());
}

export function useConfigTaller() {
  return useQuery({
    queryKey: clave,
    queryFn: async () => leer(await apiFetch(`${apiBaseUrl}/api/configuracion/taller`)),
  });
}

export type OperacionConfigTaller =
  | { tipo: "agregarFeriado"; datos: { fecha: string; nombre: string } }
  | {
      tipo: "editarFeriado";
      id: string;
      cambios: { fecha?: string; nombre?: string; activo?: boolean };
    }
  | {
      tipo: "editarSemanaPlan";
      semana: number;
      datos: { contenido: string; entregable: string | null };
    }
  | { tipo: "agregarEspecialidad"; datos: { nombre: string } }
  | { tipo: "editarEspecialidad"; id: string; cambios: { nombre?: string; activa?: boolean } }
  | { tipo: "editarParametro"; clave: string; valor: number | boolean };

const BASE = "/api/configuracion/taller";

function peticion(op: OperacionConfigTaller): { ruta: string; metodo: string; cuerpo: unknown } {
  switch (op.tipo) {
    case "agregarFeriado":
      return { ruta: `${BASE}/feriados`, metodo: "POST", cuerpo: op.datos };
    case "editarFeriado":
      return { ruta: `${BASE}/feriados/${op.id}`, metodo: "PATCH", cuerpo: op.cambios };
    case "editarSemanaPlan":
      return { ruta: `${BASE}/plan/${op.semana}`, metodo: "PATCH", cuerpo: op.datos };
    case "agregarEspecialidad":
      return { ruta: `${BASE}/especialidades`, metodo: "POST", cuerpo: op.datos };
    case "editarEspecialidad":
      return { ruta: `${BASE}/especialidades/${op.id}`, metodo: "PATCH", cuerpo: op.cambios };
    case "editarParametro":
      return {
        ruta: `${BASE}/parametros/${encodeURIComponent(op.clave)}`,
        metodo: "PATCH",
        cuerpo: { valor: op.valor },
      };
  }
}

/** Una sola mutación: la respuesta es la configuración completa actualizada. */
export function useEditarConfigTaller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (op: OperacionConfigTaller): Promise<ConfigTallerDTO> => {
      const p = peticion(op);
      const res = await apiFetch(`${apiBaseUrl}${p.ruta}`, {
        method: p.metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.cuerpo),
      });
      return leer(res);
    },
    onSuccess: (data) => {
      qc.setQueryData(clave, data);
    },
  });
}
