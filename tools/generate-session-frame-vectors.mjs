import { createCipheriv, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const key = Buffer.alloc(32, 0x11);
const noncePrefix = Buffer.from("01020304", "hex");
const counter = 0;
const nonce = Buffer.concat([noncePrefix, Buffer.alloc(8)]);
const plaintext = Buffer.from('{"scope":"appointments"}', "utf8");
const unsigned = {
  protocolVersion: 1,
  messageType: "sync-request",
  sessionId: "session-frame-01",
  direction: "client-to-hub",
  counter,
  nonceBase64: nonce.toString("base64"),
};
const canonical = (value) => {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
};
const aad = Buffer.from(canonical(unsigned), "utf8");
const cipher = createCipheriv("aes-256-gcm", key, nonce);
cipher.setAAD(aad);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();
const vector = {
  version: 1,
  vectors: [
    {
      name: "sync-request-counter-0",
      sessionId: unsigned.sessionId,
      messageType: unsigned.messageType,
      direction: unsigned.direction,
      counter,
      keyHex: key.toString("hex"),
      noncePrefixHex: noncePrefix.toString("hex"),
      plaintextBase64: plaintext.toString("base64"),
      frame: {
        ...unsigned,
        aadHash: createHash("sha256").update(aad).digest("hex"),
        ciphertextBase64: ciphertext.toString("base64"),
        tagBase64: tag.toString("base64"),
      },
    },
  ],
};
writeFileSync(
  process.argv[2] ?? "test-vectors/session-frame-vectors.json",
  `${JSON.stringify(vector, null, 2)}\n`,
);
