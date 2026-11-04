import { TRIVY_REPORT_BEGIN, TRIVY_REPORT_END } from "@infra/security/trivyReport";
import type { K8sManifest } from "@interface/integrations";

/**
 * Imagem oficial do Trivy em versão FIXA. `latest` mudaria o scanner (e o formato
 * do relatório) sem ninguém pedir. Atualize de propósito, conferindo o changelog.
 * `CAPIVA_TRIVY_IMAGE` permite um mirror interno da mesma versão.
 */
export const TRIVY_IMAGE = "aquasec/trivy:0.58.1";

export interface TrivyJobInput {
  name: string;
  namespace: string;
  imageRef: string;
  deploymentId: string;
  /** Secret com TRIVY_USERNAME/TRIVY_PASSWORD (registry privado). */
  credentialsSecret?: string;
  /** Registry HTTP ou com certificado próprio. */
  insecure?: boolean;
}

/**
 * Script do container. A imagem a escanear chega por `$SCAN_IMAGE`, NUNCA
 * interpolada no texto: uma referência maliciosa ("img;rm -rf /") viraria comando.
 * `--exit-code 0`: achar vulnerabilidade não é falha do Job; quem decide bloquear
 * é a política da aplicação. O JSON sai numa linha só (`tr -d '\n'`) entre os
 * marcadores, para caber no log sem depender do limite de linhas.
 */
const SCAN_SCRIPT = [
  "set -e",
  'trivy image --quiet --no-progress --scanners vuln --format json --exit-code 0 --timeout "$SCAN_TIMEOUT" --output /tmp/trivy-report.json "$SCAN_IMAGE"',
  `echo "${TRIVY_REPORT_BEGIN}"`,
  "tr -d '\\n' < /tmp/trivy-report.json",
  "echo",
  `echo "${TRIVY_REPORT_END}"`,
].join("\n");

const scanTimeoutSeconds = (): number => Number(process.env.CAPIVA_SCAN_TIMEOUT_SECONDS ?? 600);

const jobLabels = (input: TrivyJobInput): Record<string, string> => ({
  "app.kubernetes.io/name": input.name,
  "app.kubernetes.io/part-of": "capiva-cloud",
  "app.kubernetes.io/component": "image-scan",
  "capiva.cloud/deployment": input.deploymentId,
  "capiva.cloud/scan-job": input.name,
});

const buildEnv = (input: TrivyJobInput) => [
  { name: "SCAN_IMAGE", value: input.imageRef },
  { name: "SCAN_TIMEOUT", value: `${scanTimeoutSeconds()}s` },
  { name: "TRIVY_CACHE_DIR", value: "/tmp/trivy-cache" },
  ...(input.insecure ? [{ name: "TRIVY_INSECURE", value: "true" }] : []),
];

/** Job que roda `trivy image` contra a imagem do deploy e imprime o relatório JSON no log. */
export function trivyJobManifest(input: TrivyJobInput): K8sManifest {
  const labels = jobLabels(input);
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: input.name, namespace: input.namespace, labels },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 600,
      // Folga sobre o --timeout do Trivy: o download do banco de CVEs vem antes do scan.
      activeDeadlineSeconds: scanTimeoutSeconds() + 300,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: "Never",
          containers: [
            {
              name: "trivy",
              image: process.env.CAPIVA_TRIVY_IMAGE || TRIVY_IMAGE,
              command: ["/bin/sh", "-c", SCAN_SCRIPT],
              env: buildEnv(input),
              ...(input.credentialsSecret ? { envFrom: [{ secretRef: { name: input.credentialsSecret } }] } : {}),
              // O banco de CVEs carregado em memória passa de 500 MiB em imagens grandes.
              resources: {
                requests: { cpu: process.env.CAPIVA_SCAN_CPU_REQUEST || "100m", memory: process.env.CAPIVA_SCAN_MEMORY_REQUEST || "256Mi" },
                limits: { cpu: process.env.CAPIVA_SCAN_CPU_LIMIT || "1", memory: process.env.CAPIVA_SCAN_MEMORY_LIMIT || "2Gi" },
              },
            },
          ],
        },
      },
    },
  };
}

/** Secret Opaque lido pelo Trivy via env (TRIVY_USERNAME/TRIVY_PASSWORD). */
export function trivyCredentialsSecretManifest(
  name: string,
  namespace: string,
  credentials: { username: string; password: string },
): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "Opaque",
    metadata: { name, namespace, labels: { "app.kubernetes.io/name": name, "app.kubernetes.io/part-of": "capiva-cloud" } },
    data: {
      TRIVY_USERNAME: Buffer.from(credentials.username).toString("base64"),
      TRIVY_PASSWORD: Buffer.from(credentials.password).toString("base64"),
    },
  };
}
