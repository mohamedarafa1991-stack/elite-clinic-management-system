import {
  createPublicKey,
  diffieHellman,
  createHmac,
  type KeyObject,
} from "node:crypto";

const HASH_ALGORITHM = "sha256";
const HASH_LENGTH = 32;
const SESSION_INFO = "elite-clinic/session-key/v1";

export interface DerivedSessionKeys {
  rootKey: Buffer;
  clientToHubKey: Buffer;
  hubToClientKey: Buffer;
}

export function deriveEcdhSharedSecret(
  privateKey: KeyObject,
  peerPublicKeySpkiBase64: string,
): Buffer {
  const peerPublicKey = createPublicKey({
    key: Buffer.from(peerPublicKeySpkiBase64, "base64"),
    format: "der",
    type: "spki",
  });
  return diffieHellman({ privateKey, publicKey: peerPublicKey });
}

export function deriveSessionKeys(
  sharedSecret: Uint8Array,
  transcriptHash: Uint8Array,
): DerivedSessionKeys {
  const rootKey = hkdfSha256(
    sharedSecret,
    transcriptHash,
    Buffer.from(SESSION_INFO, "utf8"),
    HASH_LENGTH,
  );
  return {
    rootKey,
    clientToHubKey: hkdfSha256(
      rootKey,
      Buffer.alloc(0),
      Buffer.from("client-to-hub", "utf8"),
      HASH_LENGTH,
    ),
    hubToClientKey: hkdfSha256(
      rootKey,
      Buffer.alloc(0),
      Buffer.from("hub-to-client", "utf8"),
      HASH_LENGTH,
    ),
  };
}

export function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Buffer {
  if (!Number.isInteger(length) || length < 0 || length > 255 * HASH_LENGTH) {
    throw new Error(
      "ELITE_HKDF_LENGTH_INVALID: output length exceeds HKDF-SHA-256 limit",
    );
  }
  const actualSalt =
    salt.length === 0 ? Buffer.alloc(HASH_LENGTH) : Buffer.from(salt);
  const prk = createHmac(HASH_ALGORITHM, actualSalt).update(ikm).digest();
  if (length === 0) return Buffer.alloc(0);

  const output = Buffer.alloc(length);
  let previous = Buffer.alloc(0);
  let outputOffset = 0;
  let counter = 1;
  while (outputOffset < length) {
    previous = createHmac(HASH_ALGORITHM, prk)
      .update(previous)
      .update(info)
      .update(Buffer.from([counter]))
      .digest();
    const copyLength = Math.min(previous.length, length - outputOffset);
    previous.copy(output, outputOffset, 0, copyLength);
    outputOffset += copyLength;
    counter += 1;
  }
  return output;
}
