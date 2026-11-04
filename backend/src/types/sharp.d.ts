// O `@mateusseiboth/ts-decorators` publica o fonte `.ts`, e o worker de relatório dele faz
// `import("sharp")`. O `sharp` é peer OPCIONAL (só para imagem em relatório, que o backend não
// usa), então não está instalado e o typecheck acusava TS2307 dentro do node_modules.
declare module "sharp";
