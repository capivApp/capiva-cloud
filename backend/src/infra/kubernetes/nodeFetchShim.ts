/**
 * Shim de fetch para @kubernetes/client-node rodando sob Bun.
 *
 * O client-node (v1.x) autentica no API server via mTLS (client-certificate do
 * kubeconfig) embarcando `ca`/`cert`/`key` num `https.Agent`, que é passado ao
 * `node-fetch`. O Bun IGNORA as opções de TLS do `https.Agent`, então o
 * certificado de cliente NUNCA é enviado — o API server trata a chamada como
 * anônima e responde 401 Unauthorized em toda operação autenticada (apply,
 * delete, scale...). `NODE_TLS_REJECT_UNAUTHORIZED=0` só resolve a verificação
 * do certificado do SERVIDOR, não o envio do certificado do CLIENTE.
 *
 * Este shim substitui o `send` da biblioteca de HTTP do client-node para usar o
 * `fetch` NATIVO do Bun, traduzindo as opções do agent na opção `tls` que o Bun
 * entende (`{ ca, cert, key, rejectUnauthorized }`). Idempotente e no-op fora do
 * Bun (Node já honra o `https.Agent`).
 */
import { IsomorphicFetchHttpLibrary, ResponseContext } from "@kubernetes/client-node";

/** Observable mínimo compatível com o rxjsStub interno do client-node. */
class PromiseObservable<T> {
  constructor(private readonly promise: Promise<T>) {}
  toPromise(): Promise<T> {
    return this.promise;
  }
  pipe<R>(callback: (value: T) => R): PromiseObservable<R> {
    return new PromiseObservable(this.promise.then(callback));
  }
}

type AgentLike = {
  options?: { ca?: unknown; cert?: unknown; key?: unknown; rejectUnauthorized?: boolean };
};

/**
 * Escape hatch para clusters cujo kubeconfig não traz a CA (self-signed sem
 * `certificate-authority-data`). Vale APENAS para as chamadas ao API server —
 * antes isto era `NODE_TLS_REJECT_UNAUTHORIZED=0` no processo inteiro, o que
 * também desligava a verificação de TLS de Git, S3, webhooks e notificações.
 */
const insecureK8sTls = (): boolean => process.env.CAPIVA_K8S_INSECURE_TLS === "true";

const buildTls = (agent: AgentLike | undefined): Record<string, unknown> | undefined => {
  const opts = agent?.options;
  const tls: Record<string, unknown> = {};
  if (opts?.ca) tls.ca = opts.ca;
  if (opts?.cert) tls.cert = opts.cert;
  if (opts?.key) tls.key = opts.key;
  if (opts?.rejectUnauthorized !== undefined) tls.rejectUnauthorized = opts.rejectUnauthorized;
  if (insecureK8sTls()) tls.rejectUnauthorized = false;
  return Object.keys(tls).length ? tls : undefined;
};

let installed = false;

export function installBunKubeFetchShim(): void {
  if (installed) return;
  // Fora do Bun o https.Agent funciona normalmente — não mexer.
  if (typeof (globalThis as { Bun?: unknown }).Bun === "undefined") return;
  installed = true;

  IsomorphicFetchHttpLibrary.prototype.send = function send(
    request: Parameters<IsomorphicFetchHttpLibrary["send"]>[0],
  ) {
    const init: RequestInit & { tls?: Record<string, unknown> } = {
      method: request.getHttpMethod().toString(),
      body: request.getBody(),
      headers: request.getHeaders(),
      signal: request.getSignal(),
      // O tipo declara `http.Agent | https.Agent`; só o https traz `options` com o TLS do kubeconfig.
      tls: buildTls(request.getAgent() as AgentLike | undefined),
    };

    const resultPromise = fetch(request.getUrl(), init).then((resp) => {
      const headers: Record<string, string> = {};
      resp.headers.forEach((value, name) => {
        headers[name] = value;
      });
      const body = {
        text: () => resp.text(),
        binary: () => resp.arrayBuffer().then((buf) => Buffer.from(buf)),
      };
      return new ResponseContext(resp.status, headers, body);
    });

    return new PromiseObservable(resultPromise) as unknown as ReturnType<
      IsomorphicFetchHttpLibrary["send"]
    >;
  };
}
