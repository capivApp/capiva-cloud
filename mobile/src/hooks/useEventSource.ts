import { useEffect, useState } from "react";
import { connectSse } from "@/lib/sse";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Conecta a um endpoint SSE do backend (espelho do painel web). Como o stream
 * não recebe header Authorization, o access token vai por query (?access_token=).
 */
export function useEventSource<T>(path: string | null, eventName: string) {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.accessToken);
  const orgId = useAuthStore((s) => s.organizationId);
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!path || !token || !serverUrl) return;
    const sep = path.includes("?") ? "&" : "?";
    const url = `${serverUrl}/api${path}${sep}access_token=${encodeURIComponent(token)}${orgId ? `&org=${orgId}` : ""}`;
    const handle = connectSse(url, {
      onEvent: (event, payload) => {
        if (event !== eventName) return;
        try {
          setData(JSON.parse(payload) as T);
        } catch {
          /* payload inválido — ignora */
        }
      },
    });
    return () => handle.close();
  }, [path, eventName, token, orgId, serverUrl]);

  return data;
}
