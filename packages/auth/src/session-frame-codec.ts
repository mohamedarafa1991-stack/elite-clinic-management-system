import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import {
  canonicalJson,
  sessionFrameSchema,
  type SessionFrame,
} from "@elite/contracts";

const NONCE_PREFIX_BYTES = 4;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MAX_SAFE_COUNTER = Number.MAX_SAFE_INTEGER;

type FrameDirection = SessionFrame["direction"];
type FrameMessageType = SessionFrame["messageType"];

export interface SessionFrameChannelOptions {
  sessionId: string;
  noncePrefix: Uint8Array;
  sendKey: Uint8Array;
  receiveKey: Uint8Array;
  sendDirection: FrameDirection;
  receiveDirection: FrameDirection;
}

export interface DecryptedSessionFrame {
  frame: SessionFrame;
  plaintext: Buffer;
}

export function deriveSessionFrameNonce(
  noncePrefix: Uint8Array,
  counter: number,
): Buffer {
  if (noncePrefix.length !== NONCE_PREFIX_BYTES) {
    throw new Error(
      "ELITE_SESSION_NONCE_PREFIX_INVALID: nonce prefix must be 4 bytes",
    );
  }
  assertCounter(counter);
  const nonce = Buffer.alloc(NONCE_BYTES);
  Buffer.from(noncePrefix).copy(nonce, 0);
  nonce.writeBigUInt64BE(BigInt(counter), NONCE_PREFIX_BYTES);
  return nonce;
}

export function sessionFrameAad(frame: {
  protocolVersion: 1;
  messageType: FrameMessageType;
  sessionId: string;
  direction: FrameDirection;
  counter: number;
  nonceBase64: string;
}): Buffer {
  return Buffer.from(
    canonicalJson({
      protocolVersion: frame.protocolVersion,
      messageType: frame.messageType,
      sessionId: frame.sessionId,
      direction: frame.direction,
      counter: frame.counter,
      nonceBase64: frame.nonceBase64,
    }),
    "utf8",
  );
}

export function sessionFrameAadHash(aad: Uint8Array): string {
  return createHash("sha256").update(aad).digest("hex");
}

export class SessionFrameChannel {
  private sendCounter = 0;
  private receiveCounter = 0;

  public constructor(private readonly options: SessionFrameChannelOptions) {
    if (options.sendKey.length !== 32 || options.receiveKey.length !== 32) {
      throw new Error(
        "ELITE_SESSION_KEY_INVALID: AES-256 session keys are required",
      );
    }
    if (options.sendDirection === options.receiveDirection) {
      throw new Error(
        "ELITE_SESSION_DIRECTION_INVALID: directions must be distinct",
      );
    }
  }

  public encrypt(
    messageType: FrameMessageType,
    plaintext: Uint8Array,
  ): SessionFrame {
    if (this.sendCounter === MAX_SAFE_COUNTER) {
      throw new Error(
        "ELITE_SESSION_COUNTER_EXHAUSTED: session send counter is exhausted",
      );
    }
    const counter = this.sendCounter;
    const nonce = deriveSessionFrameNonce(this.options.noncePrefix, counter);
    const nonceBase64 = nonce.toString("base64");
    const unsigned = {
      protocolVersion: 1 as const,
      messageType,
      sessionId: this.options.sessionId,
      direction: this.options.sendDirection,
      counter,
      nonceBase64,
    };
    const aad = sessionFrameAad(unsigned);
    const cipher = createCipheriv("aes-256-gcm", this.options.sendKey, nonce);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    if (tag.length !== AUTH_TAG_BYTES) {
      throw new Error(
        "ELITE_SESSION_TAG_INVALID: AES-GCM tag length is not 16 bytes",
      );
    }
    const frame = sessionFrameSchema.parse({
      ...unsigned,
      aadHash: sessionFrameAadHash(aad),
      ciphertextBase64: ciphertext.toString("base64"),
      tagBase64: tag.toString("base64"),
    });
    this.sendCounter += 1;
    return frame;
  }

  public decrypt(frame: SessionFrame): DecryptedSessionFrame {
    const parsed = sessionFrameSchema.parse(frame);
    if (parsed.protocolVersion !== 1) {
      throw new Error(
        "ELITE_SESSION_PROTOCOL_UNSUPPORTED: unsupported frame version",
      );
    }
    if (parsed.sessionId !== this.options.sessionId) {
      throw new Error(
        "ELITE_SESSION_ID_MISMATCH: frame belongs to another session",
      );
    }
    if (parsed.direction !== this.options.receiveDirection) {
      throw new Error(
        "ELITE_SESSION_DIRECTION_MISMATCH: frame direction is invalid",
      );
    }
    if (this.receiveCounter === MAX_SAFE_COUNTER) {
      throw new Error(
        "ELITE_SESSION_COUNTER_EXHAUSTED: session receive counter is exhausted",
      );
    }
    if (parsed.counter !== this.receiveCounter) {
      throw new Error(
        parsed.counter < this.receiveCounter
          ? "ELITE_SESSION_REPLAY_REJECTED: frame counter was already accepted"
          : "ELITE_SESSION_COUNTER_GAP: frame counter is not the next expected counter",
      );
    }
    const nonce = deriveSessionFrameNonce(
      this.options.noncePrefix,
      parsed.counter,
    );
    if (nonce.toString("base64") !== parsed.nonceBase64) {
      throw new Error("ELITE_SESSION_NONCE_MISMATCH: frame nonce is invalid");
    }
    const aad = sessionFrameAad(parsed);
    if (sessionFrameAadHash(aad) !== parsed.aadHash) {
      throw new Error("ELITE_SESSION_AAD_TAMPERED: frame AAD hash is invalid");
    }
    const ciphertext = Buffer.from(parsed.ciphertextBase64, "base64");
    const tag = Buffer.from(parsed.tagBase64, "base64");
    if (tag.length !== AUTH_TAG_BYTES) {
      throw new Error(
        "ELITE_SESSION_TAG_INVALID: AES-GCM tag length is not 16 bytes",
      );
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.options.receiveKey,
      nonce,
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    try {
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      this.receiveCounter += 1;
      return { frame: parsed, plaintext };
    } catch {
      throw new Error(
        "ELITE_SESSION_AUTHENTICATION_FAILED: AES-GCM authentication failed",
      );
    }
  }

  public get nextSendCounter(): number {
    return this.sendCounter;
  }

  public get nextReceiveCounter(): number {
    return this.receiveCounter;
  }
}

function assertCounter(counter: number): void {
  if (
    !Number.isSafeInteger(counter) ||
    counter < 0 ||
    counter > MAX_SAFE_COUNTER
  ) {
    throw new Error(
      "ELITE_SESSION_COUNTER_INVALID: counter must be a nonnegative safe integer",
    );
  }
}
