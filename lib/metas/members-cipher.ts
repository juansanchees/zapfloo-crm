/**
 * Cifra das metas individuais guardadas em organizations.settings.
 *
 * A chave AES do aplicativo já é obrigatória em toda instalação. O prefixo no
 * plaintext separa este domínio das credenciais de IA que usam o mesmo helper:
 * um ciphertext válido de outro recurso nunca é aceito como mapa de metas.
 */
import { decryptKey, encryptKey } from "@/lib/crypto/aes_gcm";

const PREFIX = "operational-goals-members:v1:";
const ENVELOPE_VERSION = "v1";

export function encryptOperationalGoalMembers(json: string): string | null {
  try {
    const encrypted = encryptKey(`${PREFIX}${json}`);
    return [
      ENVELOPE_VERSION,
      encrypted.ciphertext.toString("base64url"),
      encrypted.iv.toString("base64url"),
      encrypted.tag.toString("base64url"),
    ].join(".");
  } catch {
    return null;
  }
}

export function decryptOperationalGoalMembers(envelope: string): string | null {
  try {
    const [version, ciphertext, iv, tag, extra] = envelope.split(".");
    if (version !== ENVELOPE_VERSION || !ciphertext || !iv || !tag || extra !== undefined) return null;
    const plaintext = decryptKey({
      ciphertext: Buffer.from(ciphertext, "base64url"),
      iv: Buffer.from(iv, "base64url"),
      tag: Buffer.from(tag, "base64url"),
    });
    return plaintext.startsWith(PREFIX) ? plaintext.slice(PREFIX.length) : null;
  } catch {
    return null;
  }
}
