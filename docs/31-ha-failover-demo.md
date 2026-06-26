# 31 — Demonstração de Alta Disponibilidade & Failover

Este documento descreve **como provar, num cluster real**, que a Capiva Cloud
sobrevive à queda de um nó — tanto para **aplicações** quanto para o **plano de
controle** e o **banco de dados**. Acompanha o script
[`scripts/ha-failover-demo.sh`](../scripts/ha-failover-demo.sh).

Veja também: [Alta Disponibilidade & Multi-Cluster](./10-alta-disponibilidade-multicluster.md),
[Cluster Provisioning](./17-cluster-provisioning.md).

## O que torna o cluster tolerante a falhas

| Camada | Mecanismo | Efeito ao derrubar um nó |
| --- | --- | --- |
| Plano de controle | **k3s server com etcd embutido** (`--cluster-init`) + ≥3 control planes | Quórum mantém a API viva; outro server assume |
| Aplicações | `replicas ≥ 2` + `topologySpreadConstraints` + `PodDisruptionBudget` | Réplicas em outros nós continuam servindo |
| Banco de dados | Operators HA (CloudNativePG, etc.) com 3 instâncias | Réplica é promovida a primário automaticamente |
| Storage | **Longhorn** com réplicas por volume (`min(3, nós)`) | Dados acessíveis a partir de outra réplica |

> **Pré-requisito de HA do control plane:** o primeiro server precisa subir com
> `--cluster-init` (etcd embutido). Isso é feito automaticamente em
> [`k3sServerScript`](../backend/src/functions/k3s.ts); sem ele o k3s usa SQLite
> e **não aceita control planes adicionais**.

## Quórum: por que 3 control planes (e não 2)

O etcd tolera a perda de `floor(N/2)` membros. Logo:

- **1** control plane → sem HA (qualquer queda derruba a API).
- **2** → não há ganho de quórum (perder 1 já quebra a maioria).
- **3** → tolera **1** queda. **5** → tolera **2**.

Por isso o `dev-cluster.sh` e a demo usam **3 servers** por padrão.

> **Endereço da API após failover:** com vários control planes você precisa de um
> ponto de entrada estável (VIP/Load Balancer) na frente das APIs. No k3d isso é
> automático (o `serverlb`); em nós bare-metal/VM provisionados por SSH, coloque
> um LB/VIP e use-o como `serverUrl` para não depender do IP de um único server.

## Roteiro automatizado (k3d)

Requisitos: `docker`, [`k3d`](https://k3d.io), `kubectl`, `curl`.

```bash
# 1) Cluster HA (3 control planes + 2 workers) + app de exemplo (3 réplicas)
./scripts/ha-failover-demo.sh up

# 2) (opcional) Postgres HA via CloudNativePG (3 instâncias)
./scripts/ha-failover-demo.sh db

# 3) Visão geral: nós, pods (com NÓ e IP) e portas dos services
./scripts/ha-failover-demo.sh status
```

Em **dois terminais**:

```bash
# Terminal A — martela a aplicação 1x/s e mostra qual pod respondeu
./scripts/ha-failover-demo.sh probe

# Terminal B — derruba um WORKER e observa a app seguir de pé no Terminal A
./scripts/ha-failover-demo.sh kill-worker
```

Resultado esperado: o `probe` segue retornando `✅ 200` (no máximo 1–2 falhas
durante o reescalonamento), agora servido pelos pods nos nós restantes.

### Failover do plano de controle

```bash
./scripts/ha-failover-demo.sh kill-server   # para 1 control plane
```

Resultado esperado: `kubectl get nodes` **continua respondendo** — os 2 servers
restantes mantêm o quórum do etcd.

### Failover do banco

```bash
kubectl --context k3d-capiva-ha get pods -l cnpg.io/cluster=pg-ha -o wide -w
./scripts/ha-failover-demo.sh kill-worker   # se o nó tinha o primário, CNPG promove uma réplica
```

O pod primário tem o label `cnpg.io/instanceRole=primary`; após a queda, esse
label migra para a réplica promovida.

### Recuperar e limpar

```bash
./scripts/ha-failover-demo.sh recover   # religa os nós parados
./scripts/ha-failover-demo.sh down      # destrói o cluster da demo
```

## Onde ver isso na plataforma (UI)

- **Monitoring** (`/platform/monitoring`): uso por nó, **saúde individual** de
  cada nó (Ready, versão do kubelet, IP e alertas como `DiskPressure`) e pods por nó.
- **Todos os pods / bancos** (`/platform/cluster-pods` e `/platform/cluster-databases`):
  nome, namespace, **nó**, fase e **portas** de cada pod; bancos agrupados por
  instância com o papel (primário/réplica) e o nó.
- **Configurações → Clusters → Nós**: cordon/remover nó, comando para juntar
  **+ control plane**/worker e **terminal SSH** no nó.

## Failover em produção (fora do k3d)

1. Provisione o cluster com **≥3 control planes** (Configurações → Clusters →
   Provisionar via SSH, marcando 3 nós como `CONTROL_PLANE`), ou use o comando
   "+ Control plane" para adicionar servers a um cluster existente.
2. Coloque um **VIP/Load Balancer** na frente das APIs dos control planes.
3. Aplicações em Produção já recebem `replicas ≥ 2`, PDB e spread automaticamente.
4. Bancos: marque **Alta Disponibilidade** ao criar (3 instâncias via operator).
