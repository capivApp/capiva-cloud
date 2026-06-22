import crypto from "crypto";
import { Injectable } from "@di/index";
import { ClusterRepository } from "@repository/ClusterRepository";
import { ClusterNodeRepository } from "@repository/ClusterNodeRepository";
import { ProvisioningTaskRepository } from "@repository/ProvisioningTaskRepository";
import { SSHExecutor, type SSHTarget } from "@infra/ssh/SSHExecutor";
import { deploymentEvents } from "@infra/realtime/EventBus";
import { withTransaction } from "@database/withTransaction";
import { decrypt, encrypt } from "@functions/crypto";
import { k3sAgentScript, k3sControlPlaneJoinScript, k3sServerScript, K3S_ADDONS } from "@functions/k3s";
import { HttpError } from "@functions/HttpError";
import { config } from "../config";
import type { Cluster, NodeRole } from "@prisma-generated/client";

export interface SshNodeInput {
  host: string;
  sshUser: string;
  sshPort?: number;
  privateKey?: string;
  password?: string;
  role: NodeRole;
}

/**
 * Provisiona Kubernetes (k3s) a partir de acesso aos nós — o usuário não precisa
 * saber instalar nada. Dois modos:
 *  - COPY_PASTE: gera comando; o nó faz callback e a plataforma se auto-registra.
 *  - SSH: a plataforma conecta nos nós e instala/junta tudo, depois registra.
 */
@Injectable()
export class ClusterProvisionerService {
  constructor(
    private readonly clusters: ClusterRepository,
    private readonly nodes: ClusterNodeRepository,
    private readonly tasks: ProvisioningTaskRepository,
    private readonly ssh: SSHExecutor,
  ) {}

  // ---------------- COPY-PASTE ----------------

  /** Cria o cluster (modo copy-paste) e devolve o comando do control plane. */
  async createCopyPaste(organizationId: string, name: string): Promise<{ cluster: Cluster; serverScript: string }> {
    const registrationToken = crypto.randomBytes(24).toString("base64url");
    const cluster = await withTransaction(
      () =>
        this.clusters.create({
          organizationId,
          name,
          provisioner: "COPY_PASTE",
          registrationToken,
          status: "awaiting-node",
        }),
      { tenant: { organizationId } },
    );
    const callbackUrl = `${config.publicUrl}/cluster-callback`;
    return { cluster, serverScript: k3sServerScript({ callbackUrl, registrationToken }) };
  }

  /** Callback do nó: registra kubeconfig/serverUrl/nodeToken e marca conectado. */
  async handleCallback(input: { registrationToken: string; serverUrl: string; nodeToken: string; kubeconfig: string }): Promise<void> {
    const cluster = await withTransaction(() => this.clusters.findByRegistrationToken(input.registrationToken));
    if (!cluster) throw HttpError.unauthorized("Token de registro inválido.");

    // kubeconfig do k3s aponta para 127.0.0.1 — reescreve para o IP acessível.
    const kubeconfig = Buffer.from(input.kubeconfig, "base64").toString("utf8").replace(/https:\/\/127\.0\.0\.1:6443/g, input.serverUrl);

    await withTransaction(
      () =>
        this.clusters.update(cluster.id, {
          kubeconfigCipher: encrypt(kubeconfig),
          serverUrl: input.serverUrl,
          nodeTokenCipher: encrypt(input.nodeToken),
          registrationToken: null,
          status: "connected",
        }),
      { tenant: { organizationId: cluster.organizationId } },
    );
  }

  /** Comando para juntar mais um nó (worker ou control plane). */
  async joinCommand(organizationId: string, clusterId: string, role: NodeRole): Promise<string> {
    const cluster = await this.requireCluster(organizationId, clusterId);
    if (!cluster.serverUrl || !cluster.nodeTokenCipher) throw HttpError.badRequest("Cluster ainda não está pronto.");
    const token = decrypt(cluster.nodeTokenCipher);
    return role === "CONTROL_PLANE"
      ? k3sControlPlaneJoinScript(cluster.serverUrl, token)
      : k3sAgentScript(cluster.serverUrl, token);
  }

  // ---------------- SSH ----------------

  /** Provisiona via SSH: instala o control plane, junta os demais e registra. */
  async provisionViaSsh(organizationId: string, name: string, nodeInputs: SshNodeInput[]): Promise<Cluster> {
    if (!nodeInputs.some((n) => n.role === "CONTROL_PLANE")) {
      throw HttpError.badRequest("É necessário ao menos um nó control plane.");
    }

    const cluster = await withTransaction(
      () => this.clusters.create({ organizationId, name, provisioner: "SSH", status: "provisioning" }),
      { tenant: { organizationId } },
    );

    const created = await withTransaction(
      () =>
        Promise.all(
          nodeInputs.map((n) =>
            this.nodes.create({
              clusterId: cluster.id,
              role: n.role,
              host: n.host,
              sshUser: n.sshUser,
              sshPort: n.sshPort ?? 22,
              sshCredentialCipher: encrypt(JSON.stringify({ privateKey: n.privateKey, password: n.password })),
              status: "pending",
            }),
          ),
        ),
      { tenant: { organizationId } },
    );

    // Pipeline assíncrono (fire-and-forget) com log/SSE por etapa.
    this.runSshPipeline(cluster.id, organizationId, created, nodeInputs).catch(async (e) => {
      await withTransaction(() => this.clusters.update(cluster.id, { status: "failed" }), { tenant: { organizationId } });
      console.error("[provision] falhou", e);
    });

    return cluster;
  }

  private targetOf(n: SshNodeInput): SSHTarget {
    return { host: n.host, port: n.sshPort, username: n.sshUser, privateKey: n.privateKey, password: n.password };
  }

  private async runSshPipeline(
    clusterId: string,
    organizationId: string,
    createdNodes: { id: string; host: string; role: NodeRole }[],
    inputs: SshNodeInput[],
  ): Promise<void> {
    const tenant = { organizationId };
    const task = await withTransaction(() => this.tasks.create({ clusterId, kind: "install-server" }), { tenant });
    const log = async (line: string) => {
      await withTransaction(() => this.tasks.appendLog(task.id, line), { tenant });
      deploymentEvents.emit(task.id, { label: line.slice(0, 120), status: "running", progress: 0 });
    };

    const byHost = new Map(createdNodes.map((c) => [c.host, c]));
    const cp = inputs.find((n) => n.role === "CONTROL_PLANE")!;
    const cpNode = byHost.get(cp.host)!;

    // 1) Instala o control plane.
    await log(`Instalando control plane em ${cp.host}...`);
    await withTransaction(() => this.nodes.updateStatus(cpNode.id, "provisioning"), { tenant });
    await this.ssh.run(this.targetOf(cp), k3sServerScript({}), (c) => void log(c.trimEnd()));

    // 2) Lê node-token, IP e kubeconfig.
    const tokenRes = await this.ssh.run(this.targetOf(cp), "sudo cat /var/lib/rancher/k3s/server/node-token");
    const ipRes = await this.ssh.run(this.targetOf(cp), "hostname -I | awk '{print $1}'");
    const kcRes = await this.ssh.run(this.targetOf(cp), "sudo cat /etc/rancher/k3s/k3s.yaml");
    const nodeToken = tokenRes.stdout.trim();
    const serverIp = ipRes.stdout.trim();
    const serverUrl = `https://${serverIp}:6443`;
    const kubeconfig = kcRes.stdout.replace(/https:\/\/127\.0\.0\.1:6443/g, serverUrl);
    await withTransaction(() => this.nodes.updateStatus(cpNode.id, "ready", serverIp), { tenant });

    // 3) Junta os demais nós.
    for (const n of inputs.filter((x) => x.host !== cp.host)) {
      const node = byHost.get(n.host)!;
      await log(`Juntando ${n.host} como ${n.role}...`);
      await withTransaction(() => this.nodes.updateStatus(node.id, "provisioning"), { tenant });
      const script = n.role === "CONTROL_PLANE" ? k3sControlPlaneJoinScript(serverUrl, nodeToken) : k3sAgentScript(serverUrl, nodeToken);
      await this.ssh.run(this.targetOf(n), script, (c) => void log(c.trimEnd()));
      await withTransaction(() => this.nodes.updateStatus(node.id, "ready"), { tenant });
    }

    // 4) Addons (cert-manager, metrics-server, Longhorn, Traefik accessLog).
    await log("Instalando addons (cert-manager, metrics-server, Longhorn)...");
    for (const cmd of K3S_ADDONS) {
      await this.ssh.run(this.targetOf(cp), `sudo k3s ${cmd.replace(/^kubectl /, "kubectl ")}`).catch(() => undefined);
    }

    // 4b) Storage HA: ajusta o nº de réplicas do Longhorn ao tamanho do cluster
    // (min(3, nós)) e liga data-locality. Best-effort: aguarda o CRD de settings.
    const replicas = Math.min(3, inputs.length);
    await log(`Configurando storage HA (Longhorn: ${replicas} réplica(s) por volume)...`);
    await this.ssh
      .run(this.targetOf(cp), "sudo k3s kubectl -n longhorn-system wait --for=condition=established crd/settings.longhorn.io --timeout=180s")
      .catch(() => undefined);
    for (const [name, value] of [["default-replica-count", String(replicas)], ["default-data-locality", "best-effort"]]) {
      await this.ssh
        .run(this.targetOf(cp), `sudo k3s kubectl -n longhorn-system patch settings.longhorn.io/${name} --type=merge -p '{"value":"${value}"}'`)
        .catch(() => undefined);
    }

    // 5) Registra o cluster na plataforma.
    await withTransaction(
      () =>
        this.clusters.update(clusterId, {
          kubeconfigCipher: encrypt(kubeconfig),
          serverUrl,
          nodeTokenCipher: encrypt(nodeToken),
          status: "connected",
        }),
      { tenant },
    );
    await withTransaction(() => this.tasks.finish(task.id, "success"), { tenant });
    deploymentEvents.emit(task.id, { label: "Cluster provisionado e registrado ✅", status: "success", progress: 100, done: true });
  }

  private async requireCluster(organizationId: string, id: string): Promise<Cluster> {
    const cluster = await withTransaction(() => this.clusters.findById(id), { tenant: { organizationId } });
    if (!cluster || cluster.organizationId !== organizationId) throw HttpError.notFound("Cluster não encontrado.");
    return cluster;
  }
}
