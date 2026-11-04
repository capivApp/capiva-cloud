import { estimateCustoDoRecurso, sumFaixasDeCusto, type FaixaDeCusto, type TabelaDePrecos } from "@functions/finops/custo";
import {
  toRecursoDaAplicacao,
  toRecursoDoBanco,
  toRecursoDoVolume,
  type AplicacaoInventario,
  type Inventario,
} from "@functions/finops/inventario";

export interface ItemDeCusto {
  id: string;
  name: string;
  projectId: string;
  environmentId: string;
  custo: FaixaDeCusto;
}

export interface GrupoDeCusto {
  id: string;
  name: string;
  custo: FaixaDeCusto;
}

export interface RelatorioDeCusto {
  currency: string;
  precos: TabelaDePrecos;
  /** Custo mensal estimado da organização: mínimo e máximo do HPA. */
  total: FaixaDeCusto;
  /** Aplicações com os volumes delas somados. */
  aplicacoes: ItemDeCusto[];
  bancos: ItemDeCusto[];
  projetos: GrupoDeCusto[];
  ambientes: GrupoDeCusto[];
}

const estimateCustoDaAplicacao = (app: AplicacaoInventario, precos: TabelaDePrecos): FaixaDeCusto =>
  sumFaixasDeCusto([
    estimateCustoDoRecurso(toRecursoDaAplicacao(app), precos),
    ...app.volumes.map((volume) => estimateCustoDoRecurso(toRecursoDoVolume(volume), precos)),
  ]);

const groupCusto = (itens: ItemDeCusto[], grupos: { id: string; name: string }[], chave: "projectId" | "environmentId"): GrupoDeCusto[] =>
  grupos.map((grupo) => ({
    id: grupo.id,
    name: grupo.name,
    custo: sumFaixasDeCusto(itens.filter((item) => item[chave] === grupo.id).map((item) => item.custo)),
  }));

/** Custo estimado do inventário, agregado por aplicação, banco, projeto e ambiente. */
export const buildRelatorioDeCusto = (
  inventario: Inventario,
  precos: TabelaDePrecos,
  nomes: { projetos: { id: string; name: string }[]; ambientes: { id: string; name: string }[] },
): RelatorioDeCusto => {
  const toItem = (recurso: Omit<ItemDeCusto, "custo">, custo: FaixaDeCusto): ItemDeCusto => ({
    id: recurso.id,
    name: recurso.name,
    projectId: recurso.projectId,
    environmentId: recurso.environmentId,
    custo,
  });
  const aplicacoes = inventario.aplicacoes.map((app) => toItem(app, estimateCustoDaAplicacao(app, precos)));
  const bancos = inventario.bancos.map((banco) => toItem(banco, estimateCustoDoRecurso(toRecursoDoBanco(banco), precos)));
  const itens = [...aplicacoes, ...bancos];

  return {
    currency: precos.currency,
    precos,
    total: sumFaixasDeCusto(itens.map((item) => item.custo)),
    aplicacoes,
    bancos,
    projetos: groupCusto(itens, nomes.projetos, "projectId"),
    ambientes: groupCusto(itens, nomes.ambientes, "environmentId"),
  };
};
