import { Injectable } from "@di/index";
import { ClusterRepository } from "@repository/ClusterRepository";
import { ClusterNodeRepository } from "@repository/ClusterNodeRepository";
import { SSHExecutor, type SSHShell, type SSHTarget } from "@infra/ssh/SSHExecutor";
import { withTransaction } from "@database/withTransaction";
import { decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";

/**
 * Regras do terminal de nó (SSH). Resolve o alvo SSH de um nó do cluster
 * (validando posse pela org) e abre o shell interativo. O transporte
 * (WebSocket ↔ SSH) fica no gateway.
 */
@Injectable()
export class NodeTerminalService {
  constructor(
    private readonly clusters: ClusterRepository,
    private readonly nodes: ClusterNodeRepository,
    private readonly ssh: SSHExecutor,
  ) {}

  /** Valida posse do nó e monta o alvo SSH (chave ou senha) a partir do cifrado. */
  async resolveTarget(nodeId: string, tenant: { organizationId: string }): Promise<SSHTarget & { label: string }> {
    const node = await withTransaction(() => this.nodes.findById(nodeId), { tenant });
    if (!node) throw HttpError.notFound("Nó não encontrado.");
    const cluster = await withTransaction(() => this.clusters.findById(node.clusterId), { tenant });
    if (!cluster || cluster.organizationId !== tenant.organizationId) throw HttpError.notFound("Nó não encontrado.");
    if (!node.sshCredentialCipher) throw HttpError.badRequest("Nó sem credencial SSH cadastrada.");

    const credential = decrypt(node.sshCredentialCipher);
    const isPrivateKey = credential.includes("PRIVATE KEY");
    return {
      host: node.host,
      port: node.sshPort,
      username: node.sshUser ?? "root",
      privateKey: isPrivateKey ? credential : undefined,
      password: isPrivateKey ? undefined : credential,
      label: `${node.sshUser ?? "root"}@${node.host}`,
    };
  }

  /** Abre o shell SSH interativo no alvo (delegado ao executor; usado pelo gateway). */
  sshShell(target: SSHTarget, io: { onData: (chunk: string) => void; onClose: () => void }): Promise<SSHShell> {
    return this.ssh.openShell(target, io);
  }
}
