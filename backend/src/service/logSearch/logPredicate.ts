import type { LogFiltros, LogLine } from "@interface/logs";
import { buildLevelPattern } from "@service/logSearch/logLevel.strategy";

type LinePredicate = (line: LogLine) => boolean;

/**
 * Os mesmos filtros do LogQL aplicados em memória. Usado pela fonte simulada (sem
 * Loki), para a tela filtrar igual com ou sem a stack de observabilidade.
 */
const PREDICATES: Array<(filtros: LogFiltros) => LinePredicate | undefined> = [
  ({ contains }) => (contains ? (l) => l.line.includes(contains) : undefined),
  ({ notContains }) => (notContains ? (l) => !l.line.includes(notContains) : undefined),
  ({ regex }) => {
    if (!regex) return undefined;
    const compiled = new RegExp(regex);
    return (l) => compiled.test(l.line);
  },
  ({ levels }) => {
    if (!levels?.length) return undefined;
    const compiled = new RegExp(buildLevelPattern(levels));
    return (l) => compiled.test(l.line);
  },
  ({ pod }) => (pod ? (l) => !l.pod || l.pod === pod : undefined),
];

export const buildLogPredicate = (filtros: LogFiltros): LinePredicate => {
  const active = PREDICATES.map((build) => build(filtros)).filter((p): p is LinePredicate => Boolean(p));
  return (line) => active.every((predicate) => predicate(line));
};
