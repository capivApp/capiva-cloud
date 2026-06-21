import type {
  Application,
  ResourceProfileKind,
  RolloutStrategy,
  SourceKind,
  TlsMode,
} from "@prisma-generated/client";
import type { Prisma } from "@prisma-generated/client";

/** Model de Aplicação — implementa o tipo gerado pelo Prisma. */
export class ApplicationModel implements Application {
  id!: string;
  projectId!: string;
  environmentId!: string;
  name!: string;
  source!: SourceKind;
  sourceConfig!: Prisma.JsonValue;
  tags!: Prisma.JsonValue;
  gitConnectionId!: string | null;
  profile!: ResourceProfileKind;
  customResources!: Prisma.JsonValue;
  rolloutStrategy!: RolloutStrategy;
  rolloutConfig!: Prisma.JsonValue;
  port!: number | null;
  tlsMode!: TlsMode;
  tlsCertificateId!: string | null;
  registryId!: string | null;
  desiredStatus!: string;
  observedStatus!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
