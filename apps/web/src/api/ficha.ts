import {
  type CierreAsesoriaDTO,
  CierreAsesoriaDTOSchema,
  type DatosCierreInput,
  type FichaDTO,
  FichaDTOSchema,
  type FilaFichaDTO,
  type RegistrarFichaInput,
} from "@pis/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./client.js";
import { errorDeRespuesta } from "./errores.js";
import { descargarArchivoProtegido } from "./expedientes.js";
import { apiFetch } from "./session.js";
import { getApi, sendApi } from "./taller.js";

export type { CierreAsesoriaDTO, FichaDTO, FilaFichaDTO };

export function useFicha(proyectoId: string) {
  return useQuery({
    queryKey: ["proyecto", proyectoId, "ficha"],
    queryFn: () =>
      getApi(`/api/proyectos/${proyectoId}/ficha`, FichaDTOSchema, "No se pudo cargar la ficha"),
  });
}

async function subirPdf<T>(
  url: string,
  archivo: File,
  campos: Record<string, string>,
  parse: (x: unknown) => T,
): Promise<T> {
  const datos = new FormData();
  for (const [k, v] of Object.entries(campos)) datos.append(k, v);
  datos.append("file", archivo);
  const res = await apiFetch(url, { method: "POST", body: datos });
  if (!res.ok) throw await errorDeRespuesta(res, "No se pudo subir el archivo");
  return parse(await res.json());
}

export type OperacionFicha =
  | { tipo: "registrar"; filaId: string; datos: RegistrarFichaInput }
  | { tipo: "firmada"; semanas: number[]; archivo: File };

export function useOperarFicha(proyectoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (op: OperacionFicha) =>
      op.tipo === "registrar"
        ? sendApi(
            `/api/ficha/${op.filaId}`,
            "PUT",
            op.datos,
            FichaDTOSchema,
            "No se pudo guardar el registro",
          )
        : subirPdf(
            `${apiBaseUrl}/api/proyectos/${proyectoId}/ficha/firmada`,
            op.archivo,
            { semanas: op.semanas.join(",") },
            (x) => FichaDTOSchema.parse(x),
          ),
    onSuccess: (dto) => {
      qc.setQueryData(["proyecto", proyectoId, "ficha"], dto);
      qc.invalidateQueries({ queryKey: ["proyecto", proyectoId] });
    },
  });
}

export function descargarFicha(proyectoId: string, codigo: string) {
  return descargarArchivoProtegido(
    `${apiBaseUrl}/api/proyectos/${proyectoId}/ficha/pdf`,
    `Ficha_${codigo}.pdf`,
  );
}

export function descargarFirma(firmaId: string, nombre: string) {
  return descargarArchivoProtegido(`${apiBaseUrl}/api/ficha-firmas/${firmaId}/archivo`, nombre);
}

export function useCierre(proyectoId: string) {
  return useQuery({
    queryKey: ["proyecto", proyectoId, "cierre"],
    queryFn: () =>
      getApi(
        `/api/proyectos/${proyectoId}/cierre`,
        CierreAsesoriaDTOSchema,
        "No se pudo cargar el cierre",
      ),
  });
}

export type OperacionCierre =
  | { tipo: "datos"; datos: DatosCierreInput }
  | { tipo: "firmado"; archivo: File };

export function useOperarCierre(proyectoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (op: OperacionCierre) =>
      op.tipo === "datos"
        ? sendApi(
            `/api/proyectos/${proyectoId}/cierre`,
            "PATCH",
            op.datos,
            CierreAsesoriaDTOSchema,
            "No se pudo guardar",
          )
        : subirPdf(
            `${apiBaseUrl}/api/proyectos/${proyectoId}/cierre/firmado`,
            op.archivo,
            {},
            (x) => CierreAsesoriaDTOSchema.parse(x),
          ),
    onSuccess: (dto) => {
      qc.setQueryData(["proyecto", proyectoId, "cierre"], dto);
      qc.invalidateQueries({ queryKey: ["proyecto", proyectoId] });
    },
  });
}

export function emitirInforme(proyectoId: string, codigo: string) {
  return descargarArchivoProtegido(
    `${apiBaseUrl}/api/proyectos/${proyectoId}/cierre/informe`,
    `Conformidad_${codigo}.pdf`,
  );
}

export function descargarInformeFirmado(proyectoId: string, codigo: string) {
  return descargarArchivoProtegido(
    `${apiBaseUrl}/api/proyectos/${proyectoId}/cierre/firmado`,
    `Conformidad_firmada_${codigo}.pdf`,
  );
}
