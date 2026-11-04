import {
  buildFaixaDeConsumo,
  resolveReplicasDaAplicacao,
  resolveReplicasFixas,
  sumConsumo,
  type AplicacaoDeConsumo,
  type BancoDeConsumo,
  type Consumo,
  type RecursoMedido,
  type VolumeDeConsumo,
} from "@functions/finops/consumo";

/** Recursos que consomem cluster, como saem do banco (forma neutra, sem Prisma). */
export interface AplicacaoInventario {
  id: string;
  name: string;
  projectId: string;
  environmentId: string;
  profile: string;
  customResources: unknown;
  scaling: { minReplicas: number; maxReplicas: number } | null;
  /** `sourceConfig.replicas` vale como réplicas fixas quando não há HPA. */
  sourceConfig?: unknown;
  previewOfId?: string | null;
  volumes: { id: string; name: string; sizeGi: number }[];
}

export interface BancoInventario {
  id: string;
  name: string;
  projectId: string;
  environmentId: string;
  kind: string;
  size: string;
  highAvailability: boolean;
}

export interface Inventario {
  aplicacoes: AplicacaoInventario[];
  bancos: BancoInventario[];
}

export type RecursoDaAplicacaoInput = Pick<AplicacaoInventario, "profile" | "customResources" | "scaling" | "sourceConfig" | "previewOfId">;

export const toRecursoDaAplicacao = (app: RecursoDaAplicacaoInput): AplicacaoDeConsumo => {
  const replicas = resolveReplicasDaAplicacao(app.scaling, resolveReplicasFixas(app));
  return {
    tipo: "APPLICATION",
    profile: app.profile,
    customResources: (app.customResources as Record<string, unknown> | null) ?? null,
    minReplicas: replicas.min,
    maxReplicas: replicas.max,
  };
};

export const toRecursoDoBanco = (banco: Pick<BancoInventario, "kind" | "size" | "highAvailability">): BancoDeConsumo => ({
  tipo: "DATABASE",
  kind: banco.kind,
  size: banco.size,
  highAvailability: banco.highAvailability,
});

export const toRecursoDoVolume = (volume: { sizeGi: number }): VolumeDeConsumo => ({ tipo: "VOLUME", sizeGi: volume.sizeGi });

export const listRecursosMedidos = (inventario: Inventario): RecursoMedido[] => [
  ...inventario.aplicacoes.flatMap((app) => [toRecursoDaAplicacao(app), ...app.volumes.map(toRecursoDoVolume)]),
  ...inventario.bancos.map(toRecursoDoBanco),
];

/** Pico de consumo de um conjunto de recursos: é o que a quota precisa comportar. */
export const buildConsumoMaximo = (recursos: RecursoMedido[]): Consumo =>
  sumConsumo(recursos.map((recurso) => buildFaixaDeConsumo(recurso).max));

/** Uso que a quota considera: réplicas máximas do HPA (ou as fixas gravadas), volumes e bancos. */
export const buildUsoDoInventario = (inventario: Inventario): Consumo => buildConsumoMaximo(listRecursosMedidos(inventario));
