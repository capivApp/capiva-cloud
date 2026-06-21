import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  /** Access token mantido APENAS em memória (nunca no localStorage). */
  accessToken: string | null;
  user: AuthUser | null;
  organizationId: string | null;
  setAuth: (token: string, user: AuthUser) => void;
  setOrganization: (id: string | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  organizationId: null,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  setOrganization: (organizationId) => set({ organizationId }),
  clear: () => set({ accessToken: null, user: null, organizationId: null }),
}));
