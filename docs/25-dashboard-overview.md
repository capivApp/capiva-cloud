# 25. Dashboard / Visão geral da organização

O `DashboardPage` mostrava só os recursos do projeto atual. Agora há uma banda org-wide com
agregações reais.

## Endpoint

`GET /api/platform/overview` (`PlatformController.overviewView` → `OverviewService`):
- `counts`: projetos, aplicações, bancos, workers, ambientes.
- `health`: aplicações por `observedStatus` (running/progressing/error/…).
- `cluster`: total/conectados, total de nós, ambientes (via `FleetService`).
- `recentDeploys`: 8 deploys mais recentes (com nome da app).
- `recentAudits`: 8 registros de auditoria recentes (via `AuditService`).

`OverviewRepository` faz as contagens/agg via join `project.organizationId` (Prisma só no
repositório), incluindo `application.groupBy(observedStatus)` e os deploys recentes.

## UI

`OverviewSection` (no topo do dashboard): cards de contagem, badges de saúde, frota e dois
painéis de atividade recente (deploys + auditoria). Sem polling (carrega via react-query).

## Verificação

`GET /platform/overview` retorna contagens/saúde coerentes com o cluster/banco.
