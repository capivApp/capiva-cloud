import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Screen } from "@/components/screen";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { api } from "@/lib/api";
import { brandGradient } from "@/lib/theme";
import type { Organization } from "@/hooks/useOrganizations";
import { normalizeServerUrl, useAuthStore, type AuthUser } from "@/stores/useAuthStore";

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

function Glow({ className }: { className: string }) {
  return <View className={`absolute rounded-full ${className}`} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}

/**
 * Login com URL customizada do servidor (self-hosted): o cliente informa a URL
 * do próprio painel (ex.: http://10.1.2.8:8410), que fica salva no dispositivo.
 */
export default function LoginScreen() {
  const savedUrl = useAuthStore((s) => s.serverUrl);
  const savedOrg = useAuthStore((s) => s.organizationId);
  const [serverUrl, setServerUrl] = useState(savedUrl);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    if (!normalizeServerUrl(serverUrl)) return "Informe a URL do servidor.";
    if (!email.trim() || !password) return "Informe e-mail e senha.";
    return null;
  };

  const resolveOrganization = async () => {
    const organizations = await api.get<Organization[]>("/organizations");
    const active = organizations.find((org) => org.id === savedOrg) ?? organizations[0];
    useAuthStore.getState().setOrganization(active?.id ?? null);
  };

  const submit = async () => {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      useAuthStore.getState().setServerUrl(serverUrl);
      const result = await api.post<LoginResponse>(
        "/auth/login",
        { email: email.trim(), password },
        { auth: false },
      );
      useAuthStore.getState().setAuth(result.accessToken, result.user);
      await resolveOrganization();
      router.replace("/(tabs)");
    } catch (err) {
      setError((err as Error).message || "Falha ao entrar. Verifique a URL e as credenciais.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Glows decorativos da marca (índigo/rosa), como no hero da landing. */}
      <Glow className="-left-24 -top-24 h-72 w-72 bg-primary/15" />
      <Glow className="-left-10 -top-10 h-40 w-40 bg-primary/10" />
      <Glow className="-bottom-28 -right-24 h-80 w-80 bg-secondary/10" />
      <Glow className="-bottom-12 -right-10 h-44 w-44 bg-secondary/10" />

      <Screen topInset transparent className="flex-1 justify-center">
        <View className="mb-6 items-center gap-4">
          <Image
            source={require("@/assets/images/logo.png")}
            className="h-28 w-28"
            resizeMode="contain"
            accessibilityLabel="Capiva Cloud"
          />
          <View className="items-center gap-1">
            <Text className="text-3xl font-extrabold tracking-tight">
              Capiva <Text className="text-3xl font-extrabold tracking-tight text-primary">Cloud</Text>
            </Text>
            <Text variant="muted">Kubernetes without Kubernetes</Text>
          </View>
        </View>

        <Card className="rounded-2xl border-border/60">
          <CardContent className="gap-5">
            <Field label="URL do servidor">
              <Input
                value={serverUrl}
                onChangeText={setServerUrl}
                placeholder="http://10.1.2.8:8410"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                className="h-12 rounded-xl"
              />
              <Text className="text-xs text-muted-foreground">
                Self-hosted: a mesma URL do painel no navegador.
              </Text>
            </Field>

            <Field label="E-mail">
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="voce@empresa.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                className="h-12 rounded-xl"
              />
            </Field>

            <Field label="Senha">
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                onSubmitEditing={submit}
                returnKeyType="go"
                className="h-12 rounded-xl"
              />
            </Field>

            {error && (
              <View className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <Text className="text-sm text-destructive">{error}</Text>
              </View>
            )}

            <Pressable onPress={submit} disabled={submitting} className="active:opacity-90">
              <LinearGradient
                colors={brandGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: 12, height: 48, alignItems: "center", justifyContent: "center", opacity: submitting ? 0.7 : 1 }}
              >
                <Text className="text-base font-semibold text-white">
                  {submitting ? "Entrando…" : "Entrar"}
                </Text>
              </LinearGradient>
            </Pressable>
          </CardContent>
        </Card>

        <Text className="mt-4 text-center text-xs text-muted-foreground">
          Monitore, anexe e opere sua infraestrutura de qualquer lugar.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
