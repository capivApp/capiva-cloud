# 01 — Overview

## What is Capiva Cloud?

**Capiva Cloud** is a self-hosted application platform designed to make infrastructure and deployment accessible to any development team.

Developers can deploy applications, databases, workers and scheduled jobs through a visual interface while the platform handles provisioning, networking, storage, scaling, monitoring and operational concerns automatically.

The goal is simple:

> Build software, not infrastructure.

Users should never need to understand containers, cluster networking, storage systems or Kubernetes concepts to successfully run applications in production.

The capybara represents the philosophy behind the platform: calm, reliable and approachable infrastructure that simply works.

---

## What Capiva Cloud Is Not

- ❌ Not a Kubernetes dashboard.
- ❌ Not a cluster management tool.
- ❌ Not a platform that requires YAML files or command-line tooling.
- ❌ Not a collection of infrastructure components exposed directly to end users.
- ❌ Not designed primarily for platform engineers or SRE teams.

Capiva Cloud focuses on application deployment and infrastructure automation, not cluster administration.

---

## Product Philosophy

| Priority | Principle                                |
| -------- | ---------------------------------------- |
| 1        | Simplicity above everything              |
| 2        | User experience first                    |
| 3        | Minimal configuration                    |
| 4        | Guided workflows instead of manual setup |
| 5        | Sensible defaults                        |
| 6        | Opinionated automation                   |
| 7        | Advanced options only when necessary     |

---

## Core Platform Areas

### Applications

Deploy applications directly from Git repositories or container images.

Supported sources include:

- GitHub
- GitLab
- Gitea
- Docker Images

The platform automatically detects the stack, configures builds and manages deployments.

### Service Marketplace

Provision common infrastructure services in a few clicks.

Examples include:

- PostgreSQL
- MySQL
- Redis
- RabbitMQ
- Kafka
- MinIO
- Elasticsearch
- ClickHouse

### Service Connections

Applications and services can be connected visually.

Connection strings, credentials and environment variables are generated and managed automatically.

### Deployment Automation

Built-in Git integration enables:

- Automatic builds
- Automatic deployments
- Rollbacks
- Zero-downtime releases
- Deployment history

### Observability

Monitor applications through a simple interface.

Features include:

- Live logs
- Metrics dashboards
- Deployment events
- Health status

No external observability expertise is required.

### Organizations and Teams

Support for:

- Organizations
- Teams
- Multiple environments
- Multi-cluster deployments

---

## Positioning

Capiva Cloud combines the simplicity of modern deployment platforms with the flexibility and ownership of self-hosted infrastructure.

| Platform     | Managed Experience | Self-Hosted | Multi-Cluster | Managed Services |
| ------------ | ------------------ | ----------- | ------------- | ---------------- |
| Railway      | ✅                 | ❌          | ❌            | ✅               |
| Render       | ✅                 | ❌          | ❌            | ✅               |
| Fly.io       | ✅                 | ❌          | Partial       | Partial          |
| Coolify      | Partial            | ✅          | ❌            | Partial          |
| Dokploy      | Partial            | ✅          | ❌            | Partial          |
| Capiva Cloud | ✅                 | ✅          | ✅            | ✅               |

The platform is built for organizations that want the convenience of modern PaaS platforms without giving up infrastructure ownership.

---

## Target User

> "I have an API, a PostgreSQL database, a Redis instance and a background worker. I want automatic deployments, backups, logs and monitoring without hiring a dedicated infrastructure team."

Capiva Cloud is designed for developers and small teams that want production-grade infrastructure without becoming infrastructure specialists.
