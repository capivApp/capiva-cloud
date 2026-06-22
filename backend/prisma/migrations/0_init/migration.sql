-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ClusterProvisioner" AS ENUM ('MANUAL', 'SSH', 'COPY_PASTE');

-- CreateEnum
CREATE TYPE "NodeRole" AS ENUM ('CONTROL_PLANE', 'WORKER');

-- CreateEnum
CREATE TYPE "EnvironmentKind" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "GitProviderKind" AS ENUM ('GITHUB', 'GITLAB', 'GITEA');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('DOCKER_IMAGE', 'GITHUB', 'GITLAB', 'GITEA', 'DOCKER_COMPOSE', 'NIXPACKS', 'RAILPACK', 'BUILDPACKS', 'STATIC');

-- CreateEnum
CREATE TYPE "RolloutStrategy" AS ENUM ('ROLLING', 'BLUE_GREEN', 'CANARY');

-- CreateEnum
CREATE TYPE "ResourceProfileKind" AS ENUM ('NANO', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('QUEUED', 'BUILDING', 'PUSHING', 'DEPLOYING', 'HEALTHY', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "EnvVarSource" AS ENUM ('MANUAL', 'INJECTED');

-- CreateEnum
CREATE TYPE "ScalingMetric" AS ENUM ('CPU', 'MEMORY', 'REQUESTS');

-- CreateEnum
CREATE TYPE "ManagedServiceKind" AS ENUM ('POSTGRESQL', 'MYSQL', 'REDIS', 'RABBITMQ', 'KAFKA', 'MINIO', 'ELASTICSEARCH', 'CLICKHOUSE');

-- CreateEnum
CREATE TYPE "ManagedSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "BackupKind" AS ENUM ('DATABASE', 'VOLUME');

-- CreateEnum
CREATE TYPE "VolumeAccessMode" AS ENUM ('RWO', 'RWX');

-- CreateEnum
CREATE TYPE "TlsMode" AS ENUM ('LETS_ENCRYPT', 'UPLOADED', 'NONE');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('S3');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DISCORD', 'SLACK', 'TELEGRAM', 'TEAMS', 'EMAIL', 'RESEND', 'LARK', 'PUSH', 'WEBHOOK');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'DEVELOPER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "event" TEXT NOT NULL,
    "userId" TEXT,
    "apiKeyId" TEXT,
    "sessionId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "provisioner" "ClusterProvisioner" NOT NULL DEFAULT 'MANUAL',
    "kubeconfigCipher" TEXT,
    "serverUrl" TEXT,
    "nodeTokenCipher" TEXT,
    "registrationToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cluster_nodes" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "role" "NodeRole" NOT NULL DEFAULT 'WORKER',
    "host" TEXT NOT NULL,
    "sshUser" TEXT,
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "sshCredentialCipher" TEXT,
    "internalIp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cluster_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_tasks" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "nodeId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "log" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "provisioning_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clusterId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "EnvironmentKind" NOT NULL DEFAULT 'DEVELOPMENT',
    "namespace" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "s3Endpoint" TEXT NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "s3Region" TEXT,
    "credentialsCipher" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 7,
    "schedule" TEXT NOT NULL DEFAULT '0 3 * * *',

    CONSTRAINT "backup_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "GitProviderKind" NOT NULL,
    "accessTokenCipher" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "accountLogin" TEXT,
    "baseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "git_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_commits" (
    "id" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "authorName" TEXT,
    "authorEmail" TEXT,
    "branch" TEXT,
    "message" TEXT,
    "pullRequest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "git_commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "SourceKind" NOT NULL,
    "sourceConfig" JSONB NOT NULL,
    "tags" JSONB,
    "gitConnectionId" TEXT,
    "profile" "ResourceProfileKind" NOT NULL DEFAULT 'SMALL',
    "customResources" JSONB,
    "rolloutStrategy" "RolloutStrategy" NOT NULL DEFAULT 'ROLLING',
    "rolloutConfig" JSONB,
    "port" INTEGER DEFAULT 3000,
    "tlsMode" "TlsMode" NOT NULL DEFAULT 'LETS_ENCRYPT',
    "tlsCertificateId" TEXT,
    "registryId" TEXT,
    "desiredStatus" TEXT NOT NULL DEFAULT 'running',
    "observedStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "commitId" TEXT,
    "version" TEXT NOT NULL,
    "imageRef" TEXT,
    "strategy" "RolloutStrategy" NOT NULL DEFAULT 'ROLLING',
    "status" "DeploymentStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "podCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_events" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "tlsMode" TEXT NOT NULL DEFAULT 'lets_encrypt',
    "tlsCertificateId" TEXT,
    "tlsStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "env_vars" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "source" "EnvVarSource" NOT NULL DEFAULT 'MANUAL',
    "overridden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "env_vars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scaling_policies" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "minReplicas" INTEGER NOT NULL DEFAULT 2,
    "maxReplicas" INTEGER NOT NULL DEFAULT 10,
    "metric" "ScalingMetric" NOT NULL DEFAULT 'CPU',
    "target" INTEGER NOT NULL DEFAULT 70,

    CONSTRAINT "scaling_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_dependencies" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "injectedKeys" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_databases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ManagedServiceKind" NOT NULL,
    "size" "ManagedSize" NOT NULL DEFAULT 'SMALL',
    "highAvailability" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "observedStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managed_databases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "SourceKind" NOT NULL,
    "sourceConfig" JSONB NOT NULL,
    "profile" "ResourceProfileKind" NOT NULL DEFAULT 'SMALL',
    "replicas" INTEGER NOT NULL DEFAULT 1,
    "observedStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "source" "SourceKind" NOT NULL,
    "sourceConfig" JSONB NOT NULL,
    "profile" "ResourceProfileKind" NOT NULL DEFAULT 'NANO',
    "observedStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backups" (
    "id" TEXT NOT NULL,
    "kind" "BackupKind" NOT NULL DEFAULT 'DATABASE',
    "databaseId" TEXT,
    "volumeId" TEXT,
    "storageProviderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "destination" TEXT,
    "sizeBytes" BIGINT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volumes" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mountPath" TEXT NOT NULL,
    "sizeGi" INTEGER NOT NULL DEFAULT 1,
    "accessMode" "VolumeAccessMode" NOT NULL DEFAULT 'RWO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tls_certificates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "certCipher" TEXT NOT NULL,
    "keyCipher" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tls_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docker_registries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordCipher" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "docker_registries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_providers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StorageType" NOT NULL DEFAULT 'S3',
    "endpoint" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "region" TEXT,
    "credentialsCipher" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'DEVELOPER',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'DEVELOPER',
    "scopes" JSONB,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "name" TEXT NOT NULL,
    "configCipher" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uptime_checks" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "intervalSec" INTEGER NOT NULL DEFAULT 60,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uptime_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uptime_results" (
    "id" TEXT NOT NULL,
    "uptimeCheckId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "latencyMs" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uptime_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "clusters_registrationToken_key" ON "clusters"("registrationToken");

-- CreateIndex
CREATE INDEX "provisioning_tasks_clusterId_idx" ON "provisioning_tasks"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "backup_configs_organizationId_key" ON "backup_configs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "git_commits_sha_branch_key" ON "git_commits"("sha", "branch");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organizationId_slug_key" ON "projects"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "deployments_applicationId_idx" ON "deployments"("applicationId");

-- CreateIndex
CREATE INDEX "deployment_events_deploymentId_idx" ON "deployment_events"("deploymentId");

-- CreateIndex
CREATE UNIQUE INDEX "domains_host_key" ON "domains"("host");

-- CreateIndex
CREATE UNIQUE INDEX "env_vars_applicationId_key_key" ON "env_vars"("applicationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "scaling_policies_applicationId_key" ON "scaling_policies"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "service_dependencies_sourceId_targetId_key" ON "service_dependencies"("sourceId", "targetId");

-- CreateIndex
CREATE INDEX "backups_databaseId_idx" ON "backups"("databaseId");

-- CreateIndex
CREATE INDEX "volumes_applicationId_idx" ON "volumes"("applicationId");

-- CreateIndex
CREATE INDEX "tls_certificates_organizationId_idx" ON "tls_certificates"("organizationId");

-- CreateIndex
CREATE INDEX "docker_registries_organizationId_idx" ON "docker_registries"("organizationId");

-- CreateIndex
CREATE INDEX "storage_providers_organizationId_idx" ON "storage_providers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_organizationId_idx" ON "invitations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "notification_channels_organizationId_idx" ON "notification_channels"("organizationId");

-- CreateIndex
CREATE INDEX "uptime_checks_applicationId_idx" ON "uptime_checks"("applicationId");

-- CreateIndex
CREATE INDEX "uptime_results_uptimeCheckId_idx" ON "uptime_results"("uptimeCheckId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_nodes" ADD CONSTRAINT "cluster_nodes_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_configs" ADD CONSTRAINT "backup_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_connections" ADD CONSTRAINT "git_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_gitConnectionId_fkey" FOREIGN KEY ("gitConnectionId") REFERENCES "git_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_commitId_fkey" FOREIGN KEY ("commitId") REFERENCES "git_commits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_events" ADD CONSTRAINT "deployment_events_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "env_vars" ADD CONSTRAINT "env_vars_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scaling_policies" ADD CONSTRAINT "scaling_policies_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_databases" ADD CONSTRAINT "managed_databases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_databases" ADD CONSTRAINT "managed_databases_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "managed_databases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tls_certificates" ADD CONSTRAINT "tls_certificates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docker_registries" ADD CONSTRAINT "docker_registries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_providers" ADD CONSTRAINT "storage_providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uptime_checks" ADD CONSTRAINT "uptime_checks_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uptime_results" ADD CONSTRAINT "uptime_results_uptimeCheckId_fkey" FOREIGN KEY ("uptimeCheckId") REFERENCES "uptime_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

