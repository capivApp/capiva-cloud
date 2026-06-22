import type { K8sManifest } from "@interface/integrations";

const dbLabels = (name: string) => ({ "app.kubernetes.io/name": name, "app.kubernetes.io/part-of": "capiva" });

/** Secret Opaque genérico (string values → base64). Usado p/ credenciais de backup. */
export function genericSecretManifest(name: string, namespace: string, data: Record<string, string>): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "Opaque",
    metadata: { name, namespace, labels: dbLabels(name) },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Buffer.from(v).toString("base64")])),
  };
}

export type DbBackupScope = "single" | "all";
export type DbBackupKind = "POSTGRESQL" | "MYSQL";

/**
 * Monta o comando do Job de backup (pg_dump/mysqldump → S3 via mc). `all` gera
 * UM arquivo por banco do servidor (loop). Credenciais vêm de env (Secret).
 */
export function databaseBackupCommand(kind: DbBackupKind, scope: DbBackupScope, prefix: string): string {
  const upload = (key: string) => `gzip | mc pipe "s3/$S3_BUCKET/${prefix}/${key}"`;
  // Carimbo determinístico vindo do backend (BACKUP_STAMP) para que o objeto no
  // S3 seja conhecido/registrado e possa ser restaurado; cai no relógio do Job
  // se não for informado (compatibilidade com chamadas antigas).
  const stamp = "${BACKUP_STAMP:-$(date +%Y%m%d-%H%M%S)}";
  const setup = `set -e; mc alias set s3 "$S3_ENDPOINT" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null`;

  if (kind === "POSTGRESQL") {
    if (scope === "all") {
      return `${setup}; for DB in $(psql "$ADMIN_URL" -tAc "SELECT datname FROM pg_database WHERE datistemplate=false AND datname NOT IN ('postgres','template0','template1')"); do echo "dump $DB"; pg_dump "$BASE_URL/$DB" | ${upload(`\${DB}-${stamp}.sql.gz`)}; done`;
    }
    return `${setup}; pg_dump "$SRC_URL" | ${upload(`$DB_NAME-${stamp}.sql.gz`)}`;
  }
  // MYSQL
  if (scope === "all") {
    return `${setup}; for DB in $(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" -N -e "SHOW DATABASES" | grep -vE "^(information_schema|performance_schema|mysql|sys)$"); do echo "dump $DB"; mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB" | ${upload(`\${DB}-${stamp}.sql.gz`)}; done`;
  }
  return `${setup}; mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" | ${upload(`$DB_NAME-${stamp}.sql.gz`)}`;
}

/**
 * Comando de restore: baixa o dump (.sql.gz) do S3 (objeto em `$OBJECT_KEY`),
 * descomprime e reaplica no banco de destino (psql/mysql). Operação destrutiva
 * — sobrescreve o estado atual do banco.
 */
export function databaseRestoreCommand(kind: DbBackupKind): string {
  const setup = `set -e; mc alias set s3 "$S3_ENDPOINT" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null`;
  const fetch = `mc cat "s3/$S3_BUCKET/$OBJECT_KEY" | gunzip`;
  if (kind === "POSTGRESQL") {
    return `${setup}; ${fetch} | psql "$SRC_URL"`;
  }
  return `${setup}; ${fetch} | mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME"`;
}

/**
 * Comando de retenção: remove do S3 os backups do prefixo mais antigos que
 * `retentionDays` dias (best-effort; não falha o Job se não houver o quê apagar).
 */
export function databaseRetentionCommand(prefix: string, retentionDays: number): string {
  const setup = `mc alias set s3 "$S3_ENDPOINT" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null`;
  return `${setup}; mc rm --recursive --force --older-than ${retentionDays}d "s3/$S3_BUCKET/${prefix}/" || true`;
}

/** Job de backup de banco: roda o dump e envia para o S3 (Secret com credenciais). */
export function databaseBackupJobManifest(name: string, namespace: string, command: string, secretName: string): K8sManifest {
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name, namespace, labels: dbLabels(name) },
    spec: {
      backoffLimit: 1,
      ttlSecondsAfterFinished: 600,
      template: {
        metadata: { labels: dbLabels(name) },
        spec: {
          restartPolicy: "Never",
          containers: [
            {
              name: "backup",
              image: process.env.CAPIVA_DB_BACKUP_IMAGE || "ghcr.io/capiva/db-backup:latest",
              command: ["sh", "-c", command],
              envFrom: [{ secretRef: { name: secretName } }],
            },
          ],
        },
      },
    },
  };
}

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
