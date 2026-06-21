import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { ClusterProvisionerService } from "@service/ClusterProvisionerService";
import { HttpError } from "@functions/HttpError";

@Injectable()
export class ClusterCallbackController {
  constructor(private readonly provisioner: ClusterProvisionerService) {}

  /** Callback do nó k3s (modo copy-paste) → auto-registro do cluster. */
  handle = async (req: Request, res: Response): Promise<void> => {
    const { registrationToken, serverUrl, nodeToken, kubeconfig } = req.body ?? {};
    if (!registrationToken || !serverUrl || !nodeToken || !kubeconfig) {
      throw HttpError.badRequest("Payload de registro incompleto.");
    }
    await this.provisioner.handleCallback({ registrationToken, serverUrl, nodeToken, kubeconfig });
    res.json({ ok: true });
  };
}
