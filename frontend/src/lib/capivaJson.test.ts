/// <reference types="bun" />
/**
 * Marca "definido pelo capiva.json" gravada pelo backend em `sourceConfig.capivaJson`.
 * Puro, sem React.
 */
import { describe, expect, it } from "bun:test";
import { buildCapivaNotice, isCapivaManaged, readCapivaMarker } from "@/lib/capivaJson";

const marker = {
  path: "apps/api/capiva.json",
  ref: "abc",
  fields: ["port", "env"],
  envKeys: ["LOG_LEVEL", "NODE_ENV"],
};

describe("readCapivaMarker", () => {
  it("lê a marca do sourceConfig", () => {
    expect(readCapivaMarker({ capivaJson: marker })).toEqual(marker);
  });

  it("sem marca ou com marca malformada, devolve null", () => {
    expect(readCapivaMarker({})).toBeNull();
    expect(readCapivaMarker(null)).toBeNull();
    expect(readCapivaMarker({ capivaJson: { path: 1 } })).toBeNull();
  });
});

describe("isCapivaManaged", () => {
  it("só os campos declarados ficam somente leitura", () => {
    expect(isCapivaManaged(marker, "port")).toBe(true);
    expect(isCapivaManaged(marker, "profile")).toBe(false);
    expect(isCapivaManaged(null, "port")).toBe(false);
  });
});

describe("buildCapivaNotice", () => {
  it("aviso curto, com o arquivo, sem travessão", () => {
    const text = buildCapivaNotice(marker, ["port"]);
    expect(text).toBe(
      "Campos marcados são definidos pelo apps/api/capiva.json. Para mudar, edite o arquivo no repositório.",
    );
    expect(text).not.toContain("—");
  });

  it("para variáveis, lista as chaves do arquivo", () => {
    expect(buildCapivaNotice(marker, ["env"])).toBe(
      "LOG_LEVEL, NODE_ENV são definidas pelo apps/api/capiva.json. Para mudar, edite o arquivo no repositório.",
    );
  });

  it("sem campo da seção, não há aviso", () => {
    expect(buildCapivaNotice(marker, ["domains"])).toBeNull();
    expect(buildCapivaNotice(null, ["port"])).toBeNull();
  });
});
