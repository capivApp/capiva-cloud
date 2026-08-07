import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  /**
   * URL do painel Capiva Cloud (self-hosted). Informada no login e persistida
   * no dispositivo. Ex.: http://10.1.2.8:8410
   */
  serverUrl: string;
  /** Access token mantido APENAS em memória (nunca persistido). */
  accessToken: string | null;
  user: AuthUser | null;
  organizationId: string | null;
  setServerUrl: (url: string) => void;
  setAuth: (token: string, user: AuthUser) => void;
  setOrganization: (id: string | null) => void;
  clear: () => void;
}

/** Normaliza a URL digitada: garante esquema e remove barra final. */
export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      serverUrl: "",
      accessToken: null,
      user: null,
      organizationId: null,
      setServerUrl: (serverUrl) => set({ serverUrl: normalizeServerUrl(serverUrl) }),
      setAuth: (accessToken, user) => set({ accessToken, user }),
      setOrganization: (organizationId) => set({ organizationId }),
      clear: () => set({ accessToken: null, user: null, organizationId: null }),
    }),
    {
      name: "capiva-auth",
      storage: createJSONStorage(() => AsyncStorage),
      // O token de acesso fica fora da persistência: renovado via cookie de refresh.
      partialize: (s) => ({ serverUrl: s.serverUrl, organizationId: s.organizationId, user: s.user }),
    },
  ),
);
