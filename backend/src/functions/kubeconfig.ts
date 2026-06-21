/**
 * Monta um kubeconfig YAML a partir de campos estruturados. O usuário final
 * NUNCA escreve YAML — informa apenas URL do API server, token e (opcional) CA.
 */
export interface ClusterConnection {
  apiUrl: string;
  token: string;
  caCert?: string; // PEM
}

export function buildKubeconfig(name: string, conn: ClusterConnection): string {
  const clusterBlock = conn.caCert
    ? `    certificate-authority-data: ${Buffer.from(conn.caCert).toString("base64")}`
    : `    insecure-skip-tls-verify: true`;

  return [
    "apiVersion: v1",
    "kind: Config",
    `current-context: ${name}`,
    "clusters:",
    `- name: ${name}`,
    "  cluster:",
    `    server: ${conn.apiUrl}`,
    clusterBlock,
    "contexts:",
    `- name: ${name}`,
    `  context:`,
    `    cluster: ${name}`,
    `    user: ${name}`,
    "users:",
    `- name: ${name}`,
    "  user:",
    `    token: ${conn.token}`,
    "",
  ].join("\n");
}
