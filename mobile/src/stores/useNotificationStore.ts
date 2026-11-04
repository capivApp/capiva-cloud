import { create } from "zustand";
import type { ApplicationHref } from "@/lib/notifications";

/**
 * Deep link de push à espera da sessão. No cold start o toque chega antes do
 * gate de login renovar o token; a rota fica aqui até as tabs montarem.
 */
interface NotificationState {
  pendingHref: ApplicationHref | null;
  /** Último toque tratado: o listener e o `getLastNotificationResponse` podem entregar o mesmo. */
  handledId: string | null;
  setPending: (href: ApplicationHref | null) => void;
  markHandled: (id: string) => void;
  consumePending: () => ApplicationHref | null;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  pendingHref: null,
  handledId: null,
  setPending: (pendingHref) => set({ pendingHref }),
  markHandled: (handledId) => set({ handledId }),
  consumePending: () => {
    const href = get().pendingHref;
    set({ pendingHref: null });
    return href;
  },
}));
