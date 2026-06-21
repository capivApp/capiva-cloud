import type { K8sManifest } from "@interface/integrations";

/**
 * Manifests dos serviços gerenciados do Marketplace, cada um usando o Operator
 * battle-tested adequado. Tudo escondido do usuário (que só escolhe tipo/tamanho/HA).
 *
 * Referências de operators:
 *  - Postgres → CloudNativePG (postgresql.cnpg.io)
 *  - MySQL    → MySQL Operator (mysql.oracle.com / InnoDBCluster)
 *  - Redis    → OT Redis Operator (databases.spotahome.com / RedisFailover = Sentinel)
 *  - RabbitMQ → RabbitMQ Cluster Operator (rabbitmq.com/RabbitmqCluster)
 *  - Kafka    → Strimzi (kafka.strimzi.io/Kafka, KRaft)
 *  - MinIO    → MinIO Operator (minio.min.io/Tenant)
 *  - Elastic  → ECK (elasticsearch.k8s.elastic.co/Elasticsearch)
 *  - ClickHouse → Altinity (clickhouse.altinity.com/ClickHouseInstallation)
 */
const labels = (name: string) => ({ "app.kubernetes.io/name": name, "app.kubernetes.io/part-of": "capiva" });
const storageFor = (size: string) => (size === "LARGE" ? "100Gi" : size === "MEDIUM" ? "50Gi" : "10Gi");

export interface DbManifestInput {
  name: string;
  namespace: string;
  size: string;
  ha: boolean;
}

export interface ConnectionMeta {
  /** chave de variável injetada na app conectada */
  envKey: string;
  scheme: string;
  /** host/service de leitura-escrita */
  host: (name: string) => string;
  port: number;
}

export const CONNECTION_META: Record<string, ConnectionMeta> = {
  POSTGRESQL: { envKey: "DATABASE_URL", scheme: "postgresql", host: (n) => `${n}-rw`, port: 5432 },
  MYSQL: { envKey: "DATABASE_URL", scheme: "mysql", host: (n) => `${n}`, port: 3306 },
  REDIS: { envKey: "REDIS_URL", scheme: "redis", host: (n) => `rfs-${n}`, port: 26379 },
  RABBITMQ: { envKey: "RABBITMQ_URL", scheme: "amqp", host: (n) => `${n}`, port: 5672 },
  KAFKA: { envKey: "KAFKA_BROKERS", scheme: "", host: (n) => `${n}-kafka-bootstrap`, port: 9092 },
  MINIO: { envKey: "S3_ENDPOINT", scheme: "http", host: (n) => `minio`, port: 80 },
  ELASTICSEARCH: { envKey: "ELASTICSEARCH_URL", scheme: "https", host: (n) => `${n}-es-http`, port: 9200 },
  CLICKHOUSE: { envKey: "CLICKHOUSE_URL", scheme: "clickhouse", host: (n) => `clickhouse-${n}`, port: 9000 },
};

export function databaseManifest(kind: string, input: DbManifestInput): K8sManifest {
  const { name, namespace, size, ha } = input;
  const meta = { name, namespace, labels: labels(name) };
  const storage = storageFor(size);

  switch (kind) {
    case "POSTGRESQL":
      return {
        apiVersion: "postgresql.cnpg.io/v1",
        kind: "Cluster",
        metadata: meta,
        spec: { instances: ha ? 3 : 1, storage: { size: storage }, ...(ha ? { primaryUpdateStrategy: "unsupervised" } : {}) },
      };
    case "MYSQL":
      return {
        apiVersion: "mysql.oracle.com/v2",
        kind: "InnoDBCluster",
        metadata: meta,
        spec: { instances: ha ? 3 : 1, router: { instances: ha ? 2 : 1 }, secretName: `${name}-cluster-secret`, tlsUseSelfSigned: true, datadirVolumeClaimTemplate: { resources: { requests: { storage } } } },
      };
    case "REDIS":
      return {
        apiVersion: "databases.spotahome.com/v1",
        kind: "RedisFailover",
        metadata: meta,
        spec: { sentinel: { replicas: ha ? 3 : 1 }, redis: { replicas: ha ? 3 : 1, storage: { persistentVolumeClaim: { spec: { resources: { requests: { storage } } } } } } },
      };
    case "RABBITMQ":
      return {
        apiVersion: "rabbitmq.com/v1beta1",
        kind: "RabbitmqCluster",
        metadata: meta,
        spec: { replicas: ha ? 3 : 1, persistence: { storage } },
      };
    case "KAFKA":
      return {
        apiVersion: "kafka.strimzi.io/v1beta2",
        kind: "Kafka",
        metadata: { ...meta, annotations: { "strimzi.io/node-pools": "enabled", "strimzi.io/kraft": "enabled" } },
        spec: { kafka: { replicas: ha ? 3 : 1, listeners: [{ name: "plain", port: 9092, type: "internal", tls: false }] }, entityOperator: { topicOperator: {}, userOperator: {} } },
      };
    case "MINIO":
      return {
        apiVersion: "minio.min.io/v2",
        kind: "Tenant",
        metadata: meta,
        spec: { pools: [{ servers: ha ? 4 : 1, volumesPerServer: ha ? 2 : 1, volumeClaimTemplate: { spec: { resources: { requests: { storage } } } } }] },
      };
    case "ELASTICSEARCH":
      return {
        apiVersion: "elasticsearch.k8s.elastic.co/v1",
        kind: "Elasticsearch",
        metadata: meta,
        spec: { version: "8.13.0", nodeSets: [{ name: "default", count: ha ? 3 : 1, volumeClaimTemplates: [{ metadata: { name: "elasticsearch-data" }, spec: { resources: { requests: { storage } } } }] }] },
      };
    case "CLICKHOUSE":
      return {
        apiVersion: "clickhouse.altinity.com/v1",
        kind: "ClickHouseInstallation",
        metadata: meta,
        spec: { configuration: { clusters: [{ name: "main", layout: { shardsCount: 1, replicasCount: ha ? 2 : 1 } }] } },
      };
    default:
      return {
        apiVersion: "capiva.cloud/v1",
        kind: "ManagedService",
        metadata: meta,
        spec: { kind, size, highAvailability: ha },
      };
  }
}
