import { Alert } from "react-native";

/** Confirmação nativa antes de ações com impacto. */
export function confirmThen(title: string, message: string, action: () => void): void {
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: "Confirmar", style: "destructive", onPress: action },
  ]);
}

/** Executa a mutation e mostra o erro do servidor, em vez de deixar a promessa rejeitar em silêncio. */
export function runAction(action: () => Promise<unknown>): void {
  action().catch((error: Error) => Alert.alert("Não foi possível concluir", error.message));
}

/** Atalho: confirma e, se o usuário aceitar, executa com feedback de erro. */
export function confirmAndRun(title: string, message: string, action: () => Promise<unknown>): void {
  confirmThen(title, message, () => runAction(action));
}
