/**
 * Manifest do Job de scan (Trivy) e do Secret de credenciais do registry, mais a
 * orquestração do TrivyScanner com o KubernetesAdapter mockado. Sem cluster.
 */
import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { TRIVY_IMAGE, trivyCredentialsSecretManifest, trivyJobManifest } from "@infra/security/trivyJob";
import { TRIVY_REPORT_BEGIN, TRIVY_REPORT_END } from "@infra/security/trivyReport";
import { TrivyScanner } from "@infra/security/TrivyScanner";
import type { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import type { K8sManifest } from "@interface/integrations";

type Container = { name: string; image: string; command: string[]; env?: { name: string; value: string }[]; envFrom?: unknown[]; resources?: unknown };
const podSpec = (m: K8sManifest) => (m.spec as { template: { spec: { containers: Container[]; restartPolicy: string } } }).template.spec;
const container = (m: K8sManifest) => podSpec(m).containers[0];
const envOf = (m: K8sManifest) => Object.fromEntries((container(m).env ?? []).map((e) => [e.name, e.value]));

const base = { name: "scan-dep1", namespace: "prod", imageRef: "registry.local:5000/api:1.4.0", deploymentId: "dep1" };

describe("trivyJobManifest", () => {
  it("Job único, sem retry, com prazo e limpeza automática", () => {
    const job = trivyJobManifest(base);
    expect(job.apiVersion).toBe("batch/v1");
    expect(job.kind).toBe("Job");
    expect(job.metadata).toMatchObject({ name: "scan-dep1", namespace: "prod" });
    const spec = job.spec as { backoffLimit: number; activeDeadlineSeconds: number; ttlSecondsAfterFinished: number };
    expect(spec.backoffLimit).toBe(0);
    expect(spec.activeDeadlineSeconds).toBeGreaterThan(0);
    expect(spec.ttlSecondsAfterFinished).toBeGreaterThan(0);
    expect(podSpec(job).restartPolicy).toBe("Never");
  });

  it("rótulos ligam o pod ao deploy e ao próprio Job (leitura do log)", () => {
    const job = trivyJobManifest(base);
    const templateLabels = (job.spec as { template: { metadata: { labels: Record<string, string> } } }).template.metadata.labels;
    expect(templateLabels["capiva.cloud/deployment"]).toBe("dep1");
    expect(templateLabels["capiva.cloud/scan-job"]).toBe("scan-dep1");
  });

  it("imagem oficial do Trivy em versão fixa, nunca latest", () => {
    expect(TRIVY_IMAGE).toMatch(/^aquasec\/trivy:\d+\.\d+\.\d+$/);
    expect(container(trivyJobManifest(base)).image).toBe(TRIVY_IMAGE);
  });

  it("saída JSON entre marcadores e a imagem chega por env, sem interpolar no shell", () => {
    const job = trivyJobManifest({ ...base, imageRef: "evil;rm -rf /" });
    const script = container(job).command.join(" ");
    expect(script).toContain("--format json");
    expect(script).toContain("--exit-code 0");
    expect(script).toContain('"$SCAN_IMAGE"');
    expect(script).toContain(TRIVY_REPORT_BEGIN);
    expect(script).toContain(TRIVY_REPORT_END);
    expect(script).not.toContain("evil;rm");
    expect(envOf(job).SCAN_IMAGE).toBe("evil;rm -rf /");
  });

  it("registry aberto: sem envFrom de credenciais nem modo inseguro", () => {
    const job = trivyJobManifest(base);
    expect(container(job).envFrom).toBeUndefined();
    expect(envOf(job).TRIVY_INSECURE).toBeUndefined();
  });

  it("registry privado: credenciais vêm do Secret por envFrom", () => {
    const job = trivyJobManifest({ ...base, credentialsSecret: "scan-dep1-auth" });
    expect(container(job).envFrom).toEqual([{ secretRef: { name: "scan-dep1-auth" } }]);
  });

  it("registry HTTP/sem TLS liga TRIVY_INSECURE", () => {
    expect(envOf(trivyJobManifest({ ...base, insecure: true })).TRIVY_INSECURE).toBe("true");
  });

  it("tem requests e limits de recursos", () => {
    expect(container(trivyJobManifest(base)).resources).toMatchObject({ requests: expect.any(Object), limits: expect.any(Object) });
  });
});

describe("trivyCredentialsSecretManifest", () => {
  it("Secret Opaque com TRIVY_USERNAME/TRIVY_PASSWORD em base64", () => {
    const secret = trivyCredentialsSecretManifest("scan-dep1-auth", "prod", { username: "ci", password: "s3cr3t" });
    expect(secret).toMatchObject({ apiVersion: "v1", kind: "Secret", type: "Opaque", metadata: { name: "scan-dep1-auth", namespace: "prod" } });
    const data = secret.data as Record<string, string>;
    expect(Buffer.from(data.TRIVY_USERNAME, "base64").toString()).toBe("ci");
    expect(Buffer.from(data.TRIVY_PASSWORD, "base64").toString()).toBe("s3cr3t");
  });
});

const FIXTURE = readFileSync(join(import.meta.dir, "fixtures", "trivy-image-report.json"), "utf8");
const LOGS = `INFO Need to update DB\n${TRIVY_REPORT_BEGIN}\n${FIXTURE.replace(/\n/g, "")}\n${TRIVY_REPORT_END}\n`;
const CTX = { kubeconfig: "apiVersion: v1", namespace: "prod" };

type Observe = () => Promise<{ ready: boolean; raw?: Record<string, unknown> }>;
type PodLogs = (ctx: unknown, selector: string, tail?: number) => Promise<string>;

function makeScanner(overrides: { observe?: Observe; podLogsByLabel?: PodLogs } = {}) {
  const applied: K8sManifest[] = [];
  const removed: string[] = [];
  const k8s = {
    apply: mock(async (_ctx: unknown, manifest: K8sManifest) => {
      applied.push(manifest);
    }),
    observe: mock<Observe>(overrides.observe ?? (async () => ({ ready: false, raw: { succeeded: 1 } }))),
    podLogsByLabel: mock<PodLogs>(overrides.podLogsByLabel ?? (async () => LOGS)),
    remove: mock(async (_ctx: unknown, _api: string, kind: string, name: string) => {
      removed.push(`${kind}/${name}`);
    }),
  };
  const scanner = new TrivyScanner(k8s as unknown as KubernetesAdapter);
  scanner.pollIntervalMs = 1;
  return { scanner, k8s, applied, removed };
}

describe("TrivyScanner", () => {
  const request = { ctx: CTX, imageRef: "registry.local:5000/api:1.4.0", deploymentId: "dep1", insecure: false };

  it("aplica o Job, espera concluir e devolve o resumo lido do log", async () => {
    const { scanner, applied, k8s } = makeScanner();
    const findings = await scanner.scan(request);
    expect(applied.map((m) => m.kind)).toEqual(["Job"]);
    expect(findings.counts.CRITICAL).toBe(2);
    expect(findings.topVulnerabilities.length).toBeLessThanOrEqual(10);
    expect(k8s.podLogsByLabel.mock.calls[0]?.[1]).toBe("capiva.cloud/scan-job=scan-dep1");
  });

  it("registry privado: cria o Secret antes do Job e remove depois", async () => {
    const { scanner, applied, removed } = makeScanner();
    await scanner.scan({ ...request, auth: { username: "ci", password: "x" } });
    expect(applied.map((m) => m.kind)).toEqual(["Secret", "Job"]);
    expect(removed).toContain("Secret/scan-dep1-auth");
  });

  it("Job com falha rejeita (e ainda remove o Secret)", async () => {
    const { scanner, removed } = makeScanner({ observe: async () => ({ ready: false, raw: { failed: 1 } }) });
    expect(scanner.scan({ ...request, auth: { username: "ci", password: "x" } })).rejects.toThrow("scan-dep1");
    expect(removed).toContain("Secret/scan-dep1-auth");
  });

  it("Job que não termina no prazo rejeita por timeout", async () => {
    const { scanner } = makeScanner({ observe: async () => ({ ready: false, raw: {} }) });
    scanner.timeoutMs = 5;
    expect(scanner.scan(request)).rejects.toThrow("expirou");
  });

  it("log sem o relatório rejeita", async () => {
    const { scanner } = makeScanner({ podLogsByLabel: async () => "FATAL image scan error" });
    expect(scanner.scan(request)).rejects.toThrow("Relatório");
  });

  it("cluster sem kubeconfig (simulação) rejeita sem aplicar nada", async () => {
    const { scanner, applied } = makeScanner();
    expect(scanner.scan({ ...request, ctx: { kubeconfig: "", namespace: "prod" } })).rejects.toThrow();
    expect(applied).toEqual([]);
  });
});
