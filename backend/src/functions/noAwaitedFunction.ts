/**
 * Executa uma Promise "fire-and-forget" registrando erros — usada no bootstrap.
 */
export function noAwaitedFunction<T>(promise: Promise<T>): void {
  promise.catch((error) => {
    console.error("[unhandled async]", error);
  });
}
