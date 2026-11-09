import {
  type MiTallerDTO,
  MiTallerDTOSchema,
  type SesionAlumnoDTO,
  TallerAsesorDTOSchema,
} from "@pis/contracts";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getApi } from "./taller.js";

export type { MiTallerDTO, SesionAlumnoDTO };

export function useMiTaller() {
  return useQuery({
    queryKey: ["mi-taller"],
    queryFn: () => getApi("/api/mi-taller", MiTallerDTOSchema, "No se pudo cargar tu taller"),
  });
}

export function useTalleresAsesor() {
  return useQuery({
    queryKey: ["asesor", "talleres"],
    queryFn: () =>
      getApi(
        "/api/asesor/talleres",
        z.object({ items: z.array(TallerAsesorDTOSchema) }),
        "No se pudo cargar tus talleres",
      ),
  });
}
