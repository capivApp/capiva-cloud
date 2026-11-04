/**
 * Normalização dos webhooks Git (push, tag, release, PR/MR) de GitHub, GitLab e
 * Gitea a partir de payloads reais (fixtures). Função pura, sem banco nem rede.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parseGitWebhook, readGitEventName } from "@infra/git/webhookEvents";

type Fixture = { event: string; body: unknown };

/** Payloads reais (resumidos) de cada provedor, um arquivo por provedor. */
const readFixtures = (provider: string): Record<string, Fixture> =>
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "git", `${provider}.json`), "utf8"));

const github = readFixtures("github");
const gitlab = readFixtures("gitlab");
const gitea = readFixtures("gitea");

const parse = (provider: "GITHUB" | "GITLAB" | "GITEA", fixture: Fixture) => parseGitWebhook(provider, fixture.event, fixture.body);

describe("readGitEventName", () => {
  it("lê o header de evento de cada provedor", () => {
    expect(readGitEventName({ "x-github-event": "push" })).toBe("push");
    expect(readGitEventName({ "x-gitlab-event": "Tag Push Hook" })).toBe("Tag Push Hook");
    expect(readGitEventName({ "x-gitea-event": "release" })).toBe("release");
  });

  // O Gitea manda também X-GitHub-Event por compatibilidade; o header próprio vence.
  it("prefere o header do Gitea quando vierem os dois", () => {
    expect(readGitEventName({ "x-github-event": "pull_request", "x-gitea-event": "pull_request_sync" })).toBe("pull_request_sync");
  });

  it("sem header devolve undefined", () => {
    expect(readGitEventName({})).toBeUndefined();
  });
});

describe("parseGitWebhook: push", () => {
  it("GitHub", () => {
    expect(parse("GITHUB", github.push)).toEqual({
      kind: "push",
      branch: "main",
      sha: "0d1a26e67d8f5eaf1f6ba5c57fc3c7d91ac0fd1c",
      repo: "acme/api",
      changedPaths: ["apps/api/src/health.ts", "apps/api/src/index.ts"],
    });
  });

  it("GitLab", () => {
    expect(parse("GITLAB", gitlab.push)).toEqual({
      kind: "push",
      branch: "main",
      sha: "da1560886d4f094c3e6c9ef40349f7d38b5d27d7",
      repo: "mike/diaspora",
      changedPaths: ["CHANGELOG", "app/controller/application.rb"],
    });
  });

  it("Gitea", () => {
    expect(parse("GITEA", gitea.push)).toEqual({
      kind: "push",
      branch: "develop",
      sha: "bffeb74224043ba2feb48d137756c8a9331c449a",
      repo: "gitea/webhooks",
      changedPaths: ["services/api/main.go", "README.md"],
    });
  });

  // Apagar uma branch gera um push com `after` zerado; não há o que construir.
  it("ignora branch apagada", () => {
    expect(parse("GITHUB", github.branchDeleted)).toBeNull();
    expect(parse("GITLAB", gitlab.branchDeleted)).toBeNull();
  });

  it("sem header de evento, deduz o push pelo corpo", () => {
    expect(parseGitWebhook("GITHUB", undefined, github.push.body)?.kind).toBe("push");
    expect(parseGitWebhook("GITLAB", undefined, gitlab.push.body)?.kind).toBe("push");
    expect(parseGitWebhook("GITEA", undefined, gitea.push.body)?.kind).toBe("push");
  });
});

describe("parseGitWebhook: tag", () => {
  it("GitHub (push em refs/tags)", () => {
    expect(parse("GITHUB", github.tag)).toEqual({
      kind: "tag",
      tag: "v1.4.0",
      sha: "0d1a26e67d8f5eaf1f6ba5c57fc3c7d91ac0fd1c",
      repo: "acme/api",
    });
  });

  it("GitLab (Tag Push Hook)", () => {
    expect(parse("GITLAB", gitlab.tag)).toEqual({
      kind: "tag",
      tag: "v1.0.0",
      sha: "82b3d5ae55f7080f1e6022629cdb57bfae7cccc7",
      repo: "jsmith/example",
    });
  });

  it("Gitea (push em refs/tags)", () => {
    expect(parse("GITEA", gitea.tag)).toEqual({
      kind: "tag",
      tag: "release-2026.11",
      sha: "bffeb74224043ba2feb48d137756c8a9331c449a",
      repo: "gitea/webhooks",
    });
  });

  it("ignora tag apagada", () => {
    expect(parse("GITHUB", github.tagDeleted)).toBeNull();
    expect(parse("GITLAB", gitlab.tagDeleted)).toBeNull();
    expect(parse("GITEA", gitea.tagDeleted)).toBeNull();
  });
});

describe("parseGitWebhook: release", () => {
  it("GitHub (published)", () => {
    expect(parse("GITHUB", github.release)).toEqual({ kind: "release", tag: "v1.4.0", name: "v1.4.0 Saude", repo: "acme/api" });
  });

  it("GitLab (create, com o commit da tag)", () => {
    expect(parse("GITLAB", gitlab.release)).toEqual({
      kind: "release",
      tag: "v1.0.0",
      name: "v1.0.0",
      sha: "ee0a3fb31ac16e11b9dbb596ad16d4af654d08f8",
      repo: "acme/release-webhook-example",
    });
  });

  it("Gitea (published)", () => {
    expect(parse("GITEA", gitea.release)).toEqual({ kind: "release", tag: "release-2026.11", name: "Release 2026.11", repo: "gitea/webhooks" });
  });

  // Rascunho, edição e remoção de release não publicam versão nova.
  it("ignora release que não foi publicada", () => {
    expect(parse("GITHUB", github.releaseDraft)).toBeNull();
    expect(parse("GITLAB", gitlab.releaseUpdated)).toBeNull();
    expect(parse("GITEA", gitea.releaseDeleted)).toBeNull();
  });
});

describe("parseGitWebhook: pull request / merge request", () => {
  const githubPr = {
    number: 42,
    title: "Adiciona tela de login",
    repo: "acme/api",
    sourceBranch: "feature/login",
    targetBranch: "main",
    author: "anasouza",
    url: "https://github.com/acme/api/pull/42",
  };

  it("GitHub opened", () => {
    expect(parse("GITHUB", github.pullRequestOpened)).toEqual({
      kind: "pull_request",
      pullRequest: { ...githubPr, action: "opened", headSha: "c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6" },
    });
  });

  it("GitHub synchronize, reopened, closed e merged", () => {
    const headSha = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4";
    expect(parse("GITHUB", github.pullRequestSynchronize)).toEqual({ kind: "pull_request", pullRequest: { ...githubPr, action: "synchronized", headSha } });
    expect(parse("GITHUB", github.pullRequestReopened)).toEqual({ kind: "pull_request", pullRequest: { ...githubPr, action: "reopened", headSha } });
    expect(parse("GITHUB", github.pullRequestClosed)).toEqual({ kind: "pull_request", pullRequest: { ...githubPr, action: "closed", headSha } });
    expect(parse("GITHUB", github.pullRequestMerged)).toEqual({ kind: "pull_request", pullRequest: { ...githubPr, action: "merged", headSha } });
  });

  it("GitHub ignora ações que não mudam o código (labeled) e o ping", () => {
    expect(parse("GITHUB", github.pullRequestLabeled)).toBeNull();
    expect(parse("GITHUB", github.ping)).toBeNull();
  });

  const gitlabMr = {
    number: 1,
    title: "MS-Viewport",
    repo: "gitlabhq/gitlab-test",
    sourceBranch: "ms-viewport",
    targetBranch: "master",
    author: "root",
    url: "https://gitlab.acme.dev/gitlabhq/gitlab-test/-/merge_requests/1",
  };

  it("GitLab open", () => {
    expect(parse("GITLAB", gitlab.mergeRequestOpened)).toEqual({
      kind: "pull_request",
      pullRequest: { ...gitlabMr, action: "opened", headSha: "da1560886d4f094c3e6c9ef40349f7d38b5d27d7" },
    });
  });

  // `update` vale para título, label e também push novo; só o push (com `oldrev`) é sincronização.
  it("GitLab update com push vira synchronized; update só de metadados é ignorado", () => {
    expect(parse("GITLAB", gitlab.mergeRequestUpdatedWithPush)).toEqual({
      kind: "pull_request",
      pullRequest: { ...gitlabMr, action: "synchronized", headSha: "7b5c3cc8be40ee161ae89a06bba6229da1032a0c" },
    });
    expect(parse("GITLAB", gitlab.mergeRequestUpdatedMetadata)).toBeNull();
  });

  it("GitLab reopen, close e merge", () => {
    const headSha = "7b5c3cc8be40ee161ae89a06bba6229da1032a0c";
    expect(parse("GITLAB", gitlab.mergeRequestReopened)).toEqual({ kind: "pull_request", pullRequest: { ...gitlabMr, action: "reopened", headSha } });
    expect(parse("GITLAB", gitlab.mergeRequestClosed)).toEqual({ kind: "pull_request", pullRequest: { ...gitlabMr, action: "closed", headSha } });
    expect(parse("GITLAB", gitlab.mergeRequestMerged)).toEqual({ kind: "pull_request", pullRequest: { ...gitlabMr, action: "merged", headSha } });
  });

  it("GitLab ignora approved", () => {
    expect(parse("GITLAB", gitlab.mergeRequestApproved)).toBeNull();
  });

  const giteaPr = {
    number: 7,
    title: "Adiciona healthcheck",
    repo: "gitea/webhooks",
    sourceBranch: "feature/health",
    targetBranch: "master",
    author: "gitea",
    url: "https://git.acme.dev/gitea/webhooks/pulls/7",
  };

  it("Gitea opened", () => {
    expect(parse("GITEA", gitea.pullRequestOpened)).toEqual({
      kind: "pull_request",
      pullRequest: { ...giteaPr, action: "opened", headSha: "bffeb74224043ba2feb48d137756c8a9331c449a" },
    });
  });

  it("Gitea synchronized, reopened, closed e merged", () => {
    const headSha = "9a8b7c6d5e4f30211234567890abcdef12345678";
    expect(parse("GITEA", gitea.pullRequestSynchronized)).toEqual({ kind: "pull_request", pullRequest: { ...giteaPr, action: "synchronized", headSha } });
    expect(parse("GITEA", gitea.pullRequestReopened)).toEqual({ kind: "pull_request", pullRequest: { ...giteaPr, action: "reopened", headSha } });
    expect(parse("GITEA", gitea.pullRequestClosed)).toEqual({ kind: "pull_request", pullRequest: { ...giteaPr, action: "closed", headSha } });
    expect(parse("GITEA", gitea.pullRequestMerged)).toEqual({ kind: "pull_request", pullRequest: { ...giteaPr, action: "merged", headSha } });
  });

  it("Gitea aceita o tipo detalhado no header (pull_request_sync)", () => {
    expect(parseGitWebhook("GITEA", "pull_request_sync", gitea.pullRequestSynchronized.body)?.kind).toBe("pull_request");
  });

  it("sem header de evento, deduz PR/MR pelo corpo", () => {
    expect(parseGitWebhook("GITHUB", undefined, github.pullRequestOpened.body)?.kind).toBe("pull_request");
    expect(parseGitWebhook("GITLAB", undefined, gitlab.mergeRequestOpened.body)?.kind).toBe("pull_request");
    expect(parseGitWebhook("GITLAB", undefined, gitlab.tag.body)?.kind).toBe("tag");
    expect(parseGitWebhook("GITEA", undefined, gitea.release.body)?.kind).toBe("release");
  });
});

describe("parseGitWebhook: entradas inválidas", () => {
  it("evento desconhecido ou corpo vazio devolve null", () => {
    expect(parseGitWebhook("GITHUB", "issues", { action: "opened" })).toBeNull();
    expect(parseGitWebhook("GITLAB", undefined, {})).toBeNull();
    expect(parseGitWebhook("GITEA", "push", null)).toBeNull();
  });

  // Chave do protótipo não pode ser tratada como parser ou ação.
  it("nome de evento ou ação igual a propriedade do protótipo é ignorado", () => {
    expect(parseGitWebhook("GITHUB", "constructor", github.push!.body)).toBeNull();
    const mr = gitlab.mergeRequestOpened!.body as { object_attributes: Record<string, unknown> };
    expect(parseGitWebhook("GITLAB", "Merge Request Hook", { ...mr, object_attributes: { ...mr.object_attributes, action: "constructor" } })).toBeNull();
    expect(parseGitWebhook("GITHUB", "pull_request", { ...(github.pullRequestOpened!.body as object), action: "toString" })).toBeNull();
  });
});
