import { AsyncLocalStorage } from "async_hooks";

const deferred = new AsyncLocalStorage<true>();

/**
 * Roda `fn` com o reconcile da aplicação ADIADO: os services da tela gravam, mas não
 * aplicam no cluster. É o capiva.json no deploy: cada service reconciliaria sem a imagem
 * nova, e a app Git cairia na imagem placeholder durante todo o build. O reconcile do
 * próprio deploy, depois do build, aplica tudo de uma vez.
 */
export const withoutReconcile = <T>(fn: () => Promise<T>): Promise<T> => deferred.run(true, fn);

export const isReconcileDeferred = (): boolean => deferred.getStore() === true;
