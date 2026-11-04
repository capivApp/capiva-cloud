import { resolveDatabaseResources, resolveResources } from "@infra/kubernetes/profiles";
import { storageFor } from "@infra/kubernetes/databaseManifests";
import { cpuToMillicores, memoryToMib } from "@functions/quantity";

/**
 * Consumo de recursos de cluster numa unidade estável: CPU em millicores,
 * memória em MiB, nº de pods e disco em GiB. É a base comum da quota e do custo.
 */
export interface Consumo {
  cpuMillicores: number;
  memoryMib: number;
  pods: number;
  storageGi: number;
}

export type RecursoDeConsumo = keyof Consumo;

export const RECURSOS_DE_CONSUMO: readonly RecursoDeConsumo[] = [
  "cpuMillicores",
  "memoryMib",
  "pods",
  "storageGi",
];

export const CONSUMO_ZERO: Consumo = { cpuMillicores: 0, memoryMib: 0, pods: 0, storageGi: 0 };

/** Faixa de consumo: mínimo e máximo (o HPA varia as réplicas entre os dois). */
export interface FaixaDeConsumo {
  min: Consumo;
  max: Consumo;
}

export interface AplicacaoDeConsumo {
  tipo: "APPLICATION";
  profile: string;
  customResources?: Record<string, unknown> | null;
  minReplicas: number;
  maxReplicas: number;
}

export interface BancoDeConsumo {
  tipo: "DATABASE";
  kind: string;
  size: string;
  highAvailability: boolean;
}

export interface VolumeDeConsumo {
  tipo: "VOLUME";
  sizeGi: number;
}

export type RecursoMedido = AplicacaoDeConsumo | BancoDeConsumo | VolumeDeConsumo;
export type TipoDeRecurso = RecursoMedido["tipo"];

/** Réplicas fixas quando não há HPA: o mesmo default do `ApplicationReconciler`. */
export const REPLICAS_FIXAS = 2;
/** Preview por PR roda com uma réplica quando nada foi gravado. */
export const REPLICAS_DO_PREVIEW = 1;

/** Réplicas fixas da aplicação: as gravadas (tela ou capiva.json) ou o padrão. */
export const resolveReplicasFixas = (app: {
  sourceConfig?: unknown;
  previewOfId?: string | null;
}): number => {
  const replicas = (app.sourceConfig as Record<string, unknown> | null | undefined)?.replicas;
  if (typeof replicas === "number") return replicas;
  return app.previewOfId ? REPLICAS_DO_PREVIEW : REPLICAS_FIXAS;
};

export const resolveReplicasDaAplicacao = (
  scaling: { minReplicas: number; maxReplicas: number } | null | undefined,
  fixas = REPLICAS_FIXAS,
): { min: number; max: number } => {
  if (!scaling) return { min: fixas, max: fixas };
  return { min: scaling.minReplicas, max: Math.max(scaling.minReplicas, scaling.maxReplicas) };
};

/** Instâncias do banco com HA; os operators sobem 3, o MinIO sobe 4 servidores. */
const INSTANCIAS_HA_POR_KIND: Record<string, number> = { MINIO: 4 };
const INSTANCIAS_HA_PADRAO = 3;

const resolveInstanciasDoBanco = (banco: BancoDeConsumo): number => {
  if (!banco.highAvailability) return 1;
  return INSTANCIAS_HA_POR_KIND[banco.kind] ?? INSTANCIAS_HA_PADRAO;
};

const gibOf = (quantity: string): number => Math.round(memoryToMib(quantity) / 1024);

const buildConsumoPorPod = (recursos: { cpu: string; memory: string }, storageGi = 0): Consumo => ({
  cpuMillicores: cpuToMillicores(recursos.cpu),
  memoryMib: memoryToMib(recursos.memory),
  pods: 1,
  storageGi,
});

export const multiplyConsumo = (consumo: Consumo, fator: number): Consumo => ({
  cpuMillicores: consumo.cpuMillicores * fator,
  memoryMib: consumo.memoryMib * fator,
  pods: consumo.pods * fator,
  storageGi: consumo.storageGi * fator,
});

export const sumConsumo = (consumos: Consumo[]): Consumo =>
  consumos.reduce(
    (total, c) => ({
      cpuMillicores: total.cpuMillicores + c.cpuMillicores,
      memoryMib: total.memoryMib + c.memoryMib,
      pods: total.pods + c.pods,
      storageGi: total.storageGi + c.storageGi,
    }),
    CONSUMO_ZERO,
  );

export const subtractConsumo = (de: Consumo, menos: Consumo): Consumo => ({
  cpuMillicores: Math.max(0, de.cpuMillicores - menos.cpuMillicores),
  memoryMib: Math.max(0, de.memoryMib - menos.memoryMib),
  pods: Math.max(0, de.pods - menos.pods),
  storageGi: Math.max(0, de.storageGi - menos.storageGi),
});

/** Strategy por tipo de recurso: como cada um vira faixa de consumo. */
interface ConsumoStrategy<T extends RecursoMedido> {
  buildFaixa(recurso: T): FaixaDeConsumo;
}

const aplicacaoStrategy: ConsumoStrategy<AplicacaoDeConsumo> = {
  buildFaixa: (app) => {
    const porPod = buildConsumoPorPod(resolveResources(app.profile, app.customResources));
    return {
      min: multiplyConsumo(porPod, app.minReplicas),
      max: multiplyConsumo(porPod, Math.max(app.minReplicas, app.maxReplicas)),
    };
  },
};

const bancoStrategy: ConsumoStrategy<BancoDeConsumo> = {
  buildFaixa: (banco) => {
    const porInstancia = buildConsumoPorPod(
      resolveDatabaseResources(banco.size),
      gibOf(storageFor(banco.size)),
    );
    const total = multiplyConsumo(porInstancia, resolveInstanciasDoBanco(banco));
    return { min: total, max: total };
  },
};

const volumeStrategy: ConsumoStrategy<VolumeDeConsumo> = {
  buildFaixa: (volume) => {
    const total = { ...CONSUMO_ZERO, storageGi: volume.sizeGi };
    return { min: total, max: total };
  },
};

const CONSUMO_STRATEGIES: {
  [K in TipoDeRecurso]: ConsumoStrategy<Extract<RecursoMedido, { tipo: K }>>;
} = {
  APPLICATION: aplicacaoStrategy,
  DATABASE: bancoStrategy,
  VOLUME: volumeStrategy,
};

export const buildFaixaDeConsumo = (recurso: RecursoMedido): FaixaDeConsumo =>
  (CONSUMO_STRATEGIES[recurso.tipo] as ConsumoStrategy<RecursoMedido>).buildFaixa(recurso);
