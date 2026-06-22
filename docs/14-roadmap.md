## 14 — Roadmap

## Phase 0 — Foundation (scaffolding) ✅ _(this deliverable)_

- Monorepo (backend + frontend), test docker-compose, Dockerfiles.
- Backend: layered architecture, DI, `withTransaction`, multi-provider Prisma, OpenAPI/Scalar, auth (short-lived access + cookie-only refresh + sessions).
- Frontend: CapivApp design system, AppShell, hook patterns, query/zustand setup, base screens and wizard flows.
- Full documentation under `/docs`.

---

## Phase 1 — MVP (functional control plane)

| Epic           | Deliverables                                                           |
| -------------- | ---------------------------------------------------------------------- |
| Identity       | Login/registration, organizations, members, RBAC, environments         |
| Clusters       | Register cluster (encrypted kubeconfig), basic Fleet view              |
| Applications   | Wizard (Docker Image + Git), profiles, scaling (HPA), domain (TLS/DNS) |
| Build & Deploy | Git webhooks, build (Kaniko/Nixpacks), rolling deploy, timeline        |
| Reconciler     | `ApplicationReconciler` + `KubernetesAdapter` (apply/watch)            |
| Observability  | Live logs (Loki), basic metrics (CPU/mem/req/lat/errors)               |
| Databases      | PostgreSQL single + HA (CloudNativePG), S3 backups                     |
| Dependencies   | Drag-and-drop graph, inject `DATABASE_URL`/`REDIS_URL`                 |

**MVP completion criteria:**
Deploy an app from GitHub with Postgres attached, TLS domain, automatic deploy on merge, plus logs and metrics — without ever exposing Kubernetes.

---

## Phase 2 — Platform

| Epic             | Deliverables                                                          |
| ---------------- | --------------------------------------------------------------------- |
| Smart Rollouts   | Argo Rollouts (Canary/Blue-Green), metrics-based rollback             |
| Marketplace      | Redis (Sentinel/Cluster), MySQL (InnoDB Cluster), RabbitMQ, MinIO     |
| Workers & Cron   | Visual Workers and CronJobs                                           |
| Release Tracking | commit→prod mapping, timing analytics, full audit trail               |
| Multi-cluster    | Environment-per-cluster, distribution strategies, enhanced Fleet view |
| Security         | Image scanning (Trivy), NetworkPolicies, Sealed/External Secrets      |

---

## Phase 3 — Advanced / Future

> ⚠️ No tiers or gating. Phases only define **delivery order**. Everything becomes available to all users once implemented.

| Epic                | Deliverables                                                |
| ------------------- | ----------------------------------------------------------- |
| Preview Deployments | Ephemeral PR environments (clone/seed/cleanup)              |
| Geo-redundancy      | Multi-region app deployment, DNS failover                   |
| Kafka/ES/ClickHouse | Additional operators                                        |
| FinOps              | Cost tracking per org/project/environment, quotas, billing  |
| Compliance          | Audit export, policy engine (OPA/Gatekeeper)                |
| Service Mesh        | Internal mTLS, advanced traffic policies (fully abstracted) |

---

## Prioritization principles

- Battle-tested components first, custom only when necessary.
- Every abstraction must solve a real operational pain.
- UX + automation always above raw feature exposure.
