import type { Request } from "express";
import { Injectable } from "@di/index";
import { AuditRepository } from "@repository/AuditRepository";
import { withTransaction } from "@database/withTransaction";
import { tenantOf } from "@functions/tenant";
import type { AuditLog } from "@prisma-generated/client";

export interface AuditTarget {
  targetType?: string;
  targetId?: string;
  detail?: string;
}

/**
 * Auditoria: registra ações-chave (deploy, criar/remover recursos, mudar papel,
 * criar chave...). `fromRequest` extrai org/ator/IP do request. Best-effort —
 * uma falha de auditoria nunca quebra a ação.
 */
@Injectable()
export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  list(organizationId: string, filters: { event?: string; userId?: string } = {}): Promise<AuditLog[]> {
    return withTransaction(() => this.audit.listByOrganization(organizationId, filters), { tenant: { organizationId } });
  }

  /** Registra a partir do request (org + ator + IP/UA). Não lança. */
  fromRequest(req: Request, event: string, target: AuditTarget = {}): void {
    try {
      const organizationId = tenantOf(req).organizationId;
      const isApiKey = req.auth?.sub?.startsWith("apikey:");
      void withTransaction(
        () =>
          this.audit.record({
            organizationId,
            event,
            userId: isApiKey ? null : req.auth?.sub ?? null,
            apiKeyId: isApiKey ? req.auth?.sub?.replace("apikey:", "") : null,
            targetType: target.targetType,
            targetId: target.targetId,
            detail: target.detail,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          }),
        { tenant: { organizationId } },
      ).catch(() => undefined);
    } catch {
      // Sem org no request → não audita (ex.: rotas globais).
    }
  }
}
