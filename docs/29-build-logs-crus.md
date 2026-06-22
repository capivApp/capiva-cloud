# 29. Logs crus de build (Kaniko) em tempo real

Antes só havia a timeline de eventos do deploy. Agora os logs crus do Job de build (Kaniko)
são transmitidos ao vivo.

## Mudança importante

O `built.manifest` (Job de build) **não era aplicado** — builds por código não rodavam.
Agora o `DeploymentService.run` aplica o Job quando a estratégia retorna um manifest, e o
Job é nomeado/rotulado por deploy:
- nome `build-<deploymentId>`;
- labels `capiva.cloud/build=kaniko`, `app.kubernetes.io/name=<app>`,
  `capiva.cloud/deployment=<deploymentId>` (no Job e no pod template).

## Logs

- `KubernetesAdapter.podLogsByLabel(ctx, labelSelector, tailLines)`: lê o log do primeiro
  pod do selector (`readNamespacedPodLog`).
- `DeploymentService.buildLogs(deploymentId, tenant)`: resolve o ctx do ambiente e lê os
  logs do pod com `capiva.cloud/deployment=<id>`.
- SSE: `GET /api/streams/deployments/:deploymentId/build-logs` (evento `build`), faz polling
  a cada 2s e encerra quando o deploy sai da fase de build (status ≠ QUEUED/BUILDING/PUSHING).

## UI

No detalhe da app (aba Deploys), um painel "Logs de build (Kaniko)" mostra o stream ao vivo
do build mais recente (ao lado da barra de progresso).

## Verificação

Disparar um deploy de origem por código → o painel mostra a saída do Kaniko em tempo real.
