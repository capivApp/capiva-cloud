# 40. Scan de vulnerabilidade da imagem (Trivy)

Todo deploy passa a escanear a imagem com o [Trivy](https://trivy.dev) **antes** de
colocá-la no ar. O resultado vira um selo na lista de deploys, um detalhe com as
principais CVEs e, se a política da aplicação mandar, bloqueia o deploy.

## Fluxo

```
Build iniciado ─► Imagem publicada ─► Scan de vulnerabilidades ─► Deploy iniciado ─► Health
                                         │
                                         ├─ PASSED  → segue
                                         ├─ ERROR   → segue (aviso na timeline)
                                         └─ BLOCKED → deploy falha (ImageScanBlockedError)
```

1. `DeploymentService.run` chama um único passo isolado logo depois de
   "Imagem publicada": `ImageScanService.guard({ deploymentId, app, imageRef, ctx, tenant })`.
   `imageRef` é a imagem devolvida pelo build (Kaniko) ou a imagem escolhida
   (origem `DOCKER_IMAGE`).
2. `ImageScanService` lê a política (`sourceConfig.security`), resolve as
   credenciais do registry e chama o `TrivyScanner`.
3. `TrivyScanner` (infra) aplica um Job no namespace do ambiente, espera
   terminar, lê o log do pod (`KubernetesAdapter.podLogsByLabel`) e entrega o
   resumo (`parseTrivyReport`).
4. O resumo é gravado em `Deployment.scanSummary` e a mensagem entra na timeline
   (`DeploymentEvent.label`; o motivo técnico de falha do scanner vai em `detail`).
5. Se o status for `BLOCKED`, o passo lança `ImageScanBlockedError` e o deploy
   cai no caminho normal de falha (`fail()`: evento "Deploy falhou" e notificação).

## Job do Trivy

Arquivo: `backend/src/infra/security/trivyJob.ts`.

- Imagem oficial em versão fixa: `aquasec/trivy:0.58.1` (`TRIVY_IMAGE`). Nunca
  `latest`. Atualize de propósito, conferindo o changelog.
- `trivy image --scanners vuln --format json --exit-code 0`: encontrar
  vulnerabilidade não é falha do Job; quem decide bloquear é a política.
- A imagem chega por env `SCAN_IMAGE`, nunca interpolada no script do shell.
- O JSON sai numa linha só entre os marcadores `<<<CAPIVA_TRIVY_REPORT` e
  `CAPIVA_TRIVY_REPORT>>>`, porque o log do pod mistura o stderr do Trivy
  (download do banco de CVEs, avisos) com o relatório.
- Rótulos `capiva.cloud/deployment=<id>` e `capiva.cloud/scan-job=<job>`;
  `backoffLimit: 0`, `activeDeadlineSeconds` = timeout + 300 s,
  `ttlSecondsAfterFinished: 600`.
- Registry privado: Secret efêmero `scan-<deploymentId>-auth` (Opaque, com
  `TRIVY_USERNAME`/`TRIVY_PASSWORD`) consumido por `envFrom` e removido ao fim.
  As credenciais são as mesmas do imagePullSecret do deploy: registry explícito
  da app (`app.registryId`) ou o registry padrão da organização.
- Registry HTTP ou sem TLS válido (`insecure`): `TRIVY_INSECURE=true`.

### Variáveis de ambiente (backend)

| Variável | Default | Uso |
| --- | --- | --- |
| `CAPIVA_TRIVY_IMAGE` | `aquasec/trivy:0.58.1` | Mirror interno da mesma versão |
| `CAPIVA_SCAN_TIMEOUT_SECONDS` | `600` | `--timeout` do Trivy (o Job tem +300 s de folga) |
| `CAPIVA_SCAN_CPU_REQUEST` / `CAPIVA_SCAN_CPU_LIMIT` | `100m` / `1` | Recursos do Job |
| `CAPIVA_SCAN_MEMORY_REQUEST` / `CAPIVA_SCAN_MEMORY_LIMIT` | `256Mi` / `2Gi` | O banco de CVEs em memória passa de 500 MiB |

## Política por aplicação

Gravada em `Application.sourceConfig.security` (sem coluna nova):

```json
{ "security": { "scanEnabled": true, "blockOnSeverity": "none" } }
```

| Campo | Valores | Default |
| --- | --- | --- |
| `scanEnabled` | `true` / `false` | `true` |
| `blockOnSeverity` | `none`, `critical`, `high` | `none` |

Strategy por nível em `backend/src/service/scan/scanPolicy.strategy.ts`:
`none` nunca bloqueia, `critical` bloqueia com CRITICAL > 0, `high` com
CRITICAL + HIGH > 0. Valor inválido já gravado volta ao default do campo
(`storedScanPolicySchema`), sem derrubar o deploy.

Endpoint: `PUT /api/applications/:id/security` (DEVELOPER+), corpo validado por
`scanPolicySchema`, auditado como `application.security.update`. Documentado no
OpenAPI.

**Falha do próprio scanner nunca bloqueia**: timeout, registry inacessível, Job
com erro, log sem relatório ou cluster em modo de simulação (sem kubeconfig)
geram `status: "ERROR"`, uma linha de aviso na timeline e o deploy segue.

## Resumo persistido (`Deployment.scanSummary`)

Migration `20261104120000_deployment_scan_summary` (`JSONB`, opcional). Deploys
sem scan (antigos, rollback, scan desligado) ficam com `null`.

```json
{
  "status": "PASSED | BLOCKED | ERROR",
  "counts": { "CRITICAL": 2, "HIGH": 4, "MEDIUM": 3, "LOW": 1, "UNKNOWN": 0 },
  "total": 10,
  "topVulnerabilities": [
    { "id": "CVE-2024-5535", "pkgName": "libcrypto3", "installedVersion": "3.1.4-r5",
      "fixedVersion": "3.1.6-r0", "severity": "CRITICAL", "title": "...", "url": "...", "target": "..." }
  ],
  "scanner": "trivy",
  "scannerImage": "aquasec/trivy:0.58.1",
  "imageRef": "registry.local:5000/api:1.4.0",
  "scannedAt": "2026-11-04T14:02:11.000Z",
  "blockOnSeverity": "none",
  "message": "Scan concluído: 2 críticas, 4 altas, 3 médias, 1 baixa.",
  "error": "só quando status = ERROR"
}
```

- Contagem deduplicada por CVE + pacote + versão (o mesmo pacote em dois
  `package-lock.json` conta uma vez).
- `topVulnerabilities`: as 10 principais, por severidade e depois pelo id em
  ordem numérica. `fixedVersion: null` quando não há correção publicada.
- Sai em `GET /applications/:id/deployments` e em `GET /platform/releases`
  (`recent[].scanSummary`).

## Frontend

- `components/scan/VulnerabilityBadge.tsx`: selo por status (strategy map):
  sem vulnerabilidades, contagem com a pior severidade, bloqueado, scan não concluído.
- `components/scan/DeploymentScanBadge.tsx`: selo clicável na lista de deploys da
  aplicação e na página Deploys; abre o drawer com `ScanDetails` (contagem por
  severidade e principais CVEs com versão instalada e corrigida).
- `components/scan/ScanPolicyCard.tsx` + `hooks/useScanPolicy.ts`: política na aba
  Configurações da aplicação.

## Testes

`backend/src/__tests__/`:

- `trivyReport.test.ts`: parser com fixture real de `trivy image --format json`
  (`fixtures/trivy-image-report.json`), extração do log por marcadores.
- `scanPolicy.test.ts`: leitura da política, strategies de bloqueio, resumo e mensagens.
- `trivyJob.test.ts`: manifest do Job e do Secret, orquestração do `TrivyScanner`
  com `KubernetesAdapter` mockado (sucesso, falha, timeout, log sem relatório, simulação).

## Limites conhecidos

- Cada Job baixa o banco de CVEs (cerca de 60 MB) do zero. Um cache
  compartilhado (PVC ou servidor Trivy) fica para depois.
- Deploy bloqueado passa pelo `fail()` comum, que também tenta o rollback
  automático para o último deploy saudável. Como a imagem bloqueada nunca subiu,
  esse rollback reaplica a versão que já está no ar.
