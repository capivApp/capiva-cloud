import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { QuotaService } from "@service/QuotaService";
import { CostService } from "@service/CostService";
import { estimateAplicacaoSchema, setQuotaSchema } from "@schemas/finops.schema";
import { tenantOf } from "@functions/tenant";

/** Quotas do ambiente e custo estimado. Controller fino: valida e delega. */
@Injectable()
export class FinOpsController {
  constructor(
    private readonly quotas: QuotaService,
    private readonly costs: CostService,
  ) {}

  getQuota = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.quotas.getByEnvironment(String(req.params.id), tenantOf(req)));
  };

  setQuota = async (req: Request, res: Response): Promise<void> => {
    const dto = setQuotaSchema.parse(req.body ?? {});
    res.json(await this.quotas.setQuota(String(req.params.id), dto, tenantOf(req)));
  };

  getCosts = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.costs.forOrganization(tenantOf(req)));
  };

  estimateAplicacao = async (req: Request, res: Response): Promise<void> => {
    res.json(this.costs.estimateAplicacao(estimateAplicacaoSchema.parse(req.query)));
  };
}
