/**
 * External Secrets Operator: strategies de provedor do cofre (AWS, Vault, GCP),
 * SecretStore + Secret de credenciais, ExternalSecret da aplicação, a variável
 * do container que lê o Secret sincronizado e o HelmChart de instalação.
 * Funções puras, sem cluster.
 */
import { describe, expect, it } from "bun:test";
import {
  externalEnvVar,
  externalSecretManifest,
  externalSecretName,
  externalSecretsOperatorManifest,
  secretStoreManifests,
  secretStoreResourceName,
} from "@infra/kubernetes/externalSecretManifests";
import { deploymentManifest } from "@infra/kubernetes/manifests";
import type { K8sManifest } from "@interface/integrations";

const spec = (m: K8sManifest) => m.spec as Record<string, any>;

describe("secretStoreResourceName", () => {
  it("deriva um nome de recurso válido a partir do id do cofre", () => {
    expect(secretStoreResourceName("CkX9abc")).toBe("capiva-store-ckx9abc");
  });
});

describe("secretStoreManifests", () => {
  it("AWS Secrets Manager: Secret com as chaves de acesso e SecretStore apontando para ele", () => {
    const [auth, store] = secretStoreManifests({
      storeId: "s1",
      namespace: "ns",
      provider: "AWS_SECRETS_MANAGER",
      config: { region: "us-east-1" },
      credentials: { accessKeyId: "AKIA", secretAccessKey: "shh" },
    });
    expect(auth.kind).toBe("Secret");
    expect(auth.metadata.name).toBe("capiva-store-s1-auth");
    expect(auth.stringData).toEqual({ "access-key-id": "AKIA", "secret-access-key": "shh" });
    expect(store.apiVersion).toBe("external-secrets.io/v1");
    expect(store.kind).toBe("SecretStore");
    expect(store.metadata.name).toBe("capiva-store-s1");
    expect(spec(store).provider).toEqual({
      aws: {
        service: "SecretsManager",
        region: "us-east-1",
        auth: {
          secretRef: {
            accessKeyIDSecretRef: { name: "capiva-store-s1-auth", key: "access-key-id" },
            secretAccessKeySecretRef: { name: "capiva-store-s1-auth", key: "secret-access-key" },
          },
        },
      },
    });
  });

  it("Vault: token no Secret, KV v2 por padrão", () => {
    const [auth, store] = secretStoreManifests({
      storeId: "s2",
      namespace: "ns",
      provider: "VAULT",
      config: { server: "https://vault.local", path: "secret" },
      credentials: { token: "hvs.x" },
    });
    expect(auth.stringData).toEqual({ token: "hvs.x" });
    expect(spec(store).provider).toEqual({
      vault: {
        server: "https://vault.local",
        path: "secret",
        version: "v2",
        auth: { tokenSecretRef: { name: "capiva-store-s2-auth", key: "token" } },
      },
    });
  });

  it("GCP Secret Manager: JSON da service account no Secret", () => {
    const [auth, store] = secretStoreManifests({
      storeId: "s3",
      namespace: "ns",
      provider: "GCP_SECRET_MANAGER",
      config: { projectId: "meu-projeto" },
      credentials: { serviceAccountJson: "{}" },
    });
    expect(auth.stringData).toEqual({ "secret-access-credentials": "{}" });
    expect(spec(store).provider).toEqual({
      gcpsm: {
        projectID: "meu-projeto",
        auth: { secretRef: { secretAccessKeySecretRef: { name: "capiva-store-s3-auth", key: "secret-access-credentials" } } },
      },
    });
  });
});

describe("externalSecretManifest", () => {
  it("gera um ExternalSecret por aplicação, uma entrada por variável, cada uma com o seu cofre", () => {
    const m = externalSecretManifest("api", "ns", [
      { envKey: "DB_PASSWORD", storeId: "s1", remoteKey: "prod/db", property: "password" },
      { envKey: "TOKEN", storeId: "s2", remoteKey: "app/token", property: null },
    ]);
    expect(m.apiVersion).toBe("external-secrets.io/v1");
    expect(m.kind).toBe("ExternalSecret");
    expect(m.metadata.name).toBe("api-external");
    expect(spec(m).target).toEqual({ name: "api-external", creationPolicy: "Owner" });
    expect(spec(m).secretStoreRef).toEqual({ name: "capiva-store-s1", kind: "SecretStore" });
    expect(spec(m).data).toEqual([
      {
        secretKey: "DB_PASSWORD",
        remoteRef: { key: "prod/db", property: "password" },
        sourceRef: { storeRef: { name: "capiva-store-s1", kind: "SecretStore" } },
      },
      {
        secretKey: "TOKEN",
        remoteRef: { key: "app/token" },
        sourceRef: { storeRef: { name: "capiva-store-s2", kind: "SecretStore" } },
      },
    ]);
  });
});

describe("externalEnvVar", () => {
  it("lê a variável do Secret sincronizado pelo ExternalSecret da aplicação", () => {
    expect(externalEnvVar("api", "DB_PASSWORD")).toEqual({
      key: "DB_PASSWORD",
      value: "",
      secretRef: { name: externalSecretName("api"), key: "DB_PASSWORD" },
    });
  });
});

describe("deploymentManifest com variável do cofre externo", () => {
  it("usa valueFrom.secretKeyRef em vez de valor literal", () => {
    const m = deploymentManifest(
      {
        name: "api",
        namespace: "ns",
        image: "img",
        port: 8080,
        profile: "SMALL",
        envVars: [{ key: "PLAIN", value: "1" }, externalEnvVar("api", "DB_PASSWORD")],
      },
      1,
    );
    const env = (m.spec as any).template.spec.containers[0].env;
    expect(env).toEqual([
      { name: "PLAIN", value: "1" },
      { name: "DB_PASSWORD", valueFrom: { secretKeyRef: { name: "api-external", key: "DB_PASSWORD" } } },
    ]);
  });
});

describe("externalSecretsOperatorManifest", () => {
  it("instala o operator pelo HelmChart do k3s com os CRDs", () => {
    const m = externalSecretsOperatorManifest();
    expect(m.apiVersion).toBe("helm.cattle.io/v1");
    expect(m.kind).toBe("HelmChart");
    expect(m.metadata.namespace).toBe("kube-system");
    expect(spec(m).chart).toBe("external-secrets");
    expect(spec(m).repo).toBe("https://charts.external-secrets.io");
    expect(spec(m).targetNamespace).toBe("external-secrets");
    expect(spec(m).valuesContent).toContain("installCRDs: true");
  });
});
