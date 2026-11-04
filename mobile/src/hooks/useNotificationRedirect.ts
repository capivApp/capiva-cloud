import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { buildNotificationHref } from "@/lib/notifications";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotificationStore } from "@/stores/useNotificationStore";

const openResponse = (response: Notifications.NotificationResponse | null): void => {
  if (!response) return;
  const { identifier, content } = response.notification.request;
  const store = useNotificationStore.getState();
  if (store.handledId === identifier) return;
  store.markHandled(identifier);

  const href = buildNotificationHref(content.data);
  if (!href) return;
  // Sem sessão ainda (cold start): as tabs abrem a rota depois do gate de login.
  if (!useAuthStore.getState().accessToken) return store.setPending(href);
  router.push(href);
};

/** Toque no push abre a tela da aplicação do evento (monte uma vez, no layout raiz). */
export function useNotificationRedirect(): void {
  useEffect(() => {
    openResponse(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    return () => subscription.remove();
  }, []);
}

/** Abre o deep link que esperava a sessão (monte nas tabs, primeira tela autenticada). */
export function usePendingNotificationHref(): void {
  useEffect(() => {
    const href = useNotificationStore.getState().consumePending();
    if (href) router.push(href);
  }, []);
}
