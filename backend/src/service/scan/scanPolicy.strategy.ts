import { storedScanPolicySchema } from "@schemas/scan.schema";
import { BlockOnSeverity, type ScanPolicy, type SeverityCounts } from "@interface/scan";

/** Decide se as vulnerabilidades encontradas barram o deploy. Uma strategy por nível. */
export interface BlockStrategy {
  readonly level: BlockOnSeverity;
  /** Quantas vulnerabilidades contam para o bloqueio neste nível. */
  blockingCount(counts: SeverityCounts): number;
  isBlocked(counts: SeverityCounts): boolean;
  /** Como o nível se lê na mensagem ("crítica", "crítica ou alta"). */
  readonly rotulo: { singular: string; plural: string };
}

abstract class BaseBlockStrategy implements BlockStrategy {
  abstract readonly level: BlockOnSeverity;
  abstract readonly rotulo: { singular: string; plural: string };
  abstract blockingCount(counts: SeverityCounts): number;

  isBlocked(counts: SeverityCounts): boolean {
    return this.blockingCount(counts) > 0;
  }
}

class NoBlock extends BaseBlockStrategy {
  readonly level = BlockOnSeverity.NONE;
  readonly rotulo = { singular: "", plural: "" };
  blockingCount(): number {
    return 0;
  }
}

class BlockCritical extends BaseBlockStrategy {
  readonly level = BlockOnSeverity.CRITICAL;
  readonly rotulo = { singular: "crítica", plural: "críticas" };
  blockingCount(counts: SeverityCounts): number {
    return counts.CRITICAL;
  }
}

class BlockHigh extends BaseBlockStrategy {
  readonly level = BlockOnSeverity.HIGH;
  readonly rotulo = { singular: "crítica ou alta", plural: "críticas ou altas" };
  blockingCount(counts: SeverityCounts): number {
    return counts.CRITICAL + counts.HIGH;
  }
}

const STRATEGIES: Record<BlockOnSeverity, BlockStrategy> = {
  none: new NoBlock(),
  critical: new BlockCritical(),
  high: new BlockHigh(),
};

export const createBlockStrategy = (level?: BlockOnSeverity | null): BlockStrategy =>
  STRATEGIES[level ?? BlockOnSeverity.NONE] ?? STRATEGIES.none;

/** Política da aplicação, lida de `sourceConfig.security` com os defaults (scan ligado, sem bloqueio). */
export function readScanPolicy(sourceConfig: unknown): ScanPolicy {
  const security = (sourceConfig as { security?: unknown } | null | undefined)?.security;
  const stored = typeof security === "object" && security !== null ? security : {};
  return storedScanPolicySchema.parse(stored);
}
