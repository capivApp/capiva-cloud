/**
 * Variáveis do cofre externo: montagem do env do container por origem
 * (manual/injetada/externa), entradas do ExternalSecret, registro gravado pelo
 * editor e projeção segura do cofre. Regras puras, sem banco e sem cluster.
 */
import { describe, expect, it } from "bun:test";
import { buildContainerEnvVars, buildExternalEnvEntries } from "@functions/containerEnv";
import { resolveEnvVarRecord } from "@service/EnvVarService";
import { toSecretStoreView } from "@service/SecretStoreService";
import { decrypt } from "@functions/crypto";

const row = (over: Partial<Parameters<typeof buildContainerEnvVars>[1][number]>) => ({
  key: "K",
  value: "v",
  secret: false,
  source: "MANUAL" as const,
  secretStoreId: null,
  remoteProperty: null,
  ...over,
});

describe("buildContainerEnvVars", () => {
  const reveal = (v: string) => `claro(${v})`;

  it("mantém literal a variável comum e decifra a secreta", () => {
    const env = buildContainerEnvVars("api", [row({ key: "A", value: "1" }), row({ key: "B", value: "x", secret: true })], reveal);
    expect(env).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "claro(x)" },
    ]);
  });

  it("variável do cofre externo vira referência ao Secret do ExternalSecret", () => {
    const env = buildContainerEnvVars("api", [row({ key: "DB", value: "prod/db", source: "EXTERNAL", secretStoreId: "s1" })], reveal);
    expect(env).toEqual([{ key: "DB", value: "", secretRef: { name: "api-external", key: "DB" } }]);
  });

  it("variável externa cujo cofre foi removido sai do container", () => {
    const env = buildContainerEnvVars("api", [row({ key: "DB", source: "EXTERNAL", secretStoreId: null })], reveal);
    expect(env).toEqual([]);
  });
});

describe("buildExternalEnvEntries", () => {
  it("lista só as variáveis externas com cofre, com chave e propriedade remotas", () => {
    const entries = buildExternalEnvEntries([
      row({ key: "A" }),
      row({ key: "DB", value: "prod/db", source: "EXTERNAL", secretStoreId: "s1", remoteProperty: "password" }),
      row({ key: "OLD", source: "EXTERNAL", secretStoreId: null }),
    ]);
    expect(entries).toEqual([{ envKey: "DB", storeId: "s1", remoteKey: "prod/db", property: "password" }]);
  });
});

describe("resolveEnvVarRecord", () => {
  it("item com origem externa grava a chave remota em claro, sem marcar como secreta", () => {
    const record = resolveEnvVarRecord(
      { key: "DB", value: "", secret: true, external: { secretStoreId: "s1", remoteKey: "prod/db", remoteProperty: "password" } },
      undefined,
    );
    expect(record).toEqual({ value: "prod/db", secret: false, source: "EXTERNAL", secretStoreId: "s1", remoteProperty: "password" });
  });

  it("item manual segue a regra de cifra e limpa o vínculo com cofre", () => {
    const record = resolveEnvVarRecord({ key: "TOKEN", value: "abc", secret: true }, undefined);
    expect(record.source).toBe("MANUAL");
    expect(record.secretStoreId).toBeNull();
    expect(record.remoteProperty).toBeNull();
    expect(decrypt(record.value)).toBe("abc");
  });
});

describe("toSecretStoreView", () => {
  it("nunca devolve as credenciais cifradas", () => {
    const view = toSecretStoreView({
      id: "s1",
      organizationId: "o1",
      name: "Cofre",
      provider: "VAULT",
      config: { server: "https://v" },
      credentialsCipher: "cifrado",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    expect(view).not.toHaveProperty("credentialsCipher");
    expect(view.name).toBe("Cofre");
  });
});
