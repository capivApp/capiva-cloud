/**
 * Deploy por tag/release: o webhook manda `config.gitRef = refs/tags/<tag>` e o
 * build tem que clonar a tag, não a branch configurada.
 */
import { describe, expect, it } from "bun:test";
import { resolveBuildRef } from "@infra/build/buildRef";
import { dockerfileJobManifest, type BuildJobInput } from "@infra/kubernetes/buildManifests";

const baseInput: BuildJobInput = {
  name: "build-abc-0",
  namespace: "prod",
  imageRef: "registry.local/api:1.0.0",
  repo: "github.com/acme/api.git",
  branch: "main",
  gitPullMethod: "https",
  buildArgs: [],
  deploymentId: "dep_1",
  push: true,
  insecure: false,
  config: {},
};

type KanikoJob = { spec: { template: { spec: { containers: { args: string[] }[] } } } };
const contextOf = (job: unknown) =>
  (job as KanikoJob).spec.template.spec.containers[0]!.args.find((a) => a.startsWith("--context="));

describe("resolveBuildRef", () => {
  it("sem gitRef usa a branch configurada", () => {
    expect(resolveBuildRef({ branch: "develop" })).toEqual({ branch: "develop", gitRef: "refs/heads/develop" });
  });

  it("sem branch nem gitRef cai em main", () => {
    expect(resolveBuildRef({})).toEqual({ branch: "main", gitRef: "refs/heads/main" });
  });

  it("gitRef de tag vence a branch e vira o nome curto para o git clone", () => {
    expect(resolveBuildRef({ branch: "main", gitRef: "refs/tags/v1.2.0" })).toEqual({ branch: "v1.2.0", gitRef: "refs/tags/v1.2.0" });
  });

  it("gitRef de branch também é aceito", () => {
    expect(resolveBuildRef({ gitRef: "refs/heads/release/2" })).toEqual({ branch: "release/2", gitRef: "refs/heads/release/2" });
  });
});

describe("dockerfileJobManifest com gitRef", () => {
  it("o contexto do Kaniko aponta para a tag", () => {
    expect(contextOf(dockerfileJobManifest({ ...baseInput, branch: "v1.2.0", gitRef: "refs/tags/v1.2.0" }))).toBe(
      "--context=git://github.com/acme/api.git#refs/tags/v1.2.0",
    );
  });

  it("sem gitRef continua na branch", () => {
    expect(contextOf(dockerfileJobManifest(baseInput))).toBe("--context=git://github.com/acme/api.git#refs/heads/main");
  });
});
