import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/useAuthStore";

const BASE = import.meta.env.VITE_API_URL || "";

/**
 * Conecta a um endpoint SSE do backend. Como EventSource não envia header
 * Authorization, o access token vai por query string (?access_token=).
 */
export function useEventSource<T>(path: string | null, eventName: string) {
  const token = useAuthStore((s) => s.accessToken);
  const orgId = useAuthStore((s) => s.organizationId);
  const [data, setData] = useState<T | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!path || !token) return;
    const sep = path.includes("?") ? "&" : "?";
    const url = `${BASE}/api${path}${sep}access_token=${encodeURIComponent(token)}${orgId ? `&org=${orgId}` : ""}`;
    const es = new EventSource(url);
    sourceRef.current = es;
    es.addEventListener(eventName, (e) => {
      try {
        setData(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, [path, eventName, token, orgId]);

  return data;
}
