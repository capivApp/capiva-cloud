import { useEventSource } from "@/hooks/useEventSource";

export interface LogLine {
  ts: string;
  line: string;
}

/** Logs ao vivo da aplicação via SSE. */
export function useLogsStream(applicationId: string | null) {
  return useEventSource<LogLine[]>(
    applicationId ? `/streams/applications/${applicationId}/logs` : null,
    "logs",
  );
}
