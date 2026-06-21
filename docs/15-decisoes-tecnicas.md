## 15 — Technical Decisions (ADRs)

Format: **Context → Decision → Consequences**

---

## ADR-001 — Kubernetes as data plane

**Context:** evaluated Nomad, Swarm, Firecracker.
**Decision:** Kubernetes (multi-cluster).
**Consequences:** mature ecosystem (operators for HA databases), Gateway API + Argo Rollouts, portability and sovereignty. Complexity is intentionally hidden by the platform.

---

## ADR-002 — Full Kubernetes abstraction

**Decision:** no YAML, no CRDs exposed, no manifests in UI. Only high-level concepts (profiles, scaling, strategies).
**Consequences:** better UX; requires a strong reconciler layer and opinionated defaults that won’t always make everyone happy.

---

## ADR-003 — Argo Rollouts for Progressive Delivery

**Decision:** use Argo Rollouts instead of building in-house logic.
**Consequences:** battle-tested canary/blue-green + metrics rollback. CRDs must be fully hidden and generated internally.

---

## ADR-004 — Bun + Express + `@mateusseiboth/ts-decorators`

**Decision:** Bun runtime, Express 5, internal decorator framework (DI, routing, validation, auditing).
**Consequences:** high productivity, consistent patterns inherited from `backend-base` and `mateus-main`, but some lock-in to internal tooling (acceptable).

---

## ADR-005 — Custom `withTransaction()` (multi-provider)

**Context:** existing transaction system is tightly coupled to Postgres/RLS.
**Decision:** new abstraction using AsyncLocalStorage, supporting Postgres/MySQL/SQLite, with tenant context propagation and hooks for future RLS/auditing.
**Consequences:** all DB operations become transactional by default; switching databases does not require service rewrites.

---

## ADR-006 — Prisma as source of truth (multi-provider)

**Decision:** `DATABASE_PROVIDER` switchable; schema avoids provider-specific features; models implement `Prisma.*`.
**Consequences:** portability across databases, but some advanced features may be gated per provider.

---

## ADR-007 — Auth model: short-lived access + cookie-only refresh

**Decision:** RS256 JWT access token (15m) with `sid`, plus opaque rotating refresh token stored only in HttpOnly cookie (SHA-256 hashed at rest). Sessions persisted, multi-device, replay detection, fingerprinting, Argon2id passwords.
**Consequences:** resistant to XSS (refresh never exposed to JS), fast revocation via `sid`, better security posture overall. Based on `mateus-main/src/auth`, adapted for distributed control plane.

---

## ADR-008 — Strict layering (Repository-only Prisma)

**Decision:** business logic only in Services; Prisma only in Repositories/DAO; external integrations behind interfaces (DIP + Factory/Strategy).
**Consequences:** testable architecture, low coupling, easier provider swapping.

---

## ADR-009 — Frontend stack discipline

**Decision:** React + TanStack Query + Zustand + ShadCN. Pages never call React Query directly; feature hooks encapsulate it.
**Consequences:** consistent UX with `BasePage`, predictable state flow, no leakage of server-state logic into components.

---

## ADR-010 — In-cluster builds (Kaniko / Buildpacks / Nixpacks)

**Decision:** build images inside Kubernetes Jobs, no Docker daemon dependency.
**Consequences:** scalable, secure, cloud-native pipeline.

---

## ADR-011 — Observability abstraction layer

**Decision:** internal Prometheus/Loki/OTel, but UI exposes only simplified logs and metrics. No PromQL or LogQL exposure.
**Consequences:** clean UX, but backend must translate everything into predefined views.

---

## ADR-012 — No heavy architectural overengineering

**Decision:** avoid CQRS/Event Sourcing/Mediator patterns unless strictly needed. Use Factory/Strategy/Repository/DI only where it solves a real problem.
**Consequences:** system stays understandable for a small team, avoids abstraction fatigue.

---

## ADR-013 — Monorepo structure

**Decision:** single repo with `backend/` and `frontend/` (Bun workspaces).
**Consequences:** shared types possible later, simpler CI/CD, less fragmentation.

---

## ADR-014 — API documentation via Zod → OpenAPI → Scalar

**Decision:** Zod is source of truth, OpenAPI generated automatically, UI served via Scalar.
**Consequences:** zero manual API docs, always in sync with code.

---

## ADR-015 — Edge layer: Traefik + cert-manager

**Context:** ingress complexity needs to stay invisible.
**Decision:** Traefik (via k3s default ingress) + cert-manager (Let’s Encrypt). No Gateway API exposed.
**Consequences:** minimal configuration for users, automatic TLS, stable self-hosted behavior.

---

## ADR-016 — Cluster provisioning via k3s (SSH / bootstrap command)

**Decision:** platform provisions clusters via k3s install script (SSH or copy-paste bootstrap command with auto-registration callback).
**Consequences:** lowers entry barrier to near zero, but introduces responsibility for node lifecycle management.

---

## ADR-017 — TLS pragmatism in Kubernetes client (Bun compatibility)

**Context:** `@kubernetes/client-node` TLS issues under Bun with self-signed clusters.
**Decision:** optional insecure TLS mode (`CAPIVA_K8S_INSECURE_TLS`) for control plane only, since it manages its own clusters.
**Consequences:** avoids deployment blockers in real environments, but must be clearly isolated and documented.

---

## ADR-018 — API contracts strictly Zod-first

**Decision:** Zod schemas define everything → OpenAPI → Scalar UI. No manual contract duplication.
**Consequences:** fewer drift bugs, faster iteration, single source of truth.

---
