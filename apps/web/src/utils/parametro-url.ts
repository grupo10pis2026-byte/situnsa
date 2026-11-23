/** Valor inicial de un filtro desde la URL (`?tallerId=…`); vacío si no está. */
export function parametroInicial(nombre: string): string {
  try {
    return new URLSearchParams(window.location.search).get(nombre) ?? "";
  } catch {
    return "";
  }
}
