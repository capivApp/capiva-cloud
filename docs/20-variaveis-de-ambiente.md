# 20. Variáveis de Ambiente (editor pós-criação)

Edição em lote das variáveis de runtime de uma aplicação após a criação, sem YAML.
Antes só era possível defini-las no wizard de criação; agora há a aba **Variáveis** no
detalhe da aplicação.

## Endpoints

Todos sob `/api/applications/:id` (auth + RBAC). Leitura: qualquer papel. Mutação: `DEVELOPER+`.

| Método | Rota              | Descrição                                              |
|--------|-------------------|--------------------------------------------------------|
| GET    | `/:id/env`        | Lista variáveis (segredos **mascarados**, valor `""`). |
| PUT    | `/:id/env`        | Substitui em lote as variáveis `MANUAL`.               |
| DELETE | `/:id/env/:key`   | Remove uma variável (qualquer origem).                 |

## Regras de negócio (`EnvVarService`)

- **Segredos cifrados em repouso**: variáveis `secret` são cifradas com AES-256-GCM
  (`@functions/crypto`) antes de persistir. O `GET` nunca retorna o valor de um segredo —
  devolve `""` e `secret: true`/`hasValue: true` para a UI mascarar.
- **Preservação de segredo em branco**: ao salvar, um segredo com valor vazio cujo registro
  anterior também era secreto **mantém o valor cifrado atual** (a UI mostra
  `•••••• (mantém atual)`). A decisão está isolada na função pura `resolveStoredValue`
  (testada em `src/__tests__/envvar.resolve.test.ts`).
- **Substituição só de `MANUAL`**: o `PUT` faz upsert das chaves enviadas (origem `MANUAL`)
  e remove as `MANUAL` ausentes do payload. Variáveis `INJECTED` (geradas por dependências,
  ex.: conexão com banco) **não são tocadas** pela substituição em lote — só podem ser
  removidas individualmente pelo `DELETE`.
- **Reconciliação**: após cada alteração, `ApplicationService.reconcile` reaplica o
  Deployment (que já lê e decifra os segredos), refletindo as envs no container.

## Frontend

- Hook `useEnvVars` (react-query): `list`/`save`(PUT lote)/`remove`, com invalidação.
- Aba `EnvVarsTab`: linhas chave/valor, marcar como secreta (cifra), mostrar/ocultar,
  colar bloco `.env` (parser ignora comentários `#`, `export ` e aspas), e salvar
  reconciliando. Variáveis `INJECTED` aparecem em seção separada, somente leitura.

## Verificação (k3d real)

`PUT /applications/:id/env` → `kubectl -n <ns> get deploy <app> -o jsonpath='{..env}'`
mostra as variáveis; o `GET` não vaza o valor dos segredos.

## Variáveis do control plane: preview deployments

Lidas pelo backend (`@service/preview/previewSettings`). Ver
[37-preview-deployments.md](37-preview-deployments.md).

| Variável                   | Default | Descrição |
|----------------------------|---------|-----------|
| `CAPIVA_PREVIEW_DOMAIN`    | (vazio) | Domínio base dos previews por PR. O PR 42 da aplicação `api` sobe em `pr-42-api.<CAPIVA_PREVIEW_DOMAIN>`. Aponte um DNS curinga (`*.preview.exemplo.com`) para o ingress do cluster. Vazio: o preview é criado sem domínio público. |
| `CAPIVA_PREVIEW_TTL_DAYS`  | `7`     | Dias sem atividade (sem push no PR, sem deploy) até o scheduler destruir o preview. Valor inválido ou `<= 0` volta ao default. |
