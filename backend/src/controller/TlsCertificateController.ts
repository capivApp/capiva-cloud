import type { Request, Response } from "express";
import { Injectable } from "@di/index";
import { TlsCertificateService } from "@service/TlsCertificateService";
import { createTlsCertificateSchema } from "@schemas/tls.schema";
import { tenantOf } from "@functions/tenant";

@Injectable()
export class TlsCertificateController {
  constructor(private readonly certs: TlsCertificateService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const list = await this.certs.list(tenantOf(req).organizationId);
    // Nunca expõe o material cifrado do certificado.
    res.json(list.map(({ certCipher, keyCipher, ...rest }) => rest));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const dto = createTlsCertificateSchema.parse(req.body);
    const { certCipher, keyCipher, ...rest } = await this.certs.create(tenantOf(req).organizationId, dto);
    res.status(201).json(rest);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.certs.remove(tenantOf(req).organizationId, String(req.params.id));
    res.status(204).end();
  };
}
