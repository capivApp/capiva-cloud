import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SshNode {
  host: string;
  sshUser: string;
  sshPort?: number;
  privateKey?: string;
  password?: string;
  role: "CONTROL_PLANE" | "WORKER";
}

export interface ClusterNode {
  id: string;
  role: "CONTROL_PLANE" | "WORKER";
  host: string;
  internalIp: string | null;
  status: string;
}

/** Provisionamento e gestão de nós (k3s). */
export function useClusterProvisioning() {
  const copyPasteMut = useMutation({
    mutationKey: ["cluster", "copy-paste"],
    mutationFn: (name: string) => api.post<{ cluster: { id: string }; serverScript: string }>("/clusters/provision/copy-paste", { name }),
  });
  const sshMut = useMutation({
    mutationKey: ["cluster", "ssh"],
    mutationFn: (input: { name: string; nodes: SshNode[] }) => api.post("/clusters/provision/ssh", input),
  });
  const cordonMut = useMutation({
    mutationKey: ["cluster", "cordon"],
    mutationFn: ({ clusterId, node, schedulable }: { clusterId: string; node: string; schedulable: boolean }) =>
      api.post(`/clusters/${clusterId}/nodes/${node}/cordon`, { schedulable }),
  });
  const removeNodeMut = useMutation({
    mutationKey: ["cluster", "remove-node"],
    mutationFn: ({ clusterId, nodeId }: { clusterId: string; nodeId: string }) => api.del(`/clusters/${clusterId}/nodes/${nodeId}`),
  });

  return {
    copyPaste: copyPasteMut.mutateAsync,
    provisionSsh: sshMut.mutateAsync,
    cordon: cordonMut.mutateAsync,
    removeNode: removeNodeMut.mutateAsync,
    listNodes: (clusterId: string) => api.get<ClusterNode[]>(`/clusters/${clusterId}/nodes`),
    joinCommand: (clusterId: string, role: "CONTROL_PLANE" | "WORKER") => api.get<{ command: string }>(`/clusters/${clusterId}/join?role=${role}`),
  };
}
