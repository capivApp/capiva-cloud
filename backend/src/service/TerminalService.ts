import { Injectable } from "@di/index";
import { ApplicationService } from "@service/ApplicationService";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { HttpError } from "@functions/HttpError";
import type { V1Status } from "@kubernetes/client-node";

export interface TerminalTarget {
  kubeconfig: string;
  namespace: string;
  pod: string;
  container: string;
}

export interface TerminalShell {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
}

/**
 * Regras do terminal web: resolve em qual pod/container abrir o shell de uma
 * aplicação (estado desejado → recurso observado no cluster). O transporte
 * (WebSocket ↔ exec) fica na camada de infra (gateway).
 */
@Injectable()
export class TerminalService {
  constructor(
    private readonly apps: ApplicationService,
    private readonly kube: KubeContextResolver,
    private readonly k8s: KubernetesAdapter,
  ) {}

  /** Valida posse da app e escolhe um pod Running para o exec. */
  async resolveTarget(applicationId: string, tenant: { organizationId: string }): Promise<TerminalTarget> {
    const app = await this.apps.getById(applicationId, tenant);
    const ctx = await this.kube.forEnvironment(app.environmentId, tenant);
    if (!ctx.kubeconfig) throw HttpError.badRequest("Ambiente sem cluster configurado.");

    const target = await this.k8s.firstRunningPod(ctx.kubeconfig, ctx.namespace, app.name);
    if (!target) throw HttpError.notFound("Nenhum pod em execução para esta aplicação.");

    return { kubeconfig: ctx.kubeconfig, namespace: ctx.namespace, pod: target.pod, container: target.container };
  }

  /** Abre o shell interativo no alvo (delegado ao adapter; usado pelo gateway WS). */
  k8sExec(target: TerminalTarget, io: { onData: (chunk: Buffer) => void; onClose: (status?: V1Status) => void }): Promise<TerminalShell> {
    return this.k8s.execShell({
      kubeconfig: target.kubeconfig,
      namespace: target.namespace,
      pod: target.pod,
      container: target.container,
      onData: io.onData,
      onClose: io.onClose,
    });
  }
}
