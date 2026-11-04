/// <reference types="bun" />
/** Opções de build por origem no wizard: quais campos cada origem usa e o que vai no sourceConfig. */
import { describe, expect, it } from "bun:test";
import {
  EMPTY_BUILD_OPTIONS,
  buildOptionsConfig,
  validateBuildOptions,
} from "@/pages/applications/new/buildOptions";

const filled = {
  ...EMPTY_BUILD_OPTIONS,
  subPath: " apps/web ",
  installCommand: "pnpm i",
  buildCommand: "pnpm build",
  startCommand: "node dist",
  outputDir: "out",
  spa: true,
  builder: "heroku/builder:24",
  composeService: "web",
};

describe("buildOptionsConfig", () => {
  it("envia só os campos da origem escolhida", () => {
    expect(buildOptionsConfig("NIXPACKS", filled)).toEqual({
      subPath: "apps/web",
      installCommand: "pnpm i",
      buildCommand: "pnpm build",
      startCommand: "node dist",
    });
    expect(buildOptionsConfig("BUILDPACKS", filled)).toEqual({
      subPath: "apps/web",
      builder: "heroku/builder:24",
    });
    expect(buildOptionsConfig("STATIC", filled)).toEqual({
      subPath: "apps/web",
      buildCommand: "pnpm build",
      outputDir: "out",
      spa: true,
    });
    expect(buildOptionsConfig("DOCKER_COMPOSE", filled)).toEqual({ composeService: "web" });
    expect(buildOptionsConfig("RAILPACK", filled)).toEqual({ subPath: "apps/web" });
  });

  it("omite campo vazio e não envia spa desligado", () => {
    expect(buildOptionsConfig("STATIC", EMPTY_BUILD_OPTIONS)).toEqual({});
  });

  it("origem sem opções extras não envia nada", () => {
    expect(buildOptionsConfig("GITHUB", filled)).toEqual({});
  });
});

describe("validateBuildOptions", () => {
  it("aponta o campo de caminho inválido", () => {
    expect(
      validateBuildOptions("STATIC", { ...EMPTY_BUILD_OPTIONS, outputDir: "../dist" }).outputDir,
    ).toBeTruthy();
    expect(
      validateBuildOptions("NIXPACKS", { ...EMPTY_BUILD_OPTIONS, subPath: "/abs" }).subPath,
    ).toBeTruthy();
  });

  it("ignora campos que a origem não usa", () => {
    expect(
      validateBuildOptions("NIXPACKS", { ...EMPTY_BUILD_OPTIONS, outputDir: "../dist" }),
    ).toEqual({});
  });
});
