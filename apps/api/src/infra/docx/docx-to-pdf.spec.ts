import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { convertirDocxAPdf, verificarSaludGotenberg } from "./docx-to-pdf.js";

describe("docx-to-pdf via Gotenberg", () => {
  it("convierte un buffer docx enviándolo a Gotenberg", async () => {
    const mockPdf = Buffer.from("%PDF-1.7 mock content");
    const mockResponse = new Response(mockPdf, {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    try {
      const docx = Buffer.from("mock docx");
      const pdf = await convertirDocxAPdf(docx, "prueba.docx");
      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.toString()).toContain("%PDF-1.7");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/forms/libreoffice/convert"),
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("arroja error si Gotenberg responde con código no exitoso", async () => {
    const mockResponse = new Response("Conversion error", {
      status: 500,
      statusText: "Internal Server Error",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    try {
      const docx = Buffer.from("mock docx");
      await expect(convertirDocxAPdf(docx, "prueba.docx")).rejects.toThrow("Gotenberg (500)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("verifica salud de Gotenberg", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    try {
      const ok = await verificarSaludGotenberg();
      expect(ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
