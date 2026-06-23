/**
 * Geração de comandos de instalação do k3s. O usuário não precisa saber nada de
 * Kubernetes — ou cola um comando, ou fornece SSH e a plataforma roda isto.
 */

/**
 * Pré-requisitos de cada nó para armazenamento persistente em ALTA DISPONIBILIDADE
 * com Longhorn:
 *  - `open-iscsi` (iscsid): volumes de bloco RWO replicados entre nós.
 *  - cliente NFS (`nfs-common`/`nfs-utils`): volumes RWX (share-manager) —
 *    pasta compartilhada entre todos os pods/réplicas.
 *  - módulo de kernel `iscsi_tcp`.
 * Portável entre apt/dnf/yum/zypper. Sem isto o Longhorn entra em CrashLoop.
 */
export function nodePrerequisitesScript(): string {
  return [
    "# Capiva Cloud — pré-requisitos de storage (Longhorn: open-iscsi + NFS)",
    "if command -v apt-get >/dev/null 2>&1; then sudo apt-get update -y && sudo apt-get install -y open-iscsi nfs-common;",
    "elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y iscsi-initiator-utils nfs-utils;",
    "elif command -v yum >/dev/null 2>&1; then sudo yum install -y iscsi-initiator-utils nfs-utils;",
    "elif command -v zypper >/dev/null 2>&1; then sudo zypper -n install open-iscsi nfs-client; fi",
    "sudo systemctl enable --now iscsid 2>/dev/null || true",
    "sudo modprobe iscsi_tcp 2>/dev/null || true",
    "echo iscsi_tcp | sudo tee /etc/modules-load.d/longhorn.conf >/dev/null 2>&1 || true",
  ].join("\n");
}

/** Comando do CONTROL PLANE (server). Reporta de volta para auto-registro. */
export function k3sServerScript(opts: { callbackUrl?: string; registrationToken?: string }): string {
  const callback = opts.callbackUrl && opts.registrationToken
    ? [
        "",
        "# Reporta credenciais para o Capiva Cloud (auto-registro):",
        "CAPIVA_TOKEN=$(cat /var/lib/rancher/k3s/server/node-token)",
        "CAPIVA_KUBECONFIG=$(cat /etc/rancher/k3s/k3s.yaml | base64 -w0)",
        "CAPIVA_IP=$(hostname -I | awk '{print $1}')",
        `curl -sS -X POST "${opts.callbackUrl}" -H 'Content-Type: application/json' \\`,
        `  -d "{\\"registrationToken\\":\\"${opts.registrationToken}\\",\\"serverUrl\\":\\"https://$CAPIVA_IP:6443\\",\\"nodeToken\\":\\"$CAPIVA_TOKEN\\",\\"kubeconfig\\":\\"$CAPIVA_KUBECONFIG\\"}"`,
      ].join("\n")
    : "";

  return [
    nodePrerequisitesScript(),
    "# Capiva Cloud — instalar control plane (k3s, Traefik incluso)",
    "curl -sfL https://get.k3s.io | sh -s - server --write-kubeconfig-mode 644 --tls-san $(hostname -I | awk '{print $1}')",
    callback,
  ].join("\n");
}

/** Comando do WORKER (agent) para juntar ao server. */
export function k3sAgentScript(serverUrl: string, nodeToken: string): string {
  return [
    nodePrerequisitesScript(),
    "# Capiva Cloud — juntar este nó como worker",
    `curl -sfL https://get.k3s.io | K3S_URL=${serverUrl} K3S_TOKEN=${nodeToken} sh -`,
  ].join("\n");
}

/** Comando para adicionar um control plane HA (embedded etcd). */
export function k3sControlPlaneJoinScript(serverUrl: string, nodeToken: string): string {
  return [
    nodePrerequisitesScript(),
    "# Capiva Cloud — juntar como control plane (HA)",
    `curl -sfL https://get.k3s.io | K3S_URL=${serverUrl} K3S_TOKEN=${nodeToken} sh -s - server --server ${serverUrl}`,
  ].join("\n");
}

/**
 * HelmChartConfig que liga o access log do Traefik (formato JSON) no k3s — sem
 * editar YAML à mão. As linhas viram logs estruturados coletados pelo Loki e
 * exibidos na tela de Requests.
 */
export const TRAEFIK_ACCESSLOG_HELMCONFIG = `cat <<'EOF' | kubectl apply -f -
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    logs:
      access:
        enabled: true
        format: json
EOF`;

/** Addons recomendados aplicados após o cluster subir (cert-manager, Longhorn, metrics-server). */
export const K3S_ADDONS = [
  "kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml",
  // Longhorn: armazenamento distribuído com RWX (volumes compartilhados entre pods).
  "kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/deploy/longhorn.yaml",
  // metrics-server (k3s já inclui; reforça em distros sem ele).
  "kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml",
  // CloudNativePG: operator de Postgres gerenciado (CRD postgresql.cnpg.io/Cluster).
  // Sem ele, criar banco Postgres dá 404 no CRD. --server-side: manifest grande.
  "kubectl apply --server-side -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.24/releases/cnpg-1.24.1.yaml",
  // Traefik access log em JSON (alimenta a tela de Requests via Loki).
  TRAEFIK_ACCESSLOG_HELMCONFIG,
];
