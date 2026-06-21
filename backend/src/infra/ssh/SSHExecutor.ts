import { NodeSSH } from "node-ssh";
import { Injectable } from "@di/index";

export interface SSHTarget {
  host: string;
  port?: number;
  username: string;
  /** chave privada PEM ou senha (já decifrada pela Service). */
  privateKey?: string;
  password?: string;
}

export interface SSHResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Executor de comandos via SSH (node-ssh / ssh2). Usado pelo provisionamento de
 * cluster para instalar k3s nos nós. Suporta streaming de saída (para SSE) e
 * timeout. Credenciais chegam JÁ decifradas (cifradas em repouso na Service).
 */
@Injectable()
export class SSHExecutor {
  async run(target: SSHTarget, command: string, onData?: (chunk: string) => void): Promise<SSHResult> {
    const ssh = new NodeSSH();
    await ssh.connect({
      host: target.host,
      port: target.port ?? 22,
      username: target.username,
      privateKey: target.privateKey,
      password: target.password,
      readyTimeout: 20000,
    });
    try {
      let stdout = "";
      let stderr = "";
      const res = await ssh.execCommand(command, {
        onStdout: (c) => { const s = c.toString(); stdout += s; onData?.(s); },
        onStderr: (c) => { const s = c.toString(); stderr += s; onData?.(s); },
      });
      return { code: res.code, stdout, stderr };
    } finally {
      ssh.dispose();
    }
  }
}
