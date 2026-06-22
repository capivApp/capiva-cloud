# 30. Catálogo de templates 1-clique (apps populares)

O Marketplace só tinha bancos gerenciados. Agora há um catálogo de **aplicações 1-clique**
(presets de Docker image) para apps populares self-hosted.

## Catálogo

`APP_TEMPLATES` (`pages/applications/new/appTemplates.ts`): n8n, Ghost, Plausible,
Uptime Kuma, Metabase, Gitea, NocoDB, Vaultwarden, WordPress. Cada template define
`image`, `port`, `env?` e `volumes?` (persistência onde aplicável).

## Fluxo

- Marketplace → seção "Aplicações 1-clique": cada card navega para
  `/applications/new?template=<id>`.
- `NewApplicationWizard` lê `?template=` e pré-preenche o formulário (source `DOCKER_IMAGE`,
  imagem, porta, env e volumes do template). O usuário só ajusta nome/domínio e cria — o
  fluxo normal de criação/reconcile assume daí.

Incremental por design: adicionar um app é só uma entrada no catálogo.
