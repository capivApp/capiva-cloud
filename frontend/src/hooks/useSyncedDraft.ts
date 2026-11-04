import { type SetStateAction, useCallback, useState } from "react";

export interface DraftState<T> {
  key: unknown;
  draft: T;
}

/** Mesma chave devolve o mesmo estado; chave nova recomeça o rascunho pelo `build`. */
export function nextDraftState<T>(
  state: DraftState<T>,
  key: unknown,
  build: (prev: T | undefined) => T,
): DraftState<T> {
  if (Object.is(state.key, key)) return state;
  return { key, draft: build(state.draft) };
}

/**
 * Rascunho editável que recomeça quando `syncKey` muda (dado do servidor recarregado, valor
 * vindo da URL). Ajusta o estado no próprio render, como o React recomenda para "resetar
 * estado quando uma prop muda", em vez de um `useEffect` com setState.
 */
export function useSyncedDraft<T>(syncKey: unknown, build: (prev: T | undefined) => T) {
  const [state, setState] = useState<DraftState<T>>(() => ({
    key: syncKey,
    draft: build(undefined),
  }));
  const next = nextDraftState(state, syncKey, build);
  if (next !== state) setState(next);

  const setDraft = useCallback(
    (action: SetStateAction<T>) =>
      setState((s) => ({
        ...s,
        draft: typeof action === "function" ? (action as (prev: T) => T)(s.draft) : action,
      })),
    [],
  );

  return [next.draft, setDraft] as const;
}
