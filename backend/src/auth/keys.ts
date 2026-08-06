import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "../config";

/**
 * Par de chaves RS256 para assinar/verificar Access Tokens.
 *
 * Ordem de resolução:
 *  1. `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (PEM inline, `\n` escapado aceito);
 *  2. `JWT_PRIVATE_KEY_FILE` / `JWT_PUBLIC_KEY_FILE` (secret montado em volume);
 *  3. arquivos em `src/keys/` — gerados na primeira execução, APENAS fora de produção.
 *
 * Em produção a chave DEVE vir do ambiente: um par gerado no disco do container
 * é perdido a cada rollout (invalidando todas as sessões) e diverge entre
 * réplicas — cada uma assinaria com uma chave que as outras não reconhecem.
 */
const KEYS_DIR = path.resolve(process.cwd(), "src/keys");
const PRIV_PATH = path.join(KEYS_DIR, "private.key");
const PUB_PATH = path.join(KEYS_DIR, "public.key");

interface KeyPair {
  privateKey: string;
  publicKey: string;
}

/** PEM vindo de variável de ambiente (aceita `\n` escapado, comum em CI/Helm). */
const fromInline = (): KeyPair | null => {
  const privateKey = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const publicKey = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, "\n");
  return privateKey && publicKey ? { privateKey, publicKey } : null;
};

/** PEM vindo de arquivo (secret do Kubernetes montado como volume). */
const fromFiles = (): KeyPair | null => {
  const priv = process.env.JWT_PRIVATE_KEY_FILE;
  const pub = process.env.JWT_PUBLIC_KEY_FILE;
  if (!priv || !pub) return null;
  return { privateKey: fs.readFileSync(priv, "utf8"), publicKey: fs.readFileSync(pub, "utf8") };
};

/** Par persistido em `src/keys/` (somente dev/test). */
const fromDisk = (): KeyPair | null => {
  if (!fs.existsSync(PRIV_PATH) || !fs.existsSync(PUB_PATH)) return null;
  return { privateKey: fs.readFileSync(PRIV_PATH, "utf8"), publicKey: fs.readFileSync(PUB_PATH, "utf8") };
};

function generateAndPersist(): KeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(PRIV_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUB_PATH, publicKey, { mode: 0o644 });
  console.log("[auth] Par RSA de desenvolvimento gerado em src/keys/ (não versionar).");
  return { privateKey, publicKey };
}

function resolveKeys(): KeyPair {
  const provided = fromInline() ?? fromFiles();
  if (provided) return provided;

  if (config.env === "production") {
    throw new Error(
      "[auth] Chave de assinatura ausente. Defina JWT_PRIVATE_KEY/JWT_PUBLIC_KEY (ou *_FILE) em produção. " +
        "Gere com: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.key && " +
        "openssl rsa -in private.key -pubout -out public.key",
    );
  }

  return fromDisk() ?? generateAndPersist();
}

const keys = resolveKeys();

export const PRIVATE_KEY = keys.privateKey;
export const PUBLIC_KEY = keys.publicKey;
