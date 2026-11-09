import { describe, expect, it } from "vitest";
import { AsignarProyectoUseCase } from "./asignar-proyecto.use-case.js";

/** D1 sin BD: los DNI se validan antes de abrir la transacción. El resto, en e2e. */
const actor = { id: "", dni: "00000001" };
const TALLER = "00000000-0000-4000-8000-000000000001";

describe("AsignarProyectoUseCase (D1)", () => {
  it("rechaza un DNI que no tiene 8 dígitos (campo dni1)", async () => {
    const r = await new AsignarProyectoUseCase().execute(TALLER, { dni1: "123" }, actor);
    expect(!r.ok && r.error.errores?.map((e) => e.campo)).toEqual(["dni1"]);
  });
  it("el segundo tesista debe ser otra persona (campo dni2)", async () => {
    const r = await new AsignarProyectoUseCase().execute(
      TALLER,
      { dni1: "11223344", dni2: "11223344" },
      actor,
    );
    expect(!r.ok && r.error.errores?.map((e) => e.campo)).toEqual(["dni2"]);
  });
});
