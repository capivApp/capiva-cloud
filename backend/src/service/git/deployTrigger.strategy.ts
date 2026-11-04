import type { GitWebhookEvent } from "@infra/git/webhookEvents";
import { strategyFor } from "@functions/strategyFor";

/**
 * Gatilho de deploy automático por aplicação (`sourceConfig.deployTrigger`):
 *  - `branch` (padrão, comportamento anterior): push na branch configurada;
 *  - `tag`: push de tag;
 *  - `release`: release publicada.
 * `tagPattern` (glob) restringe as tags aceitas nos modos tag/release.
 * PR/MR nunca vira deploy aqui: o GitService publica no barramento.
 */

export const DEPLOY_TRIGGERS = ["branch", "tag", "release"] as const;
export type DeployTrigger = (typeof DEPLOY_TRIGGERS)[number];

type SourceConfig = Record<string, unknown>;

/** O que disparar: rótulo da versão, sha completo (status do commit) e ref a construir. */
export interface DeployTarget {
  version: string;
  commitSha?: string;
  /** Ref Git a construir quando não é a branch configurada (deploy por tag/release). */
  gitRef?: string;
}

type DeployTriggerStrategy = (cfg: SourceConfig, event: GitWebhookEvent) => DeployTarget | null;

/**
 * Filtro de caminhos observados (monorepo): sem `watchPaths` configurado, todo
 * push dispara. Com a lista, só dispara quando o push mexeu em algum arquivo
 * sob um dos prefixos, evitando reconstruir todos os serviços do repositório a
 * cada commit.
 *
 * Um push sem lista de arquivos no payload (ou com mais de 20 commits, quando
 * os provedores truncam) dispara por segurança: melhor um build a mais do que
 * perder um deploy.
 */
export function matchesWatchPaths(configured: unknown, changedPaths: string[] | undefined): boolean {
  const paths = Array.isArray(configured) ? configured.map(String).map((p) => p.trim()).filter(Boolean) : [];
  if (paths.length === 0) return true;
  if (!changedPaths?.length) return true;

  const normalize = (value: string) => value.replace(/^\.?\//, "").replace(/\/+$/, "");
  const prefixes = paths.map(normalize);
  return changedPaths.some((file) => {
    const target = normalize(file);
    return prefixes.some((prefix) => target === prefix || target.startsWith(`${prefix}/`));
  });
}

const GLOB_TOKENS: Record<string, string> = { "*": ".*", "?": "." };

/** Glob simples (`*` e `?`) sobre a tag inteira; o resto é literal. Sem padrão, toda tag casa. */
export function matchesTagPattern(pattern: unknown, tag: string): boolean {
  const glob = typeof pattern === "string" ? pattern.trim() : "";
  if (!glob) return true;
  const source = glob.replace(/[*?.+^${}()|[\]\\/]/g, (char) => strategyFor(GLOB_TOKENS, char) ?? `\\${char}`);
  return new RegExp(`^${source}$`).test(tag);
}

const tagRef = (tag: string): string => `refs/tags/${tag}`;

const DEPLOY_TRIGGER_STRATEGIES: Record<DeployTrigger, DeployTriggerStrategy> = {
  branch: (cfg, event) => {
    if (event.kind !== "push") return null;
    if (((cfg.branch as string | undefined) ?? "main") !== event.branch) return null;
    if (!matchesWatchPaths(cfg.watchPaths, event.changedPaths)) return null;
    // Rótulo curto como sempre foi; o sha completo segue à parte para o status do commit.
    return { version: event.sha.slice(0, 7), commitSha: event.sha };
  },
  tag: (cfg, event) => {
    if (event.kind !== "tag" || !matchesTagPattern(cfg.tagPattern, event.tag)) return null;
    return { version: event.tag, commitSha: event.sha, gitRef: tagRef(event.tag) };
  },
  release: (cfg, event) => {
    if (event.kind !== "release" || !matchesTagPattern(cfg.tagPattern, event.tag)) return null;
    return { version: event.tag, commitSha: event.sha, gitRef: tagRef(event.tag) };
  },
};

const isSameRepo = (cfg: SourceConfig, event: GitWebhookEvent): boolean => {
  const configured = (cfg.repo as string | undefined) ?? (cfg.fullName as string | undefined);
  const received = event.kind === "pull_request" ? event.pullRequest.repo : event.repo;
  return !configured || !received || configured === received;
};

/** Decide se o evento dispara deploy desta aplicação e com qual versão. */
export function resolveDeployTarget(cfg: SourceConfig, event: GitWebhookEvent): DeployTarget | null {
  // Deploy automático ligado por padrão (comportamento anterior); quem
  // prefere promover manualmente desliga em Configurações.
  if (cfg.autoDeploy === false) return null;
  if (!isSameRepo(cfg, event)) return null;
  const strategy = strategyFor(DEPLOY_TRIGGER_STRATEGIES, cfg.deployTrigger) ?? DEPLOY_TRIGGER_STRATEGIES.branch;
  return strategy(cfg, event);
}
