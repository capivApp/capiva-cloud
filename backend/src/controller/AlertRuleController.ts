import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { AlertService } from "@service/AlertService";
import { createAlertRuleSchema, updateAlertRuleSchema } from "@schemas/alert.schema";
import { tenantOf } from "@functions/tenant";

/** Regras de alerta por métrica de uma aplicação (/applications/:id/alert-rules). */
@Injectable()
export class AlertRuleController {
  constructor(private readonly alerts: AlertService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.alerts.list(String(req.params.id), tenantOf(req)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createAlertRuleSchema.parse(req.body);
    res.status(201).json(await this.alerts.create(String(req.params.id), dto, tenantOf(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const dto = updateAlertRuleSchema.parse(req.body);
    res.json(await this.alerts.update(String(req.params.id), String(req.params.ruleId), dto, tenantOf(req)));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.alerts.remove(String(req.params.id), String(req.params.ruleId), tenantOf(req));
    res.status(204).end();
  };
}
