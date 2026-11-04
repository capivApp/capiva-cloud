/**
 * Script do initContainer `compose-plan` (roda com `bun -e` numa imagem do Bun).
 *
 * O Kaniko recebe argumentos fixos no manifest, mas contexto e Dockerfile de um serviço
 * só são conhecidos depois de ler o compose clonado. Por isso o script NORMALIZA o
 * workspace: copia a receita para `OUT_DOCKERFILE` e move o contexto para `OUT_CONTEXT`,
 * caminhos que o manifest já conhece.
 *
 * Entradas (env): REPO_DIR (raiz do clone), COMPOSE_FILE (absoluto), COMPOSE_SERVICE
 * (vazio = primeiro serviço com `build`), OUT_CONTEXT, OUT_DOCKERFILE.
 *
 * É JavaScript puro em string de propósito: vai para o container como argumento, sem
 * depender do código do backend. `composePlan.test.ts` executa este texto de verdade.
 */
export const COMPOSE_PLAN_SCRIPT = String.raw`
const fs = require("node:fs");
const path = require("node:path");

const fail = (message) => {
  console.error("[compose-plan] " + message);
  process.exit(1);
};

const env = process.env;
const repoDir = path.resolve(env.REPO_DIR);
const composeFile = path.resolve(env.COMPOSE_FILE);
const isInsideRepo = (target) => target === repoDir || target.startsWith(repoDir + path.sep);

if (!fs.existsSync(composeFile)) fail("arquivo compose não encontrado: " + path.relative(repoDir, composeFile));

const doc = Bun.YAML.parse(fs.readFileSync(composeFile, "utf8")) ?? {};
const services = doc.services ?? {};
const serviceName = env.COMPOSE_SERVICE || Object.keys(services).find((name) => services[name]?.build);
if (!serviceName) fail("nenhum serviço com build no compose.");

const service = services[serviceName];
if (!service) fail("serviço não encontrado no compose: " + serviceName);
if (!service.build) fail("o serviço " + serviceName + " não tem build (usa só imagem pronta).");

const build = typeof service.build === "string" ? { context: service.build } : service.build;
const contextRef = String(build.context ?? ".");
if (/^[a-z]+:\/\//i.test(contextRef) || contextRef.startsWith("git@")) fail("contexto remoto não é suportado: " + contextRef);

const context = path.resolve(path.dirname(composeFile), contextRef);
if (!isInsideRepo(context)) fail("contexto fora do repositório: " + contextRef);
if (!fs.existsSync(context)) fail("contexto não encontrado: " + contextRef);

const writeInline = () => fs.writeFileSync(env.OUT_DOCKERFILE, String(build.dockerfile_inline));
const copyDockerfile = () => {
  const dockerfile = path.resolve(context, String(build.dockerfile ?? "Dockerfile"));
  if (!isInsideRepo(dockerfile)) fail("Dockerfile fora do repositório: " + build.dockerfile);
  if (!fs.existsSync(dockerfile)) fail("Dockerfile não encontrado: " + path.relative(repoDir, dockerfile));
  fs.copyFileSync(dockerfile, env.OUT_DOCKERFILE);
};
(build.dockerfile_inline ? writeInline : copyDockerfile)();

fs.renameSync(context, env.OUT_CONTEXT);
console.log("[compose-plan] serviço " + serviceName + ", contexto " + (path.relative(repoDir, context) || "."));
`;
