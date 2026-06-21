import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { GitService } from "@service/GitService";

@Injectable()
export class WebhookController {
  constructor(private readonly git: GitService) {}

  /** Recebe webhooks Git (push/PR/MR). Corpo cru para validar a assinatura. */
  handle = async (req: Request, res: Response): Promise<void> => {
    const signature =
      (req.headers["x-hub-signature-256"] as string) || // GitHub/Gitea
      (req.headers["x-gitlab-token"] as string); // GitLab
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const result = await this.git.handleWebhook(String(req.params.connectionId), signature, raw);
    res.json({ ok: true, ...result });
  };
}
