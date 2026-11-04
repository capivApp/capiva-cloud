/** Banco dos previews na tela: cópia por padrão, compartilhado só se gravado. */
import { describe, expect, it } from "bun:test";
import { PREVIEW_DATABASE_OPTIONS, readPreviewDatabase } from "@/pages/applications/preview";

describe("readPreviewDatabase", () => {
  it("sem valor gravado, mostra cópia", () => {
    expect(readPreviewDatabase({})).toBe("copy");
    expect(readPreviewDatabase({ previews: { enabled: true } })).toBe("copy");
  });

  it("mostra compartilhado quando gravado", () => {
    expect(readPreviewDatabase({ previews: { database: "shared" } })).toBe("shared");
  });

  it("as duas opções têm rótulo para o usuário", () => {
    expect(PREVIEW_DATABASE_OPTIONS.map((o) => o.value)).toEqual(["copy", "shared"]);
    expect(
      PREVIEW_DATABASE_OPTIONS.every((o) => o.label.length > 0 && !o.label.includes("—")),
    ).toBe(true);
  });
});
