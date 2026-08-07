import { create } from "zustand";

/**
 * Seleção ativa de workspace: projeto e cluster. A organização ativa vive no
 * useAuthStore (lida pelo api client no header x-organization-id).
 */
interface WorkspaceState {
  projectId: string | null;
  clusterId: string | null;
  setProject: (id: string | null) => void;
  setCluster: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projectId: null,
  clusterId: null,
  setProject: (projectId) => set({ projectId }),
  setCluster: (clusterId) => set({ clusterId }),
}));
