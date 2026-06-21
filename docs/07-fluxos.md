# 07 — Workflows

---

## 1. New Application (Wizard)

```mermaid id="wf_new_app"
flowchart TD
    A["New Application"] --> B{Source}

    B -->|Git| C["Connect GitHub / GitLab / Gitea"]
    B -->|Docker Image| D["Provide image"]
    B -->|Compose / Nixpacks / Buildpacks / Static| E["Auto detection"]

    C --> F["Select org → repo → branch"]
    F --> G["Detect project structure:<br/>Dockerfile, compose, package.json,<br/>pnpm-workspace, turbo.json, nx.json"]
    G --> H{Multiple Dockerfiles?}

    H -->|Yes| I["Select Dockerfile"]
    H -->|No| J["Resource profile (Nano → XLarge)"]

    I --> J
    D --> J
    E --> J

    J --> K["Scaling config (min/max + metrics)"]
    K --> L["Domain (optional) → TLS + DNS"]
    L --> M["Environment (Dev / Staging / Prod)"]
    M --> N["Create → first deployment"]
```

The platform applies sensible defaults at every step.

Advanced mode allows full manual control (CPU, memory, storage).

---

## 2. Automatic Deployment (Git → Production)

```mermaid id="wf_deploy"
sequenceDiagram
    actor Dev
    participant Git as GitHub / GitLab / Gitea
    participant API as Capiva API
    participant Build as Build Service
    participant Reg as Registry
    participant K8s as Kubernetes (Argo Rollouts)
    participant UI as Frontend

    Dev->>Git: merge PR into main
    Git->>API: webhook event (push / merge)

    API->>API: validate branch + signature
    API->>Build: build image (Kaniko / Nixpacks / Buildpacks)
    Build->>Reg: push image (tag = commit SHA)

    API->>K8s: apply new Rollout revision

    K8s-->>API: readiness + rollout status
    API-->>UI: realtime timeline (WebSocket)

    K8s->>K8s: traffic shifting (zero downtime)

    API-->>UI: deployment completed
```

This flow is identical across GitHub, GitLab and Gitea.

No user intervention is required after initial setup.

---

## 3. Zero Downtime + Smart Rollback

```mermaid id="wf_rollback"
stateDiagram-v2
    [*] --> Building
    Building --> Pushing
    Pushing --> Rolling

    Rolling --> HealthCheck
    HealthCheck --> TrafficShift

    TrafficShift --> Promoted
    TrafficShift --> RollingBack

    HealthCheck --> RollingBack

    RollingBack --> Failed
    Promoted --> [*]
    Failed --> [*]
```

### Automatic rollback triggers

- Health check failure
- Increased error rate
- Latency spike
- Crash loops
- Startup failures

When triggered, traffic is immediately routed back to the previous stable version and the deployment is marked as failed.

---

## 4. Managed Service Provisioning (e.g. PostgreSQL)

```mermaid id="wf_db"
flowchart TD
    A["Marketplace → PostgreSQL"] --> B["Name + Size selection<br/>(Small / Medium / Large)"]

    B --> C{High Availability?}

    C -->|No| D["Single instance + PVC"]
    C -->|Yes| E["Operator-based HA<br/>(replication + failover)"]

    D --> F["Storage + backups + monitoring"]
    E --> F

    F --> G["Generate credentials + DATABASE_URL"]
    G --> H["Inject into dependent services"]
```

Users never interact with StatefulSets, replicas, or operators directly.

They only decide whether HA is enabled.

---

## 5. Service Dependency Graph

```mermaid id="wf_graph"
flowchart TD
    FE["Frontend"] --> API["API"]
    API --> PG[(PostgreSQL)]
    API --> RMQ[(RabbitMQ)]
    API --> REDIS[(Redis)]
```

When dependencies are created (drag-and-drop):

1. Internal DNS is configured automatically
2. Environment variables are generated (`DATABASE_URL`, `REDIS_URL`, etc.)
3. Variables are injected into dependent services
4. Startup order is handled when required

---

## 6. Deployment Traceability (Commit → Production)

```mermaid id="wf_trace"
flowchart LR
    Commit --> Build --> Image --> Deploy --> Pods --> Traffic
```

The UI provides full traceability per commit:

- Author
- Branch / PR
- Deployment status
- Environment (Dev / Staging / Prod)
- Pod status
- Deployment history

Also available:

- Rollback history
- Deploy frequency
- Commit → production latency
- Failure rate per service

---

## 7. Manual Rollback

```mermaid id="wf_manual_rb"
flowchart LR
    V["Version list<br/>v1.0.5 / v1.0.4 / v1.0.3"] --> R["Rollback action"]
    R --> D["Re-apply selected revision<br/>zero-downtime deployment"]
```

Rollback is treated as a standard deployment with a previous revision.

---

## Next Steps

Continue with:

1. [08-wireframes.md](./08-wireframes.md)
2. [10-alta-disponibilidade-multicluster.md](./10-alta-disponibilidade-multicluster.md)
3. [13-deploy-intelligence.md](./13-deploy-intelligence.md)
