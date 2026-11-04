/**
 * Qual ref do Git o build clona. Deploy por tag/release chega com `gitRef`
 * (`refs/tags/v1.2.0`) e vence a branch configurada; sem ele, vale a branch.
 * `branch` é o nome curto, que o `git clone --branch` aceita para branch e tag.
 */
export interface BuildRef {
  branch: string;
  gitRef: string;
}

const REF_PREFIX = /^refs\/(heads|tags)\//;

export function resolveBuildRef(config: Record<string, unknown>): BuildRef {
  const gitRef = typeof config.gitRef === "string" && config.gitRef ? config.gitRef : undefined;
  const branch = (config.branch as string | undefined) ?? "main";
  if (!gitRef) return { branch, gitRef: `refs/heads/${branch}` };
  return { branch: gitRef.replace(REF_PREFIX, ""), gitRef };
}
