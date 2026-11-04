import type { Application } from "@prisma-generated/client";
import type { PullRequestEvent } from "@infra/realtime/GitEventBus";
import {
  isOrigemDoRepositorio,
  isOrigemElegivelParaPreview,
} from "@service/preview/previewEligibility";

/**
 * Operações que as strategies orquestram. O `PreviewDeploymentService`
 * implementa (banco, cluster, aviso no PR); o teste injeta mocks.
 */
export interface PreviewOperations {
  findPreview(origem: Application, event: PullRequestEvent): Promise<Application | null>;
  createPreview(origem: Application, event: PullRequestEvent): Promise<Application>;
  /** Regrava os metadados do PR (sha do head): conta como atividade para o TTL. */
  refreshPreview(preview: Application, event: PullRequestEvent): Promise<Application>;
  deployPreview(preview: Application, event: PullRequestEvent): Promise<void>;
  destroyPreview(preview: Application): Promise<void>;
  notify(event: PullRequestEvent, previewUrl: string | null, notes?: string[]): Promise<void>;
  /** Avisos gravados na criação (banco do preview vazio, cópia falhou). */
  notesOf(preview: Application): string[];
  notifyFailure(event: PullRequestEvent, message: string): Promise<void>;
  previewUrlOf(preview: Application): string | null;
}

/** Uma strategy por ação do PR: quem reage e como. */
export interface PreviewActionStrategy {
  isOrigemElegivel(origem: Application, event: PullRequestEvent): boolean;
  apply(origem: Application, event: PullRequestEvent, ops: PreviewOperations): Promise<void>;
}

/**
 * Criação recusada (cota do ambiente, nome em uso): o PR recebe o motivo e o
 * erro segue para o log, senão o preview sumiria em silêncio.
 */
const createOrNotifyFailure = (
  origem: Application,
  event: PullRequestEvent,
  ops: PreviewOperations,
): Promise<Application> =>
  ops.createPreview(origem, event).catch(async (error: Error) => {
    await ops.notifyFailure(event, error.message);
    throw error;
  });

/** opened/reopened: cria (ou reaproveita, em webhook reentregue), faz o deploy e avisa o PR. */
class CreatePreviewStrategy implements PreviewActionStrategy {
  isOrigemElegivel = isOrigemElegivelParaPreview;

  async apply(origem: Application, event: PullRequestEvent, ops: PreviewOperations): Promise<void> {
    const existing = await ops.findPreview(origem, event);
    if (existing) return ops.deployPreview(existing, event);
    const preview = await createOrNotifyFailure(origem, event, ops);
    await ops.deployPreview(preview, event);
    await ops.notify(event, ops.previewUrlOf(preview), ops.notesOf(preview));
  }
}

/** synchronized: novo push no PR redeploya. Sem preview (previews ligados depois), cria. */
class RedeployPreviewStrategy implements PreviewActionStrategy {
  isOrigemElegivel = isOrigemElegivelParaPreview;

  constructor(private readonly create: PreviewActionStrategy) {}

  async apply(origem: Application, event: PullRequestEvent, ops: PreviewOperations): Promise<void> {
    const existing = await ops.findPreview(origem, event);
    if (!existing) return this.create.apply(origem, event, ops);
    const preview = await ops.refreshPreview(existing, event);
    await ops.deployPreview(preview, event);
  }
}

/**
 * closed/merged: destrói recursos no cluster e linhas no banco. Não exige o
 * toggle ligado: desligar os previews com PR aberto não pode deixar órfão.
 */
class DestroyPreviewStrategy implements PreviewActionStrategy {
  isOrigemElegivel = isOrigemDoRepositorio;

  async apply(origem: Application, event: PullRequestEvent, ops: PreviewOperations): Promise<void> {
    const preview = await ops.findPreview(origem, event);
    if (!preview) return;
    await ops.destroyPreview(preview);
    await ops.notify(event, null);
  }
}

const CREATE = new CreatePreviewStrategy();
const DESTROY = new DestroyPreviewStrategy();

const STRATEGIES: Record<PullRequestEvent["action"], PreviewActionStrategy> = {
  opened: CREATE,
  reopened: CREATE,
  synchronized: new RedeployPreviewStrategy(CREATE),
  closed: DESTROY,
  merged: DESTROY,
};

export const createPreviewActionStrategy = (
  action: PullRequestEvent["action"],
): PreviewActionStrategy | undefined => STRATEGIES[action];
