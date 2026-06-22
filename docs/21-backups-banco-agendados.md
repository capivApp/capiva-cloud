# 21. Backups de Banco — agendados (cron) + restore

Antes, `DatabaseConfig.backup.schedule` era armazenado mas **nunca executado**, e não
havia restore. Agora a plataforma executa os backups conforme o cron de cada banco,
aplica retenção e permite restaurar um backup concluído.

## Scheduler

`startDatabaseBackupScheduler()` (em `src/index.ts`) roda no processo da API, no mesmo
estilo do `uptimeScheduler` (sem cron externo). Tica a cada **30s** e chama
`DatabaseBackupService.runScheduledBackups()`, que:

1. lista todos os bancos (`ManagedDatabaseRepository.listAllWithOrg` — resolve a org pelo
   projeto, pois o scheduler roda sem tenant);
2. para cada banco PostgreSQL/MySQL com `backup.enabled`, avalia o cron
   (`infra/scheduler/cron.ts` → `cronMatches`, horário local do servidor);
3. **dedupe**: pula se já houver backup do banco iniciado no mesmo minuto;
4. dispara `create({ scope: "single" })` e aplica retenção.

O matcher de cron suporta `*`, listas, intervalos e passos em 5 campos
(min hora dia-mês mês dia-semana). Expressões inválidas são rejeitadas no schema
(`resource.schema.ts` → `cronExpression`) e ignoradas pelo scheduler (não o derrubam).

## Carimbo determinístico (habilita restore)

O backend gera o `BACKUP_STAMP` (`YYYYMMDD-HHMMSS`, UTC) e o passa ao Job; o comando de
dump usa `${BACKUP_STAMP:-$(date ...)}`. Assim o objeto no S3 é **conhecido** e gravado em
`Backup.destination` (para `scope=single`: `<banco>/single/<db>-<stamp>.sql.gz`). Para
`scope=all` registra-se apenas o prefixo (múltiplos objetos; restore indisponível).

## Restore

`POST /api/databases/:id/backups/:backupId/restore` (DEVELOPER+) →
`DatabaseBackupService.restore`: valida que o backup está `completed` e tem objeto
`.sql.gz`, monta um Secret com credenciais de origem (DB) + destino (S3) + `OBJECT_KEY`, e
dispara um Job que faz `mc cat … | gunzip | psql/mysql`. **Operação destrutiva** (sobrescreve
o banco). A UI confirma em dois cliques (sem alert nativo).

## Retenção

Após cada backup agendado, `applyRetention`:
- remove registros `Backup` mais antigos que `retentionDays` (`BackupRepository.deleteOlderThan`);
- dispara um Job best-effort `mc rm --recursive --force --older-than <N>d` no prefixo do banco.

## Limitação conhecida

"Incremental" é tratado como **dump lógico full** (decisão registrada). Incremental real
(WAL archiving / pgBackRest) é um item maior, fora deste escopo.

## Verificação (k3d real)

Habilitar um cron curto → o scheduler dispara o Job → registro `completed` + objeto no
MinIO; `POST …/restore` recria os dados.
