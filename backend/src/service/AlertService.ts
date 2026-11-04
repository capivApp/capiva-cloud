import { Injectable } from "@di/index";
import { AlertRuleRepository, type AlertRuleWithOwner } from "@repository/AlertRuleRepository";
import { PrometheusAdapter } from "@infra/observability/PrometheusAdapter";
import { LokiAdapter } from "@infra/observability/LokiAdapter";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { createAlertMetricStrategies, type AlertMetricStrategy, type AlertTarget } from "@infra/alerts/alertMetric.strategy";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { NotificationService } from "@service/NotificationService";
import { RequestsService } from "@service/RequestsService";
import { evaluateAlertRule } from "@functions/alertEvaluation";
import { buildAlertMessage } from "@functions/alertMessages";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { AlertMetric } from "@interface/alerts";
import type { CreateAlertRuleDTO, UpdateAlertRuleDTO } from "@schemas/alert.schema";
import type { AlertRule } from "@prisma-generated/client";

type Tenant = { organizationId: string };

/**
 * Alertas por métrica: CRUD das regras de uma aplicação e a avaliação periódica
 * (chamada pelo `alertScheduler`). Cada métrica é medida pela sua strategy; a
 * notificação sai só na transição de estado, pelos canais que escutam
 * `alert.triggered`/`alert.resolved`.
 */
@Injectable()
export class AlertService {
  private readonly strategies: Record<AlertMetric, AlertMetricStrategy>;

  constructor(
    private readonly rules: AlertRuleRepository,
    private readonly kube: KubeContextResolver,
    private readonly requests: RequestsService,
    private readonly notifications: NotificationService,
    prometheus: PrometheusAdapter,
    loki: LokiAdapter,
    k8s: KubernetesAdapter,
  ) {
    this.strategies = createAlertMetricStrategies({ prometheus, loki, kubernetes: k8s });
  }

  list(applicationId: string, tenant: Tenant): Promise<AlertRule[]> {
    return withTransaction(() => this.rules.listByApplication(applicationId), { tenant });
  }

  async getById(applicationId: string, id: string, tenant: Tenant): Promise<AlertRule> {
    const rule = await withTransaction(() => this.rules.findById(id), { tenant });
    if (!rule || rule.applicationId !== applicationId) throw HttpError.notFound("Regra de alerta não encontrada.");
    return rule;
  }

  async create(applicationId: string, input: CreateAlertRuleDTO, tenant: Tenant): Promise<AlertRule> {
    const rule = await withTransaction(() => this.rules.create({ applicationId, ...input }), { tenant });
    return this.getById(applicationId, rule.id, tenant);
  }

  async update(applicationId: string, id: string, input: UpdateAlertRuleDTO, tenant: Tenant): Promise<AlertRule> {
    await this.getById(applicationId, id, tenant);
    // Regra desligada volta para OK em silêncio: ao religar, se ainda estiver
    // fora do limite, o alerta dispara de novo em vez de ficar preso em FIRING.
    const reset = input.enabled === false ? { state: "OK" as const, lastValue: null } : {};
    await withTransaction(() => this.rules.update(id, { ...input, ...reset }), { tenant });
    return this.getById(applicationId, id, tenant);
  }

  async remove(applicationId: string, id: string, tenant: Tenant): Promise<void> {
    await this.getById(applicationId, id, tenant);
    await withTransaction(() => this.rules.delete(id), { tenant });
  }

  /** Avalia todas as regras habilitadas (scheduler). Devolve quantas foram avaliadas. */
  async evaluateAll(): Promise<number> {
    const rules = await withTransaction(() => this.rules.listEnabled(), {}).catch(() => [] as AlertRuleWithOwner[]);
    const targets = new Map<string, Promise<AlertTarget>>();
    const targetOf = (rule: AlertRuleWithOwner) => {
      const cached = targets.get(rule.applicationId) ?? this.resolveTarget(rule);
      targets.set(rule.applicationId, cached);
      return cached;
    };
    await Promise.all(
      rules.map((rule) => this.evaluate(rule, targetOf).catch((e) => console.error(`[alert] regra ${rule.id}:`, (e as Error).message))),
    );
    return rules.length;
  }

  private async evaluate(rule: AlertRuleWithOwner, targetOf: (rule: AlertRuleWithOwner) => Promise<AlertTarget>): Promise<void> {
    const value = await this.strategies[rule.metric].measure(await targetOf(rule), rule.windowMinutes);
    const result = evaluateAlertRule(rule, value);
    const now = new Date();

    await withTransaction(
      () =>
        this.rules.saveEvaluation(rule.id, {
          state: result.state,
          lastValue: result.value ?? rule.lastValue,
          lastEvaluatedAt: now,
          ...(result.event ? { lastTransitionAt: now } : {}),
        }),
      {},
    );

    if (!result.event || result.value === null) return;
    const message = buildAlertMessage(result.event, { app: rule.application.name, rule, value: result.value });
    await this.notifications.dispatch(rule.application.project.organizationId, message);
  }

  private async resolveTarget(rule: AlertRuleWithOwner): Promise<AlertTarget> {
    const tenant = { organizationId: rule.application.project.organizationId };
    const [ctx, host] = await Promise.all([
      this.kube.forEnvironment(rule.application.environmentId, tenant),
      this.requests.hostOf(rule.applicationId, tenant).catch(() => undefined),
    ]);
    return { app: rule.application.name, namespace: ctx.namespace, kubeconfig: ctx.kubeconfig, host };
  }
}
