# 26. Configurações gerais da aplicação

Antes só dava para mudar estratégia/tags/TLS. Agora a aba **Configurações** permite editar
nome, perfil/recursos, porta, branch/imagem e health check.

## Endpoint

`PATCH /api/applications/:id` (`ApplicationController.patch` → `ApplicationService.patch`),
schema `updateApplicationSchema` (todos os campos opcionais, ao menos um obrigatório):
`name`, `profile`, `customResources`, `port`, `branch`, `image`, `healthPath`.

## Comportamento

- `branch`/`image`/`healthPath` são mesclados em `sourceConfig`.
- `healthPath` alimenta o `readinessProbe` do Deployment (`AppManifestInput.healthPath`,
  default `/`), lido pelo reconciler a partir de `sourceConfig.healthPath`.
- **Renomear**: como os recursos k8s são nomeados pela app, renomear primeiro destrói os
  recursos do nome antigo e então reconcilia com o novo (breve indisponibilidade — avisado
  na UI).
- Toda alteração reconcilia (Deployment/HPA/Ingress conforme o estado).

## UI

Aba **Configurações**: nome, porta, perfil (com CPU/memória quando `CUSTOM`), health path,
branch e imagem; salvar reconcilia.
