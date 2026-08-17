import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  deriveEcdhSharedSecret,
  deriveSessionKeys,
  hkdfSha256,
} from "./session-key-derivation.js";

function hex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

describe("Step 22 ECDH and HKDF session derivation", () => {
  it("matches RFC 5869 HKDF-SHA-256 test case 1", () => {
    const output = hkdfSha256(
      Buffer.alloc(22, 0x0b),
      Buffer.from("000102030405060708090a0b0c", "hex"),
      Buffer.from("f0f1f2f3f4f5f6f7f8f9", "hex"),
      42,
    );
    expect(hex(output)).toBe(
      "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
    );
  });

  it("derives equal ECDH secrets and different direction keys", () => {
    const first = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const second = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const firstPublicKey = first.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    const secondPublicKey = second.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    const firstSecret = deriveEcdhSharedSecret(
      first.privateKey,
      secondPublicKey,
    );
    const secondSecret = deriveEcdhSharedSecret(
      second.privateKey,
      firstPublicKey,
    );
    expect(hex(firstSecret)).toBe(hex(secondSecret));

    const keys = deriveSessionKeys(firstSecret, Buffer.alloc(32, 7));
    expect(keys.rootKey).toHaveLength(32);
    expect(keys.clientToHubKey).toHaveLength(32);
    expect(keys.hubToClientKey).toHaveLength(32);
    expect(hex(keys.clientToHubKey)).not.toBe(hex(keys.hubToClientKey));
  });

  it("rejects HKDF output lengths above the RFC limit", () => {
    expect(() =>
      hkdfSha256(
        Buffer.alloc(1),
        Buffer.alloc(0),
        Buffer.alloc(0),
        255 * 32 + 1,
      ),
    ).toThrow("ELITE_HKDF_LENGTH_INVALID");
  });
});
