# 18 — Local Development Environment (English)

> Audience: agents/devs bringing up the full stack locally to build and validate
> Phase 3 features against a **real** Kubernetes cluster. Everything here was
> verified on this machine (Fedora, Docker, no host k3s).

## Components

| Component        | How it runs                              | Endpoint / Port |
|------------------|------------------------------------------|-----------------|
| Postgres (control plane) | Docker container `capiva-postgres` | `localhost:5433` → 5432 |
| MinIO (S3 backups/uploads) | Docker container `capiva-minio`  | `:9000` API, `:9001` console |
| Kubernetes       | **k3d** (k3s-in-Docker), cluster `capiva` | LB `:8880`→80, `:8843`→443 |
| Backend (API)    | `bun src/index.ts` (port 3000)           | `http://localhost:3000` |
| Frontend         | `bun run dev` (Vite)                     | `http://localhost:5173` |

> Why non-default ports: host `5432`/`8443`/`9443` were already taken by other
> containers. Postgres uses **5433**; the k3d load balancer uses **8880/8843**.

## One-time setup

```bash
# Tooling (installed to ~/.local/bin — no sudo needed)
#   kubectl (already present), k3d, helm
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | K3D_INSTALL_DIR=$HOME/.local/bin USE_SUDO=false bash
curl -s https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | HELM_INSTALL_DIR=$HOME/.local/bin USE_SUDO=false bash
export PATH="$HOME/.local/bin:$PATH"

# Control-plane datastore + object storage
docker run -d --name capiva-postgres -e POSTGRES_USER=capiva -e POSTGRES_PASSWORD=capiva -e POSTGRES_DB=capiva -p 5433:5432 postgres:17-alpine
docker run -d --name capiva-minio -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin -p 9000:9000 -p 9001:9001 minio/minio:latest server /data --console-address ":9001"

# Real Kubernetes cluster (1 server + 2 agents) + addons
k3d cluster create capiva --servers 1 --agents 2 --port "8880:80@loadbalancer" --port "8843:443@loadbalancer" --wait
kubectl create serviceaccount capiva -n default
kubectl create clusterrolebinding capiva-admin --clusterrole=cluster-admin --serviceaccount=default:capiva
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type=json -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

`scripts/dev-cluster.sh up` automates the cluster + addons (cert-manager,
metrics-server, Longhorn) and prints the API URL + token to register in the UI.

## Backend env (`backend/.env`)

```
DATABASE_URL=postgresql://capiva:capiva@localhost:5433/capiva?schema=public
ENCRYPTION_KEY=change-me-32-bytes-key-000000000000
# Dev storage classes (production uses longhorn for both):
CAPIVA_STORAGE_CLASS=local-path        # RWO volumes
CAPIVA_STORAGE_CLASS_RWX=local-path    # RWX (see Storage note below)
```

Then:

```bash
cd backend
bun run prisma:generate
bun run prisma:db-push      # creates all tables (Phase 3 models included)
bun src/index.ts            # API on :3000  (Scalar docs at /docs)
```

## Storage: RWO vs RWX in k3d (IMPORTANT)

- **RWO** volumes work out of the box in k3d via the built-in `local-path`
  StorageClass (`WaitForFirstConsumer` — the PVC binds when the first pod is
  scheduled). Validated end-to-end (see `scripts/e2e-smoke.sh`).
- **RWX** (a folder shared by all pods/replicas) requires a provisioner whose
  driver needs **node userspace tooling** (Longhorn → `open-iscsi`/`iscsiadm`;
  NFS → `mount.nfs`). The **k3d node image is minimal** (busybox + k3s, no libc,
  no package manager), so neither Longhorn nor an in-cluster NFS server can
  mount on k3d nodes here.
- **Production design is Longhorn** (decision ADR — `longhorn`/RWX via
  share-manager). It works on real nodes (managed k8s, kubeadm, host k3s) where
  `open-iscsi` is installed. The platform keeps `longhorn` as the default
  StorageClass and exposes `CAPIVA_STORAGE_CLASS` / `CAPIVA_STORAGE_CLASS_RWX`
  so dev clusters can point at whatever they support.
- To demo RWX locally, use a cluster whose nodes have the prerequisites (e.g.
  `kubeadm` VMs, or `k3s` installed on the host with `open-iscsi`).

### Production provisioning closes the gap (HA persistent + shared storage)

The platform's **own cluster provisioning** (SSH/k3s — `functions/k3s.ts` +
`ClusterProvisionerService`) installs the Longhorn prerequisites on **every
node** before k3s, so Longhorn runs for real:

- `nodePrerequisitesScript()` (prepended to the server, worker and HA
  control-plane install scripts) installs `open-iscsi` + the NFS client
  (`nfs-common`/`nfs-utils`, portable across apt/dnf/yum/zypper), enables
  `iscsid`, and loads `iscsi_tcp` (persisted via `/etc/modules-load.d`).
- After the addons, the provisioner tunes Longhorn for the cluster size:
  `default-replica-count = min(3, nodeCount)` and `default-data-locality =
  best-effort`.

Result on a provisioned cluster:
- **RWO** volumes are block devices replicated across nodes (HA — a replica per
  node up to 3); if a node dies, Longhorn rebuilds/attaches elsewhere.
- **RWX** volumes are a shared filesystem (Longhorn share-manager over NFS) seen
  by every pod/replica.

So **only k3d** (the local dev sandbox, minimal node image) can't run Longhorn;
every cluster the platform provisions can, with HA + shared storage out of the box.

## End-to-end smoke test

`scripts/e2e-smoke.sh` drives the platform **through the HTTP API only**
(register → org → register the k3d cluster → environment → project → create an
app with a persistent volume → deploy) and then verifies in Kubernetes that the
Deployment, Service and **PVC + volume mount** were created — no hand-written
YAML. Run it after backend changes:

```bash
bash scripts/e2e-smoke.sh   # expects backend on :3000 and kubectl → k3d 'capiva'
```
