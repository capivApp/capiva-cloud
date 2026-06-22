# 24. Autoscaling (HPA) — aplicação, observabilidade e escala manual

`hpaManifest` e o modelo `ScalingPolicy` já existiam, mas o HPA **não era aplicado** e não
havia endpoint/UI. Agora a política é aplicada, o estado vivo é observável e há escala manual.

## Endpoints (`/api/applications/:id`)

| Método | Rota                  | Descrição                                  |
|--------|-----------------------|--------------------------------------------|
| GET    | `/scaling`            | Política atual (ou `null`).                |
| PUT    | `/scaling`            | Define/atualiza (min/max/métrica/alvo) + aplica HPA. |
| DELETE | `/scaling`            | Desativa: remove política + HPA, reconcilia. |
| POST   | `/scaling/replicas`   | Escala manual (`{ replicas }`).            |
| GET    | `/scaling/status`     | Estado vivo (JSON pontual).                |

SSE: `GET /api/streams/applications/:id/scaling` (evento `scaling`) — usado pela UI para
observabilidade ao vivo (sem polling).

## Comportamento (`ScalingService` + reconciler)

- **Aplicação**: ao salvar a política, `ApplicationService.reconcile` carrega a
  `ScalingPolicy` e o `ApplicationReconciler` aplica o `HorizontalPodAutoscaler`. Quando há
  HPA, o Deployment é aplicado **sem `spec.replicas`** (`deploymentManifest(base, null)`) —
  o HPA passa a ser o dono das réplicas, evitando conflito de server-side apply.
- **Escopo**: HPA só para estratégia `ROLLING` (alvo Deployment). CPU/MEMORY usam Resource
  utilization (metrics-server); REQUESTS usa métrica de Pods `http_requests_per_second`
  (requer prometheus-adapter).
- **Observabilidade** (`getHpaStatus`): lê o HPA e expõe réplicas atuais/desejadas, min/max,
  métrica, valor atual vs. alvo, `lastScaleTime` e condições — exatamente o que dispara o
  scale up/down.
- **Escala manual** (`scaleDeployment`): ajusta `spec.replicas` do Deployment. Se houver HPA
  ativo, o autoscaler pode sobrescrever — a UI avisa e oferece "Desativar".

## UI

Aba **Autoscaling**: cards ao vivo (réplicas atuais/desejadas/min-max/métrica + valor-vs-alvo
via SSE), controle manual `+/−` de réplicas, e formulário da política (min/max/métrica/alvo)
com "Desativar".

## Verificação (k3d real)

Definir min/max → `kubectl get hpa <app>` existe e escala sob carga; a UI reflete réplicas e
a métrica/alvo; `+/−` altera o Deployment e o `status` reflete os novos valores.
