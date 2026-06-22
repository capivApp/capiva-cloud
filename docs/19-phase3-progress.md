# 19 — Phase 3 Progress & Decisions (English)

> Living document. Phase 3 = parity with Dokploy/Coolify + governance + layout.
> Update the status table and the per-WP notes as work lands. The authoritative
> task list is `TODO.md` at the repo root.

## Status

| WP | Area | Backend | Frontend | Validated | Notes |
|----|------|---------|----------|-----------|-------|
| 3.0 | Layout, Projects, Settings drawers, Tags | ✅ | ✅ | — | done previously |
| Prisma | All 3.1/3.2 models + enums | ✅ | — | ✅ db push | schema is source of truth |
| 3.1-A | Volumes (Longhorn) | ✅ | ✅ | ✅ E2E (RWO) | RWX needs node prereqs (see below) |
| 3.1-B | TLS (upload/LE/none) | ✅ | ✅ | ✅ E2E | `scripts/e2e-tls.sh` |
| 3.1-C | Monitoring (nodes/pods) | ✅ | ✅ | ✅ API | metrics-server; `/platform/monitoring` |
| 3.1-D | Requests (Traefik→Loki) | ✅ | ✅ | ✅ API* | *simulated (no Loki in dev); real parse impl |
| 3.1-E | Docker Registry + multi-S3 StorageProvider | ✅ | ✅ | ✅ API | imagePullSecret on deploy |
| 3.1-F | Volume backups (snapshot→S3) | ✅ | ✅ | ✅ API | Longhorn Backup CR + S3 target |
| 3.2-A | Invites + RBAC enforced | ✅ | ✅ | ✅ API | VIEWER blocked from deploy/cluster |
| DB backups | per-DB pg_dump/mysqldump → S3 | ✅ | ✅ | ✅ API | scope single/all, full/incremental; Job+Secret |
| 3.2-B | API/CLI keys (`cap_`) | ✅ | ✅ | ✅ API | org+role from key |
| 3.2-B | API/CLI keys (`cap_`) | ⏳ | ⏳ | — | |
| 3.2-C | Audit logs | ✅ | ✅ | ✅ API | record on key actions; ADMIN read |
| 3.2-D | Notifications | ✅ | ✅ | ✅ API | N/type, events, push/Expo, webhook delivered |
| 3.2-E | Reports (uptime) | ✅ | ✅ | ✅ API | scheduler + probe + uptime%/latency |
| Extra | ⌘K palette · GitLab self-host URL · SSO removed | ✅ | ✅ | typecheck | user-requested |

Legend: ✅ done · ⏳ pending · 🚧 in progress

## Cross-cutting build/infra fixes (done)

- **DI container**: `@di/index` re-exports `container` + `Injectable` from
  `@mateusseiboth/ts-decorators` (v1.2.2). The package is a local `file:` dep;
  if `bun install` can't link it, ensure the package has its own `node_modules`
  (`bun install` inside it) and symlink it into `backend/node_modules` and the
  workspace root `node_modules`.
- **Build module**: `@infra/build/strategies` implements a Strategy + Factory
  (`BuildStrategyResolver`): `DockerImageBuildStrategy` (passthrough — the image
  is the deploy target) and `KanikoBuildStrategy` (in-cluster Kaniko Job for Git
  sources, `kanikoJobManifest`). `DeploymentService` now uses the **build's
  returned imageRef** (fixes DOCKER_IMAGE deploys).
- **manifests.ts**: `workerManifest` no longer references undefined `input`
  (workers have no volumes).

## WP3.1-A — Volumes (DONE)

**Goal:** persistent folders that survive deploys; optionally shared across all
replicas (RWX) so every pod sees the same files. No YAML — the user only states
folder + size + "shared?".

**Backend (already present + extended):**
- `Volume` model; `VolumeRepository`; `ApplicationService.{listVolumes,addVolume,removeVolume}`.
- `pvcManifest()` picks the StorageClass by access mode via
  `storageClassFor()`: RWO → `CAPIVA_STORAGE_CLASS` (default `longhorn`),
  RWX → `CAPIVA_STORAGE_CLASS_RWX` (default `longhorn`).
- `ApplicationReconciler` applies one PVC per volume (`<app>-<vol>`) and wires
  `volumeMounts`/`volumes` into the Deployment/Rollout (`volumeBits`).
- CRUD routes: `GET/POST /applications/:id/volumes`, `DELETE …/:volId`.
- `createApplicationSchema.volumes[]` lets volumes be declared at app creation.
- Addons installed by provisioning (`functions/k3s.ts` `K3S_ADDONS`) and
  `scripts/dev-cluster.sh`: cert-manager, metrics-server, **Longhorn**.

**Frontend (new):**
- `VolumeEditor` component (folder + size + "shared between replicas?" toggle).
- Wizard **Rede** step: declare volumes at creation.
- App detail **Volumes** tab (`VolumesTab` + `useVolumes` hook): list/add/remove;
  each change reconciles the PVC and remounts.

**Validation:** `scripts/e2e-smoke.sh` — created an nginx app with a volume via
the API, deploy provisioned a **Bound** PVC mounted at the requested path; wrote
a file, deleted the pod, and the **replacement pod read the same file** → data
persists. RWX shared-across-nodes requires node prerequisites (see
`18-dev-environment.md` → Storage); Longhorn remains the production default.
