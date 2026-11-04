import type { PullRequestEvent } from "@infra/realtime/GitEventBus";
import { strategyFor } from "@functions/strategyFor";

/**
 * Normalização dos webhooks Git. Cada provedor (GitHub, GitLab, Gitea) é uma
 * Strategy com um parser por tipo de evento, escolhido pelo header de evento
 * (`X-GitHub-Event`, `X-Gitlab-Event`, `X-Gitea-Event`) ou, sem header, deduzido
 * do corpo. O resto da plataforma só enxerga o `GitWebhookEvent` normalizado.
 */

type GitProvider = PullRequestEvent["provider"];

/** PR/MR normalizado, sem o vínculo com a conexão (o GitService acrescenta). */
export type NormalizedPullRequest = Omit<PullRequestEvent, "connectionId" | "organizationId" | "provider">;
type PullRequestAction = PullRequestEvent["action"];

export interface PushWebhookEvent {
  kind: "push";
  branch: string;
  sha: string;
  repo?: string;
  changedPaths: string[];
}

export interface TagWebhookEvent {
  kind: "tag";
  tag: string;
  sha: string;
  repo?: string;
}

export interface ReleaseWebhookEvent {
  kind: "release";
  tag: string;
  name?: string;
  /** Só o GitLab informa o commit da release; GitHub/Gitea trazem apenas a tag. */
  sha?: string;
  repo?: string;
}

export interface PullRequestWebhookEvent {
  kind: "pull_request";
  pullRequest: NormalizedPullRequest;
}

export type GitWebhookEvent = PushWebhookEvent | TagWebhookEvent | ReleaseWebhookEvent | PullRequestWebhookEvent;

// Payload de terceiro: nada é confiado, cada campo é lido por `at` e estreitado na folha.
type Payload = Record<string, unknown>;
type EventParser = (body: Payload) => GitWebhookEvent | null;

interface ProviderWebhookStrategy {
  /** Parser por nome de evento, exatamente como vem no header. */
  readonly parsers: Record<string, EventParser>;
  /** Nome do evento deduzido do corpo, para quando o header não veio. */
  inferEvent(body: Payload): string | undefined;
}

/** Header de evento de cada provedor. O Gitea manda também o do GitHub, então o dele vem primeiro. */
const EVENT_HEADERS = ["x-gitea-event", "x-gitlab-event", "x-github-event"] as const;

export function readGitEventName(headers: Record<string, string | string[] | undefined>): string | undefined {
  const header = EVENT_HEADERS.find((name) => typeof headers[name] === "string");
  return header ? (headers[header] as string) : undefined;
}

const isZeroSha = (sha: string): boolean => /^0+$/.test(sha);
const asString = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);
const isPayload = (body: unknown): body is Payload => typeof body === "object" && body !== null && !Array.isArray(body);
const objectOf = (value: unknown): Payload | undefined => (isPayload(value) ? value : undefined);
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Desce pelo caminho de chaves; qualquer degrau que não seja objeto encerra em `undefined`. */
const at = (value: unknown, ...path: string[]): unknown => path.reduce<unknown>((current, key) => objectOf(current)?.[key], value);

/**
 * Arquivos tocados pelo push. GitHub, GitLab e Gitea usam o mesmo formato de
 * commit (`added`/`modified`/`removed`), então uma leitura só cobre os três.
 */
function changedPathsOf(body: Payload): string[] {
  const files = listOf(body.commits).flatMap((c) => [...listOf(at(c, "added")), ...listOf(at(c, "modified")), ...listOf(at(c, "removed"))]);
  return [...new Set(files.filter((f): f is string => typeof f === "string"))];
}

type RefContext = { sha: string; repo?: string; body: Payload };

/** O que o prefixo do `ref` diz sobre o push: branch ou tag. */
const REF_EVENTS: Record<string, (name: string, ctx: RefContext) => GitWebhookEvent> = {
  "refs/heads/": (branch, { sha, repo, body }) => ({ kind: "push", branch, sha, repo, changedPaths: changedPathsOf(body) }),
  "refs/tags/": (tag, { sha, repo }) => ({ kind: "tag", tag, sha, repo }),
};

/** Push de branch ou de tag. Ref apagada chega com `after` zerado e não tem o que construir. */
function parseRefEvent(body: Payload, sha: string | undefined, repo: string | undefined): GitWebhookEvent | null {
  if (!sha || isZeroSha(sha) || body.deleted === true) return null;
  const ref = asString(body.ref) ?? "";
  const prefix = Object.keys(REF_EVENTS).find((p) => ref.startsWith(p));
  if (!prefix) return null;
  return REF_EVENTS[prefix](ref.slice(prefix.length), { sha, repo, body });
}

// ----------------------------- GitHub / Gitea -----------------------------

const parseGitHubStylePush: EventParser = (body) =>
  parseRefEvent(body, asString(body.after) ?? asString(at(body, "head_commit", "id")), asString(at(body, "repository", "full_name")));

/** Só `published` gera versão nova; rascunho, edição e remoção não. */
const parseGitHubStyleRelease: EventParser = (body) => {
  const release = objectOf(body.release);
  const tag = asString(release?.tag_name);
  if (body.action !== "published" || !tag || release?.draft === true) return null;
  return { kind: "release", tag, name: asString(release?.name), repo: asString(at(body, "repository", "full_name")) };
};

/** Ações de PR que mudam o código ou o ciclo de vida; o resto (labeled, assigned…) é ignorado. */
const GITHUB_STYLE_PR_ACTIONS: Record<string, (pr: Payload) => PullRequestAction> = {
  opened: () => "opened",
  synchronize: () => "synchronized",
  synchronized: () => "synchronized",
  reopened: () => "reopened",
  closed: (pr) => (pr.merged === true ? "merged" : "closed"),
};

const parseGitHubStylePullRequest: EventParser = (body) => {
  const pr = objectOf(body.pull_request);
  const toAction = strategyFor(GITHUB_STYLE_PR_ACTIONS, body.action);
  if (!pr || !toAction) return null;
  return buildPullRequest({
    action: toAction(pr),
    number: Number(body.number ?? pr.number),
    title: asString(pr.title) ?? "",
    repo: asString(at(body, "repository", "full_name")) ?? asString(at(pr, "base", "repo", "full_name")),
    sourceBranch: asString(at(pr, "head", "ref")),
    targetBranch: asString(at(pr, "base", "ref")),
    headSha: asString(at(pr, "head", "sha")),
    author: asString(at(pr, "user", "login")),
    url: asString(pr.html_url),
  });
};

const inferGitHubStyleEvent = (body: Payload): string | undefined =>
  (
    [
      ["pull_request", Boolean(body.pull_request)],
      ["release", Boolean(body.release)],
      ["push", typeof body.ref === "string"],
    ] as const
  ).find(([, matches]) => matches)?.[0];

const GITHUB_STYLE_PARSERS: Record<string, EventParser> = {
  push: parseGitHubStylePush,
  release: parseGitHubStyleRelease,
  pull_request: parseGitHubStylePullRequest,
};

// ----------------------------- GitLab -----------------------------

const parseGitLabRefEvent: EventParser = (body) =>
  parseRefEvent(body, asString(body.checkout_sha) ?? asString(body.after), asString(at(body, "project", "path_with_namespace")));

const parseGitLabRelease: EventParser = (body) => {
  const tag = asString(body.tag);
  if (body.action !== "create" || !tag) return null;
  return {
    kind: "release",
    tag,
    name: asString(body.name),
    sha: asString(at(body, "commit", "id")),
    repo: asString(at(body, "project", "path_with_namespace")),
  };
};

/** `update` vale para título, label e push novo: só o push (com `oldrev`) é sincronização. */
const GITLAB_MR_ACTIONS: Record<string, (attrs: Payload) => PullRequestAction | null> = {
  open: () => "opened",
  reopen: () => "reopened",
  close: () => "closed",
  merge: () => "merged",
  update: (attrs) => (attrs.oldrev ? "synchronized" : null),
};

const parseGitLabMergeRequest: EventParser = (body) => {
  const attrs = objectOf(body.object_attributes);
  const action = strategyFor(GITLAB_MR_ACTIONS, attrs?.action)?.(attrs!);
  if (!attrs || !action) return null;
  return buildPullRequest({
    action,
    number: Number(attrs.iid),
    title: asString(attrs.title) ?? "",
    repo: asString(at(body, "project", "path_with_namespace")),
    sourceBranch: asString(attrs.source_branch),
    targetBranch: asString(attrs.target_branch),
    headSha: asString(at(attrs, "last_commit", "id")),
    author: asString(at(body, "user", "username")),
    url: asString(attrs.url),
  });
};

const GITLAB_EVENT_BY_KIND: Record<string, string> = {
  push: "Push Hook",
  tag_push: "Tag Push Hook",
  release: "Release Hook",
  merge_request: "Merge Request Hook",
};

// ----------------------------- Comum -----------------------------

type PullRequestDraft = Omit<NormalizedPullRequest, "repo" | "sourceBranch" | "targetBranch" | "headSha"> & {
  repo?: string;
  sourceBranch?: string;
  targetBranch?: string;
  headSha?: string;
};

/** Sem número, repo, branches ou sha o evento não serve para preview: descarta. */
function buildPullRequest(draft: PullRequestDraft): PullRequestWebhookEvent | null {
  const { repo, sourceBranch, targetBranch, headSha } = draft;
  if (!Number.isInteger(draft.number) || !repo || !sourceBranch || !targetBranch || !headSha) return null;
  return { kind: "pull_request", pullRequest: { ...draft, repo, sourceBranch, targetBranch, headSha } };
}

const WEBHOOK_STRATEGIES: Record<GitProvider, ProviderWebhookStrategy> = {
  GITHUB: { parsers: GITHUB_STYLE_PARSERS, inferEvent: inferGitHubStyleEvent },
  // O Gitea detalha o tipo em `X-Gitea-Event-Type` (pull_request_sync); aceita os dois.
  GITEA: { parsers: { ...GITHUB_STYLE_PARSERS, pull_request_sync: parseGitHubStylePullRequest }, inferEvent: inferGitHubStyleEvent },
  GITLAB: {
    parsers: {
      "Push Hook": parseGitLabRefEvent,
      "Tag Push Hook": parseGitLabRefEvent,
      "Release Hook": parseGitLabRelease,
      "Merge Request Hook": parseGitLabMergeRequest,
    },
    inferEvent: (body) => strategyFor(GITLAB_EVENT_BY_KIND, body.object_kind),
  },
};

/** Normaliza um webhook do provedor. Evento desconhecido ou irrelevante devolve `null`. */
export function parseGitWebhook(provider: GitProvider, eventName: string | undefined, body: unknown): GitWebhookEvent | null {
  const strategy = WEBHOOK_STRATEGIES[provider];
  if (!strategy || !isPayload(body)) return null;
  const parser = strategyFor(strategy.parsers, eventName ?? strategy.inferEvent(body));
  return parser ? parser(body) : null;
}
