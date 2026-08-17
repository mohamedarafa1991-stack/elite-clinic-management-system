import { describe, expect, it } from "vitest";
import {
  SessionFrameChannel,
  deriveSessionFrameNonce,
} from "./session-frame-codec.js";

const sessionId = "session-frame-01";
const noncePrefix = Buffer.from("01020304", "hex");
const clientKey = Buffer.alloc(32, 0x11);
const hubKey = Buffer.alloc(32, 0x22);

function channels() {
  return {
    client: new SessionFrameChannel({
      sessionId,
      noncePrefix,
      sendKey: clientKey,
      receiveKey: hubKey,
      sendDirection: "client-to-hub",
      receiveDirection: "hub-to-client",
    }),
    hub: new SessionFrameChannel({
      sessionId,
      noncePrefix,
      sendKey: hubKey,
      receiveKey: clientKey,
      sendDirection: "hub-to-client",
      receiveDirection: "client-to-hub",
    }),
  };
}

describe("SessionFrameChannel", () => {
  it("encrypts and decrypts AES-GCM frames with deterministic counter nonces", () => {
    const { client, hub } = channels();
    const frame = client.encrypt(
      "sync-request",
      Buffer.from('{"scope":"appointments"}', "utf8"),
    );
    expect(frame.counter).toBe(0);
    expect(frame.nonceBase64).toBe(
      Buffer.from("010203040000000000000000", "hex").toString("base64"),
    );
    const decrypted = hub.decrypt(frame);
    expect(decrypted.plaintext.toString("utf8")).toBe(
      '{"scope":"appointments"}',
    );
    expect(hub.nextReceiveCounter).toBe(1);
  });

  it("rejects replay, gaps, nonce tampering, and ciphertext authentication failures", () => {
    const { client, hub } = channels();
    const first = client.encrypt(
      "sync-request",
      Buffer.from("first-session-payload"),
    );
    expect(() => hub.decrypt({ ...first, counter: 1 })).toThrow(
      "ELITE_SESSION_COUNTER_GAP",
    );
    expect(hub.decrypt(first).plaintext.toString()).toBe(
      "first-session-payload",
    );
    expect(() => hub.decrypt(first)).toThrow("ELITE_SESSION_REPLAY_REJECTED");

    const second = client.encrypt(
      "sync-request",
      Buffer.from("second-session-payload"),
    );
    expect(() =>
      hub.decrypt({ ...second, nonceBase64: "AAAAAAAAAAAAAAAA" }),
    ).toThrow("ELITE_SESSION_NONCE_MISMATCH");
    expect(() =>
      hub.decrypt({
        ...second,
        ciphertextBase64: Buffer.from("tampered-ciphertext").toString("base64"),
      }),
    ).toThrow("ELITE_SESSION_AUTHENTICATION_FAILED");
  });

  it("rejects invalid nonce prefixes and unsafe counters", () => {
    expect(() => deriveSessionFrameNonce(Buffer.alloc(3), 0)).toThrow(
      "ELITE_SESSION_NONCE_PREFIX_INVALID",
    );
    expect(() =>
      deriveSessionFrameNonce(noncePrefix, Number.MAX_SAFE_INTEGER + 1),
    ).toThrow("ELITE_SESSION_COUNTER_INVALID");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SessionFrameChannel shared vectors", () => {
  it("matches the repository AES-GCM vector exactly", () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "../../test-vectors/session-frame-vectors.json"),
        "utf8",
      ),
    ) as {
      vectors: Array<{
        keyHex: string;
        noncePrefixHex: string;
        plaintextBase64: string;
        frame: Parameters<SessionFrameChannel["decrypt"]>[0];
      }>;
    };
    const vector = fixture.vectors[0]!;
    const channel = new SessionFrameChannel({
      sessionId: vector.frame.sessionId,
      noncePrefix: Buffer.from(vector.noncePrefixHex, "hex"),
      sendKey: Buffer.from(vector.keyHex, "hex"),
      receiveKey: Buffer.alloc(32, 0x22),
      sendDirection: "client-to-hub",
      receiveDirection: "hub-to-client",
    });
    const actual = channel.encrypt(
      vector.frame.messageType,
      Buffer.from(vector.plaintextBase64, "base64"),
    );
    expect(actual).toEqual(vector.frame);
  });
});
