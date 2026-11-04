import { loadAllYaml } from "@kubernetes/client-node";
import { Injectable } from "@di/index";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { externalSecretsOperatorManifest } from "@infra/kubernetes/externalSecretManifests";
import type { K8sManifest, KubeContext } from "@interface/integrations";

/**
 * Instalação automática dos operators de banco no cluster, usando as credenciais
 * já salvas (kubeconfig). Idempotente: se o CRD já existe, não reinstala. Aplica
 * o bundle do operator (CRDs + RBAC + Deployment) via server-side apply.
 *
 * Resolve o problema do "operator ausente (404)" sem depender de SSH/provisionamento:
 * funciona tanto em clusters provisionados quanto apenas conectados.
 */
interface OperatorSpec {
  /** CRD que comprova a presença do operator (evita reinstalar). */
  crd: string;
  /** Bundle(s) YAML do operator, aplicados em ordem. */
  urls: string[];
  /** Manifests gerados aqui (ex.: HelmChart do k3s), aplicados depois dos bundles. */
  manifests?: () => K8sManifest[];
}

const OPERATORS: Record<string, OperatorSpec> = {
  POSTGRESQL: {
    crd: "clusters.postgresql.cnpg.io",
    urls: [
      "https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.24/releases/cnpg-1.24.1.yaml",
    ],
  },
  MYSQL: {
    crd: "innodbclusters.mysql.oracle.com",
    urls: [
      "https://raw.githubusercontent.com/mysql/mysql-operator/trunk/deploy/deploy-crds.yaml",
      "https://raw.githubusercontent.com/mysql/mysql-operator/trunk/deploy/deploy-operator.yaml",
    ],
  },
  REDIS: {
    crd: "redisfailovers.databases.spotahome.com",
    urls: [
      "https://raw.githubusercontent.com/spotahome/redis-operator/master/example/operator/all-redis-operator-resources.yaml",
    ],
  },
  RABBITMQ: {
    crd: "rabbitmqclusters.rabbitmq.com",
    urls: [
      "https://github.com/rabbitmq/cluster-operator/releases/latest/download/cluster-operator.yml",
    ],
  },
  ELASTICSEARCH: {
    crd: "elasticsearches.elasticsearch.k8s.elastic.co",
    urls: [
      "https://download.elastic.co/downloads/eck/2.16.1/crds.yaml",
      "https://download.elastic.co/downloads/eck/2.16.1/operator.yaml",
    ],
  },
  CLICKHOUSE: {
    crd: "clickhouseinstallations.clickhouse.altinity.com",
    urls: [
      "https://raw.githubusercontent.com/Altinity/clickhouse-operator/release-0.24.0/deploy/operator/clickhouse-operator-install-bundle.yaml",
    ],
  },
  // Cofre externo (variáveis de ambiente vindas de AWS/Vault/GCP).
  EXTERNAL_SECRETS: {
    crd: "externalsecrets.external-secrets.io",
    urls: [],
    manifests: () => [externalSecretsOperatorManifest()],
  },
};

@Injectable()
export class OperatorInstallerService {
  constructor(private readonly k8s: KubernetesAdapter) {}

  /** Garante o operator (banco ou EXTERNAL_SECRETS) instalado no cluster (idempotente). */
  async ensure(ctx: KubeContext, kind: string): Promise<void> {
    const spec = OPERATORS[kind];
    if (!spec || !ctx.kubeconfig) return; // tipo sem operator mapeado ou modo dry-run
    if (await this.k8s.crdExists(ctx, spec.crd)) return;

    for (const url of spec.urls) {
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`Falha ao baixar o operator (${kind}) de ${url}: HTTP ${res.status}`);
      const docs = loadAllYaml(await res.text()) as {
        kind?: string;
        apiVersion?: string;
        metadata?: { name?: string };
      }[];
      for (const doc of docs) {
        if (!doc?.kind) continue;
        // Recursos de observabilidade (ServiceMonitor/PodMonitor) são opcionais e
        // exigem o Prometheus Operator — pulamos se o bundle os incluir.
        if (doc.apiVersion?.startsWith("monitoring.coreos.com")) continue;
        await this.k8s.applyRaw(ctx, doc);
      }
    }
    for (const manifest of spec.manifests?.() ?? []) await this.k8s.apply(ctx, manifest);
  }
}
