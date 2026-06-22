import { Injectable } from "@di/index";
import { TlsCertificateRepository } from "@repository/TlsCertificateRepository";
import { withTransaction } from "@database/withTransaction";
import { encrypt, decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { TlsCertificate } from "@prisma-generated/client";

export interface CreateTlsCertificateInput {
  name: string;
  cert: string;
  key: string;
}

/** Certificado decifrado (PEM cert+key) para montar o Secret tls no cluster. */
export interface DecryptedCertificate {
  cert: string;
  key: string;
}

/**
 * Certificados TLS da organização (vários). cert/key PEM são cifrados em
 * repouso (AES-256-GCM). O painel só mostra metadados, nunca o material.
 */
@Injectable()
export class TlsCertificateService {
  constructor(private readonly certs: TlsCertificateRepository) {}

  list(organizationId: string): Promise<TlsCertificate[]> {
    return withTransaction(() => this.certs.listByOrganization(organizationId), { tenant: { organizationId } });
  }

  create(organizationId: string, input: CreateTlsCertificateInput): Promise<TlsCertificate> {
    return withTransaction(
      () =>
        this.certs.create({
          organizationId,
          name: input.name,
          certCipher: encrypt(input.cert),
          keyCipher: encrypt(input.key),
        }),
      { tenant: { organizationId } },
    );
  }

  async getById(organizationId: string, id: string): Promise<TlsCertificate> {
    const cert = await withTransaction(() => this.certs.findById(id), { tenant: { organizationId } });
    if (!cert || cert.organizationId !== organizationId) throw HttpError.notFound("Certificado não encontrado.");
    return cert;
  }

  /** Decifra o material do certificado (usado pelo reconciler ao montar o Secret). */
  async decrypted(organizationId: string, id: string): Promise<DecryptedCertificate> {
    const cert = await this.getById(organizationId, id);
    return { cert: decrypt(cert.certCipher), key: decrypt(cert.keyCipher) };
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await withTransaction(() => this.certs.delete(id), { tenant: { organizationId } });
  }
}
