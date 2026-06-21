import { create } from "zustand";

/**
 * Seleção ativa de workspace: projeto e ambiente. A organização ativa vive no
 * useAuthStore (lida pelo api client no header x-organization-id).
 */
interface WorkspaceState {
  projectId: string | null;
  environmentId: string | null;
  setProject: (id: string | null) => void;
  setEnvironment: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projectId: null,
  environmentId: null,
  setProject: (projectId) => set({ projectId }),
  setEnvironment: (environmentId) => set({ environmentId }),
}));
