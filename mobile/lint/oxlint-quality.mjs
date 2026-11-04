// CÓPIA de `@qualitysistemas/bun-commons/src/oxlint/quality.mjs` (o mobile não depende do
// bun-commons). Mudou lá, mude aqui.
/**
 * Plugin de lint da casa para o oxlint (`jsPlugins`), no formato de plugin do ESLint.
 *
 * `.mjs` de propósito: o oxlint carrega o plugin no runtime que estiver disponível (Bun, ou
 * Node) e nem todo Node lê `.ts`. Sem dependências: o que a regra precisa é só o AST.
 *
 * Uso na `.oxlintrc.json` do projeto:
 *   "jsPlugins": [{ "name": "quality", "specifier": "@qualitysistemas/bun-commons/oxlint" }],
 *   "rules": { "quality/no-enum": "error" }
 */

/**
 * `no-enum`: TypeScript da casa não usa `enum`, `const enum` nem `declare enum`.
 *
 * Tabela de domínio é objeto `as const` + tipo de mesmo nome
 * (`export const X = {...} as const; export type X = (typeof X)[keyof typeof X];`). O `enum`
 * não é sintaxe apagável (quebra `erasableSyntaxOnly` e os runtimes que só tiram tipos), gera
 * objeto com mapeamento reverso e, numérico, aceita qualquer `number` no tipo.
 */
const noEnum = {
  meta: {
    type: "problem",
    docs: {
      description: "TypeScript não usa enum: use objeto `as const` + tipo de mesmo nome.",
    },
    schema: [],
    messages: {
      semEnum:
        "`enum {{nome}}` não é aceito: declare `const {{nome}} = { ... } as const` e " +
        "`type {{nome}} = (typeof {{nome}})[keyof typeof {{nome}}]`.",
    },
  },
  create(context) {
    return {
      TSEnumDeclaration(node) {
        context.report({
          node,
          messageId: "semEnum",
          data: { nome: node.id?.name ?? "X" },
        });
      },
    };
  },
};

const plugin = {
  meta: { name: "quality", version: "1.0.0" },
  rules: { "no-enum": noEnum },
};

export default plugin;
