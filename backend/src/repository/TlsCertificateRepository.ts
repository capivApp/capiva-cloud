import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";
import type { Prisma, TlsCertificate } from "@prisma-generated/client";

@Injectable()
export class TlsCertificateRepository extends BaseRepository {
  create(data: Prisma.TlsCertificateUncheckedCreateInput): Promise<TlsCertificate> {
    return this.tx.tlsCertificate.create({ data });
  }

  listByOrganization(organizationId: string): Promise<TlsCertificate[]> {
    return this.tx.tlsCertificate.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  findById(id: string): Promise<TlsCertificate | null> {
    return this.tx.tlsCertificate.findFirst({ where: { id, ...this.scope("tlsCertificate") } });
  }

  async delete(id: string): Promise<TlsCertificate> {
    await this.ensureScoped(() => this.findById(id), "Certificado");
    return this.tx.tlsCertificate.delete({ where: { id } });
  }
}
