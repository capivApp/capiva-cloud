/**
 * Geração de comandos de instalação do k3s. O usuário não precisa saber nada de
 * Kubernetes — ou cola um comando, ou fornece SSH e a plataforma roda isto.
 */

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
    "# Capiva Cloud — instalar control plane (k3s, Traefik incluso)",
    "curl -sfL https://get.k3s.io | sh -s - server --write-kubeconfig-mode 644 --tls-san $(hostname -I | awk '{print $1}')",
    callback,
  ].join("\n");
}

/** Comando do WORKER (agent) para juntar ao server. */
export function k3sAgentScript(serverUrl: string, nodeToken: string): string {
  return [
    "# Capiva Cloud — juntar este nó como worker",
    `curl -sfL https://get.k3s.io | K3S_URL=${serverUrl} K3S_TOKEN=${nodeToken} sh -`,
  ].join("\n");
}

/** Comando para adicionar um control plane HA (embedded etcd). */
export function k3sControlPlaneJoinScript(serverUrl: string, nodeToken: string): string {
  return [
    "# Capiva Cloud — juntar como control plane (HA)",
    `curl -sfL https://get.k3s.io | K3S_URL=${serverUrl} K3S_TOKEN=${nodeToken} sh -s - server --server ${serverUrl}`,
  ].join("\n");
}

/** Addons recomendados aplicados após o cluster subir (cert-manager, Longhorn, metrics-server). */
export const K3S_ADDONS = [
  "kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml",
  // Longhorn: armazenamento distribuído com RWX (volumes compartilhados entre pods).
  "kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/deploy/longhorn.yaml",
  // metrics-server (k3s já inclui; reforça em distros sem ele).
  "kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml",
];
