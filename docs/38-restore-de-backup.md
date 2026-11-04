# 38. Restore de backup com um clique

Cada backup concluído da lista tem um botão **Restaurar**. Para banco há dois modos;
para volume, o backup vira um volume novo. O andamento fica registrado
(`BackupRestore`) e é acompanhado na própria tela.

## Modelo de dados

Migration `20261104120000_backup_restores`:

| Campo | Para quê |
| --- | --- |
| `organizationId` | escopo multi-tenant direto (`tenantScope.backupRestore`) |
| `backupId` | backup de origem (cascade: retenção que apaga o backup apaga o histórico) |
| `kind` | `DATABASE` ou `VOLUME` (reaproveita o enum `BackupKind`) |
| `mode` | `IN_PLACE` ou `AS_COPY` (enum `RestoreMode`) |
| `status` | `PENDING` → `RUNNING` → `COMPLETED` / `FAILED` (enum `RestoreStatus`) |
| `sourceDatabaseId` / `targetDatabaseId` | banco do backup e banco que recebeu o dump |
| `volumeId` | volume do backup (restore de volume) |
| `targetName` | nome do banco de destino ou do PVC restaurado |
| `jobName` / `secretName` | Job (banco) ou Volume Longhorn (volume) acompanhado, e o Secret efêmero |
| `message`, `requestedBy`, `startedAt`, `finishedAt` | desfecho e trilha |

## Restore de banco

`POST /api/databases/:id/backups/:backupId/restore` (DEVELOPER+), corpo validado por
`schemas/restore.schema.ts`:

```jsonc
{ "mode": "IN_PLACE", "confirmName": "orders-db" }   // sobre o próprio banco
{ "mode": "AS_COPY", "newName": "orders-copia" }     // num banco novo
```

Fluxo (`DatabaseRestoreService.requestRestore`):

1. `createRestoreKindStrategy(db.kind)`: strategy por tipo de banco
   (`service/restore/restoreKind.strategy.ts`). PostgreSQL e MySQL; qualquer outro tipo
   responde **400 `RESTORE_NOT_SUPPORTED`** com o motivo.
2. Guards do backup: precisa ser do banco, `completed` e ter objeto único (`.sql.gz`,
   escopo `single`). Backup `all` (vários bancos) é recusado.
3. `createRestoreModeStrategy(mode)` (`service/restore/restoreMode.strategy.ts`):
   - `IN_PLACE`: o nome digitado tem que ser igual ao nome do banco
     (400 `RESTORE_CONFIRMATION`). Zera o destino antes de reaplicar.
   - `AS_COPY`: cria um `ManagedDatabase` novo pelo `ManagedDatabaseService.create`
     (mesmo projeto, ambiente, tipo, tamanho, HA, usuário e banco lógico; backup
     agendado desligado). Nome repetido no ambiente: 409. Não zera nada.
4. Grava `BackupRestore` (`PENDING`), monta o **Secret efêmero** com as credenciais do
   destino + S3 + `OBJECT_KEY` (mesmo builder dos backups, `service/backup/databaseSecret.ts`)
   e aplica o Job (`infra/kubernetes/restoreManifests.ts → databaseRestoreJobManifest`).
   Sucesso: `RUNNING`. Falha ao aplicar no cluster: `FAILED`, sem derrubar a API.
5. Auditoria: `database.restore` (`AuditService.fromRequest`), com modo, backup e restore.

### Comandos do Job

| Tipo | Sobre o próprio banco | Como cópia |
| --- | --- | --- |
| PostgreSQL | espera `pg_isready`, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, `mc cat … \| gunzip \| psql -v ON_ERROR_STOP=1` | espera `pg_isready`, `mc cat … \| gunzip \| psql -v ON_ERROR_STOP=1` |
| MySQL | espera `mysqladmin ping`, `DROP DATABASE`, `CREATE DATABASE IF NOT EXISTS`, `mc cat … \| gunzip \| mysql` | espera `mysqladmin ping`, `CREATE DATABASE IF NOT EXISTS`, `mc cat … \| gunzip \| mysql` |

O dump é SQL puro (`pg_dump` sem `-Fc`), por isso o restore é `psql` e não `pg_restore`.
A espera pela conexão (até 15 min) existe porque a cópia ainda está subindo no operator
quando o Job começa. O Job roda uma vez (`backoffLimit: 0`): reexecutar no modo cópia
duplicaria linhas. `activeDeadlineSeconds` vem de `CAPIVA_DB_RESTORE_DEADLINE_SECONDS`
(padrão 6 h); `ttlSecondsAfterFinished` é de 24 h para o status continuar legível.

### Andamento

- `GET /api/databases/:id/restores`: restores pedidos a partir dos backups do banco.
- `GET /api/databases/:id/restores/:restoreId`: um restore.

Cada leitura de um restore `RUNNING` consulta o Job (`interpretRestoreJob`:
`succeeded` → `COMPLETED`; `failed` ou condição `Failed` → `FAILED`; o resto continua
`RUNNING`). No desfecho o Secret efêmero é apagado. Cluster fora do ar não quebra a
leitura: devolve o último estado gravado. Sem cluster (dry-run) conclui na hora.

## Restore de volume

`POST /api/applications/:id/volumes/:volId/backups/:backupId/restore` (DEVELOPER+) →
`VolumeRestoreService`:

1. Confere que o volume é da aplicação e o backup é do volume e está `completed`.
2. Lê a URL do backup no Longhorn (`status.url` do Backup CR
   `<app>-<volume>-<id6>`, nome único em `longhornBackupNameOf`).
3. Cria **Volume Longhorn** novo com `fromBackup`, um **PV** estático (`Retain`,
   CSI `driver.longhorn.io`) e um **PVC** no namespace da aplicação, todos com o nome
   `<app>-<volume>-restore-<id6>`. O volume em uso não é tocado.
4. Andamento: `GET /api/applications/:id/volumes/:volId/restores` lê o Volume Longhorn
   (`interpretLonghornRestore`: `robustness=faulted` → `FAILED`;
   `restoreRequired=false` e `state` attached/detached → `COMPLETED`).
5. Auditoria: `volume.restore`.

Sem URL no Backup CR (backup ainda sendo enviado), o restore fica `FAILED` com
mensagem para tentar de novo.

## Frontend

- `hooks/useBackupRestores.ts`: `useDatabaseRestores` e `useVolumeRestores`
  (React Query, polling de 3 s só enquanto houver restore pendente ou executando).
- `pages/databases/components/RestoreBackupDrawer.tsx`: modal com os dois modos,
  nome do banco novo ou confirmação digitando o nome. Erro da API volta para o campo
  (`issues` do Zod e os códigos `RESTORE_CONFIRMATION`, `RESTORE_COPY_NAME`, `CONFLICT`).
- `pages/applications/components/RestoreVolumeDrawer.tsx`: confirmação do volume novo.
- `components/backups/RestoreStatusList.tsx`: lista de restaurações com status
  (Pendente, Executando, Concluído, Falhou).

## Pendências

- **Trocar o volume da aplicação pelo restaurado (com redeploy)**: hoje o PVC novo é
  criado ao lado; apontar o `Volume` da aplicação para ele e redeployar fica para depois.
- Limpeza dos PVC/PV/Volume Longhorn restaurados que não forem usados.
- Auditoria do desfecho (concluído/falhou): hoje só o pedido é auditado; o desfecho
  fica no `BackupRestore`.
- Locale português do Zod no bootstrap do backend (`z.config(z.locales.pt())` no
  preload): as mensagens do restore estão escritas à mão.
