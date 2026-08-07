/**
 * Cores do tema dark (mesma paleta do global.css) para o chrome nativo
 * (tab bar, headers, status bar) e para ícones — componentes fora do
 * alcance do NativeWind.
 */
export const nativeTheme = {
  background: "hsl(222, 47%, 5%)",
  card: "hsl(222, 40%, 8%)",
  border: "hsl(217, 33%, 16%)",
  foreground: "hsl(210, 40%, 98%)",
  mutedForeground: "hsl(215, 20%, 65%)",
  primary: "#6366f1",
  secondary: "#ec4899",
  success: "#22c55e",
  destructive: "#ef4444",
} as const;

/** Gradiente oficial da marca (landing: from-primary to-secondary). */
export const brandGradient = ["#4f46e5", "#ec4899"] as const;
