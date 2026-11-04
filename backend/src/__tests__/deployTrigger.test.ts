/**
 * Gatilho de deploy por aplicação (`sourceConfig.deployTrigger`): branch (padrão),
 * tag ou release, com `tagPattern` opcional. Função pura, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { matchesTagPattern, resolveDeployTarget } from "@service/git/deployTrigger.strategy";
import type { GitWebhookEvent } from "@infra/git/webhookEvents";
import { updateApplicationSchema } from "@schemas/application.schema";

const SHA = "0d1a26e67d8f5eaf1f6ba5c57fc3c7d91ac0fd1c";

const push: GitWebhookEvent = { kind: "push", branch: "main", sha: SHA, repo: "acme/api", changedPaths: ["apps/api/a.ts"] };
const tag: GitWebhookEvent = { kind: "tag", tag: "v1.4.0", sha: SHA, repo: "acme/api" };
const release: GitWebhookEvent = { kind: "release", tag: "v1.4.0", name: "v1.4.0", repo: "acme/api" };

describe("resolveDeployTarget: branch (padrão)", () => {
  it("push na branch configurada dispara com o sha curto no rótulo e o sha completo à parte", () => {
    expect(resolveDeployTarget({ branch: "main", repo: "acme/api" }, push)).toEqual({ version: "0d1a26e", commitSha: SHA });
  });

  it("sem branch configurada, assume main", () => {
    expect(resolveDeployTarget({}, push)?.version).toBe("0d1a26e");
  });

  it("ignora push em outra branch, de outro repo, com deploy automático desligado ou fora dos caminhos", () => {
    expect(resolveDeployTarget({ branch: "develop" }, push)).toBeNull();
    expect(resolveDeployTarget({ repo: "acme/web" }, push)).toBeNull();
    expect(resolveDeployTarget({ autoDeploy: false }, push)).toBeNull();
    expect(resolveDeployTarget({ watchPaths: ["apps/web"] }, push)).toBeNull();
  });

  it("aceita fullName como repo (comportamento anterior)", () => {
    expect(resolveDeployTarget({ fullName: "acme/api" }, push)).not.toBeNull();
    expect(resolveDeployTarget({ fullName: "acme/web" }, push)).toBeNull();
  });

  it("no modo branch, tag e release não disparam", () => {
    expect(resolveDeployTarget({}, tag)).toBeNull();
    expect(resolveDeployTarget({}, release)).toBeNull();
  });
});

describe("resolveDeployTarget: tag", () => {
  it("tag dispara deploy daquela tag", () => {
    expect(resolveDeployTarget({ deployTrigger: "tag" }, tag)).toEqual({ version: "v1.4.0", commitSha: SHA, gitRef: "refs/tags/v1.4.0" });
  });

  it("respeita o tagPattern", () => {
    expect(resolveDeployTarget({ deployTrigger: "tag", tagPattern: "v*" }, tag)).not.toBeNull();
    expect(resolveDeployTarget({ deployTrigger: "tag", tagPattern: "release-*" }, tag)).toBeNull();
  });

  it("no modo tag, push e release não disparam", () => {
    expect(resolveDeployTarget({ deployTrigger: "tag" }, push)).toBeNull();
    expect(resolveDeployTarget({ deployTrigger: "tag" }, release)).toBeNull();
  });

  it("ignora tag de outro repo e deploy automático desligado", () => {
    expect(resolveDeployTarget({ deployTrigger: "tag", repo: "acme/web" }, tag)).toBeNull();
    expect(resolveDeployTarget({ deployTrigger: "tag", autoDeploy: false }, tag)).toBeNull();
  });
});

describe("resolveDeployTarget: release", () => {
  it("release publicada dispara deploy da tag; sem sha quando o provedor não informa", () => {
    expect(resolveDeployTarget({ deployTrigger: "release" }, release)).toEqual({ version: "v1.4.0", commitSha: undefined, gitRef: "refs/tags/v1.4.0" });
  });

  it("repassa o sha quando o provedor informa (GitLab)", () => {
    expect(resolveDeployTarget({ deployTrigger: "release" }, { ...release, sha: SHA })?.commitSha).toBe(SHA);
  });

  it("respeita o tagPattern e ignora tag avulsa", () => {
    expect(resolveDeployTarget({ deployTrigger: "release", tagPattern: "v1.*" }, release)).not.toBeNull();
    expect(resolveDeployTarget({ deployTrigger: "release", tagPattern: "v2.*" }, release)).toBeNull();
    expect(resolveDeployTarget({ deployTrigger: "release" }, tag)).toBeNull();
  });
});

describe("resolveDeployTarget: PR/MR nunca dispara deploy", () => {
  it("pull request é publicado no barramento, não vira deploy", () => {
    const pr: GitWebhookEvent = {
      kind: "pull_request",
      pullRequest: { action: "opened", number: 1, title: "x", repo: "acme/api", sourceBranch: "main", targetBranch: "main", headSha: SHA },
    };
    expect(resolveDeployTarget({}, pr)).toBeNull();
  });

  it("gatilho desconhecido cai no padrão branch", () => {
    expect(resolveDeployTarget({ deployTrigger: "qualquer" }, push)?.version).toBe("0d1a26e");
    expect(resolveDeployTarget({ deployTrigger: "constructor" }, push)?.version).toBe("0d1a26e");
  });
});

describe("updateApplicationSchema: gatilho de deploy", () => {
  it("aceita deployTrigger e tagPattern", () => {
    expect(updateApplicationSchema.safeParse({ deployTrigger: "tag", tagPattern: "v*" }).success).toBe(true);
    expect(updateApplicationSchema.safeParse({ deployTrigger: "release" }).success).toBe(true);
    expect(updateApplicationSchema.safeParse({ deployTrigger: "branch" }).success).toBe(true);
  });

  // String vazia limpa o padrão (toda tag volta a disparar).
  it("aceita tagPattern vazio como limpeza", () => {
    expect(updateApplicationSchema.safeParse({ tagPattern: "" }).success).toBe(true);
  });

  it("recusa gatilho desconhecido com mensagem em português", () => {
    const parsed = updateApplicationSchema.safeParse({ deployTrigger: "cron" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Escolha branch, tag ou release.");
  });
});

describe("matchesTagPattern", () => {
  it("sem padrão, toda tag casa", () => {
    expect(matchesTagPattern(undefined, "v1.0.0")).toBe(true);
    expect(matchesTagPattern("  ", "v1.0.0")).toBe(true);
  });

  it("glob com * e ?", () => {
    expect(matchesTagPattern("v*", "v1.0.0")).toBe(true);
    expect(matchesTagPattern("v?.0.0", "v1.0.0")).toBe(true);
    expect(matchesTagPattern("v?.0.0", "v10.0.0")).toBe(false);
    expect(matchesTagPattern("release/*", "release/2026.11")).toBe(true);
  });

  // Ponto e outros metacaracteres de regex são literais no glob.
  it("trata metacaracteres de regex como texto", () => {
    expect(matchesTagPattern("v1.0", "v1x0")).toBe(false);
    expect(matchesTagPattern("v1.0+build", "v1.0+build")).toBe(true);
  });

  it("casa a tag inteira, não um trecho", () => {
    expect(matchesTagPattern("v1", "v1.0.0")).toBe(false);
  });
});
