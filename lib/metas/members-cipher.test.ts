import { beforeEach, describe, expect, it, vi } from "vitest";

import { decryptKey, encryptKey } from "@/lib/crypto/aes_gcm";
import {
  decryptOperationalGoalMembers,
  encryptOperationalGoalMembers,
} from "./members-cipher";

vi.mock("@/lib/crypto/aes_gcm", () => ({
  decryptKey: vi.fn(),
  encryptKey: vi.fn(),
}));

describe("cifra das metas individuais", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(encryptKey).mockReturnValue({
      ciphertext: Buffer.from("ciphertext"),
      iv: Buffer.alloc(12, 1),
      tag: Buffer.alloc(16, 2),
      last4: "rado",
    });
  });

  it("serializa o envelope sem persistir o mapa em texto claro", () => {
    const json = '{"member":{"monthly_conversations":20}}';
    const encrypted = encryptOperationalGoalMembers(json);

    expect(encrypted).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(encrypted).not.toContain("member");
    expect(encryptKey).toHaveBeenCalledWith(`operational-goals-members:v1:${json}`);
  });

  it("só aceita plaintext do domínio de metas", () => {
    const envelope = [
      "v1",
      Buffer.from("ciphertext").toString("base64url"),
      Buffer.alloc(12, 1).toString("base64url"),
      Buffer.alloc(16, 2).toString("base64url"),
    ].join(".");
    vi.mocked(decryptKey).mockReturnValue('operational-goals-members:v1:{"member":{}}');

    expect(decryptOperationalGoalMembers(envelope)).toBe('{"member":{}}');
    vi.mocked(decryptKey).mockReturnValue('ai-credential:{"member":{}}');
    expect(decryptOperationalGoalMembers(envelope)).toBeNull();
    expect(decryptOperationalGoalMembers("corrompido")).toBeNull();
  });
});
