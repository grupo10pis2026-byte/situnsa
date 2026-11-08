import { PROGRAMAS_OFICIALES } from "@pis/domain";
import type { Db } from "../client.js";
import { programas } from "../schema/programas.js";
import { seedCatalogoProceso } from "./catalogo-proceso.js";
import { asignarRolesLegacy, seedSeguridad } from "./roles-permisos.js";
import { seedTallerV1Catalogos } from "./taller-v1-catalogos.js";

/** Seed BASE (idempotente, seguro en prod): catálogos requeridos por RN-L04/L14. */
export async function seedBase(db: Db): Promise<void> {
  for (const p of PROGRAMAS_OFICIALES) {
    await db.insert(programas).values(p).onConflictDoNothing({ target: programas.codigo });
  }
  console.log(`Programas oficiales FIPS (${PROGRAMAS_OFICIALES.length})`);
  await seedSeguridad(db);
  await asignarRolesLegacy(db);
  await seedCatalogoProceso(db);
  // Feriados del año en curso y el siguiente (hora de Perú).
  const anio = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric" }).format(
      new Date(),
    ),
  );
  await seedTallerV1Catalogos(db, [anio, anio + 1]);
}
