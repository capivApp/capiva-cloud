import { Injectable } from "@di/index";
import { DEFAULT_BASE_URL, GitHubProvider, GitLabProvider, GiteaProvider } from "@infra/git/providers";
import type { IGitProvider } from "@interface/integrations";
import type { GitProviderKind } from "@prisma-generated/client";

export interface GitProviderConfig {
  provider: GitProviderKind;
  accessToken: string;
  webhookSecret: string;
  baseUrl?: string | null;
}

/** Factory que instancia a Strategy de provedor Git a partir de credenciais decifradas. */
@Injectable()
export class GitProviderFactory {
  build(config: GitProviderConfig): IGitProvider {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL[config.provider];
    switch (config.provider) {
      case "GITHUB":
        return new GitHubProvider(config.accessToken, config.webhookSecret, baseUrl);
      case "GITLAB":
        return new GitLabProvider(config.accessToken, config.webhookSecret, baseUrl);
      case "GITEA":
        return new GiteaProvider(config.accessToken, config.webhookSecret, baseUrl);
    }
  }
}
