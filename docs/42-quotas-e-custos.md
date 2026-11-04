# 42. Quotas e custos (FinOps)

Item 2.7 do roadmap. Duas coisas: limites de recurso por ambiente, aplicados no cluster e
checados antes de criar ou escalar, e custo mensal estimado por recurso. É só visibilidade
de custo. Não existe cobrança.

## Unidade comum: `Consumo`

Quota e custo usam a mesma medida (`@functions/finops/consumo`):

| Campo           | Unidade   |
|-----------------|-----------|
| `cpuMillicores` | millicore |
| `memoryMib`     | MiB       |
| `pods`          | pods      |
| `storageGi`     | GiB       |

Cada tipo de recurso tem a sua strategy (`CONSUMO_STRATEGIES`). Ela devolve uma faixa
`{ min, max }`:

| Tipo          | Por unidade                                              | Multiplicador                                       |
|---------------|----------------------------------------------------------|-----------------------------------------------------|
| `APPLICATION` | perfil (`RESOURCE_PROFILES`, ou `customResources` quando CUSTOM) | réplicas: sem HPA, as 2 fixas do reconcile; com HPA, de `minReplicas` a `maxReplicas` |
| `DATABASE`    | `DATABASE_SIZE_RESOURCES` pelo tamanho, mais o disco de `storageFor` (`CAPIVA_DB_STORAGE_*`) | instâncias: 1, ou 3 com HA (o MinIO sobe 4) |
| `VOLUME`      | só disco (`sizeGi`)                                      | 1                                                   |

`DATABASE_SIZE_RESOURCES` (em `profiles.ts`) é o que a plataforma **conta** por instância
de banco. Os operators não recebem requests/limits. No cluster, os pods deles ficam com o
default do LimitRange (ver abaixo).

Workers e cron jobs ficam fora por enquanto, porque não pertencem a um ambiente no schema
atual (só a um projeto).

## Quotas por ambiente

### Modelo

Quatro colunas opcionais em `Environment` (`quotaCpuMillicores`, `quotaMemoryMib`,
`quotaPods`, `quotaStorageGi`). `null` quer dizer sem limite naquele recurso. Migration:
`20261104120000_environment_quotas`.

### No cluster: `ResourceQuota` e `LimitRange`

`QuotaReconciler` (`ReconcilerFactory.forQuota()`) aplica dois manifests no namespace do
ambiente. Os dois vêm de funções puras em `@infra/kubernetes/quotaManifests`:

- `capiva-quota` (ResourceQuota): `requests.cpu`/`limits.cpu`, `requests.memory`/`limits.memory`,
  `pods` e `requests.storage`. Entram só os limites definidos.
- `capiva-limits` (LimitRange): default de container (limite SMALL, request NANO). Com quota
  de CPU ou memória, o Kubernetes recusa pod sem requests/limits. Sem esse default, os
  bancos via operator e os jobs de build não subiriam.

Se nenhum limite estiver definido, os dois recursos são removidos.

### Validação antecipada na API

O pedido que não cabe é recusado **antes** de gravar. Sem isso o pod ficaria em Pending
sem explicação. O uso conta as **réplicas máximas do HPA**, os volumes e os bancos do
ambiente (`buildUsoDoInventario`). Quando o pedido troca algo que já existe, o consumo
anterior é descontado (`substitui`).

| Operação                                    | Onde                                   | `path` do erro         |
|---------------------------------------------|----------------------------------------|------------------------|
| Criar aplicação (perfil x 2 réplicas + volumes) | `ApplicationService.create`         | `profile`, `volumes`   |
| Trocar perfil ou `customResources`          | `ApplicationService.patch`             | `profile`              |
| Adicionar volume                            | `ApplicationService.addVolume`         | `sizeGi`               |
| Definir HPA (`maxReplicas`)                 | `ScalingService.setPolicy`             | `maxReplicas`          |
| Escala manual                               | `ScalingService.scaleManually`         | `replicas`             |
| Criar banco gerenciado                      | `ManagedDatabaseService.create`        | `size`, `highAvailability` |

A recusa é `QuotaExcedidaError` (HTTP 422, `error: "QUOTA_EXCEEDED"`). `HttpError` ganhou o
campo opcional `errors`, e o `errorHandler` devolve:

```json
{
  "error": "QUOTA_EXCEEDED",
  "message": "Memória acima da quota do ambiente. Pedido: 2 GiB. Disponível: 1 GiB.",
  "errors": [{ "path": "profile", "message": "Memória acima da quota do ambiente. Pedido: 2 GiB. Disponível: 1 GiB." }]
}
```

### Endpoints

| Método | Rota                         | Papel   | Descrição                                       |
|--------|------------------------------|---------|-------------------------------------------------|
| GET    | `/api/environments/:id/quota` | membro | `{ limite, uso, disponivel }`                   |
| PUT    | `/api/environments/:id/quota` | ADMIN+ | Grava os limites e reconcilia o namespace       |

Corpo do `PUT`: `{ cpuMillicores, memoryMib, pods, storageGi }`, cada um inteiro > 0 ou `null`.

## Custo estimado

### Tabela de preços

Vem de variáveis de ambiente (`readTabelaDePrecos`). As variáveis estão listadas em
[20-variaveis-de-ambiente.md](20-variaveis-de-ambiente.md):

| Variável                     | Default |
|------------------------------|---------|
| `CAPIVA_PRICE_CURRENCY`      | `BRL`   |
| `CAPIVA_PRICE_VCPU_HOUR`     | `0.2`   |
| `CAPIVA_PRICE_RAM_GB_HOUR`   | `0.03`  |
| `CAPIVA_PRICE_DISK_GB_MONTH` | `0.5`   |

### Cálculo

```
custo/mês = vCPU x preço vCPU-hora x 730 + GB RAM x preço GB-hora x 730 + GB disco x preço GB-mês
```

O custo sai da mesma faixa de consumo da quota, com mínimo e máximo do HPA
(`estimateCustoDoRecurso`). `buildRelatorioDeCusto` agrega:

- por aplicação, já com os volumes dela;
- por banco gerenciado;
- por projeto, por ambiente e no total da organização.

### Endpoints

| Método | Rota                                  | Descrição                                            |
|--------|---------------------------------------|------------------------------------------------------|
| GET    | `/api/costs`                          | Relatório da organização                             |
| GET    | `/api/costs/estimate/application?profile=SMALL[&minReplicas&maxReplicas]` | Estimativa do wizard |

## Frontend

- `useCosts` e `useCustoEstimadoDoPerfil` (`hooks/useCosts.ts`), `useEnvironmentQuota`
  (`hooks/useEnvironmentQuota.ts`). Formatação e leitura de `errors[]` em `lib/finops.ts`.
- Dashboard: `CostCard` com o total e o custo por ambiente.
- Listas: `CustoIndicador` no `ServiceCard` (lista de aplicações e dashboard) e nos cards de
  projeto.
- Wizard de aplicação: custo estimado abaixo do perfil escolhido. A recusa por quota volta
  para o campo (`profile` ou `volumes`) e abre o passo onde ele está.
- Configurações > Ambientes > **Quota**: `QuotaDrawer` com os limites (vazio = sem limite,
  em vCPU e GiB) e o uso atual (usado / limite) em barras.

## Testes

Funções puras, sem banco nem cluster, em `backend/src/__tests__`:

- `finops.consumo.test.ts`: faixa por tipo, réplicas do HPA, soma e subtração.
- `finops.quota.test.ts`: disponível e mensagens de violação.
- `finops.checagem.test.ts`: pedido com substituição e `QuotaExcedidaError` (422 + `errors`).
- `finops.custo.test.ts`: tabela de preços pelas variáveis e custo mensal.
- `finops.relatorio.test.ts`: uso do inventário e agregação por projeto/ambiente.
- `quotaManifests.test.ts`: ResourceQuota e LimitRange.

## Pendências

- Quota por organização. `findViolacoesDeQuota` já é genérica; falta guardar o limite e
  checar o inventário da organização.
- Workers e cron jobs no consumo, quando passarem a ter ambiente.
- Passar `DATABASE_SIZE_RESOURCES` aos CRs dos operators para o cluster contar o mesmo que a
  plataforma.
