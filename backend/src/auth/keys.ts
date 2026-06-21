import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Par de chaves RS256 para assinar/verificar Access Tokens.
 * A chave privada nunca é exposta para validação (só assinatura).
 * Em produção, montar as chaves via secret/volume; em dev, geramos uma vez.
 */
const KEYS_DIR = path.resolve(process.cwd(), "src/keys");
const PRIV_PATH = path.join(KEYS_DIR, "private.key");
const PUB_PATH = path.join(KEYS_DIR, "public.key");

function ensureKeys(): { privateKey: string; publicKey: string } {
  if (fs.existsSync(PRIV_PATH) && fs.existsSync(PUB_PATH)) {
    return {
      privateKey: fs.readFileSync(PRIV_PATH, "utf8"),
      publicKey: fs.readFileSync(PUB_PATH, "utf8"),
    };
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(PRIV_PATH, privateKey);
  fs.writeFileSync(PUB_PATH, publicKey);
  console.log("[auth] RSA keypair gerado em src/keys/");
  return { privateKey, publicKey };
}

const keys = ensureKeys();

export const PRIVATE_KEY = keys.privateKey;
export const PUBLIC_KEY = keys.publicKey;
