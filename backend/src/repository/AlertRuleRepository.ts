import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { AlertRule, Prisma } from "@prisma-generated/client";

/** Dono da regra: o scheduler precisa do app (nome/ambiente) e da organização. */
const INCLUDE_OWNER = {
  application: {
    select: {
      id: true,
      name: true,
      environmentId: true,
      project: { select: { organizationId: true } },
    },
  },
} satisfies Prisma.AlertRuleInclude;

export type AlertRuleWithOwner = Prisma.AlertRuleGetPayload<{ include: typeof INCLUDE_OWNER }>;

/** Regras de alerta por métrica. Só acesso a dados: a avaliação vive em `AlertService`. */
@Injectable()
export class AlertRuleRepository extends BaseRepository {
  async create(data: Prisma.AlertRuleUncheckedCreateInput): Promise<AlertRule> {
    await this.ensureScoped(
      () =>
        this.tx.application.findFirst({
          where: { id: data.applicationId, ...this.scope("application") },
        }),
      "Aplicação",
    );
    return this.tx.alertRule.create({ data });
  }

  listByApplication(applicationId: string): Promise<AlertRule[]> {
    return this.tx.alertRule.findMany({
      where: { applicationId, ...this.scope("alertRule") },
      orderBy: { createdAt: "asc" },
    });
  }

  findById(id: string): Promise<AlertRule | null> {
    return this.tx.alertRule.findFirst({ where: { id, ...this.scope("alertRule") } });
  }

  async update(id: string, data: Prisma.AlertRuleUncheckedUpdateInput): Promise<AlertRule> {
    await this.ensureScoped(() => this.findById(id), "Regra de alerta");
    return this.tx.alertRule.update({ where: { id }, data });
  }

  async delete(id: string): Promise<AlertRule> {
    await this.ensureScoped(() => this.findById(id), "Regra de alerta");
    return this.tx.alertRule.delete({ where: { id } });
  }

  /**
   * Todas as regras habilitadas (scheduler da plataforma). Roda fora de tenant de
   * propósito: varre todas as organizações, como o uptime.
   */
  listEnabled(): Promise<AlertRuleWithOwner[]> {
    return this.tx.alertRule.findMany({ where: { enabled: true }, include: INCLUDE_OWNER });
  }

  /** Grava o resultado da avaliação (scheduler, sem tenant). */
  saveEvaluation(
    id: string,
    data: Pick<
      Prisma.AlertRuleUncheckedUpdateInput,
      "state" | "lastValue" | "lastEvaluatedAt" | "lastTransitionAt"
    >,
  ): Promise<AlertRule> {
    return this.tx.alertRule.update({ where: { id }, data });
  }
}
