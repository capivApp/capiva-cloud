# 28. Métricas de disco e rede (cluster)

O monitoring cobria CPU/memória (metrics-server). Disco e rede não existem no metrics-server,
então vêm do **Prometheus** (node_exporter), de forma agregada por cluster e best-effort.

## Backend

`MonitoringService.forCluster` agora também consulta o `PrometheusAdapter`:
- `diskUsedPct`: uso do filesystem raiz agregado.
- `netRxBps` / `netTxBps`: taxa de rede agregada (exclui loopback/veth/cni/flannel).

As queries PromQL ficam encapsuladas no service; o `PrometheusAdapter.instant` retorna `null`
sem `PROMETHEUS_URL` — os campos saem `null` e a UI mostra "—" (degrada com elegância).

`ClusterMonitoring.totals` ganhou `diskUsedPct`, `netRxBps`, `netTxBps` (todos `number | null`).

## UI

`MonitoringPage`: cards "Disco" (%) e "Rede" (↓rx ↑tx) ao lado de CPU/Memória.

## App health

A saúde da aplicação já é refletida pelo `observedStatus` (running/progressing/error) e pelo
`readinessProbe` (health check configurável — ver doc 26), além da saúde agregada no dashboard
(doc 25). Disco/rede por-pod (mapeamento por label de instância) fica como evolução futura —
requer mapear `instance` do node_exporter ao nó, específico do cluster.

## Verificação

Com `PROMETHEUS_URL` apontando para o Prometheus do cluster, os cards de Disco/Rede populam;
sem ele, mostram "—" sem erro.
