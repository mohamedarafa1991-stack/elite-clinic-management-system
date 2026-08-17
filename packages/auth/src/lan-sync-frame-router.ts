import {
  canonicalJson,
  syncDeltaRequestSchema,
  syncOutboxInputSchema,
  type SessionGrant,
  type SyncOutboxAcknowledgment,
} from "@elite/contracts";
import type { SessionContext } from "./index.js";
import type { SynchronizationService } from "./synchronization-service.js";
import { verifySessionGrant } from "./session-protocol.js";
import {
  SessionFrameChannel,
  type SessionFrameChannelOptions,
} from "./session-frame-codec.js";
import type { SessionFrame } from "@elite/contracts";

export type LanHubOutboxResult =
  | { kind: "accepted"; operationId: string }
  | { kind: "already-applied"; operationId: string }
  | { kind: "conflict"; operationId: string; reasonCode: string }
  | { kind: "rejected"; operationId: string; reasonCode: string }
  | { kind: "retryable"; operationId: string; reasonCode: string };

export function mapHubAcknowledgment(
  acknowledgment: SyncOutboxAcknowledgment,
): LanHubOutboxResult {
  switch (acknowledgment.state) {
    case "accepted":
      return { kind: "accepted", operationId: acknowledgment.operationId };
    case "already-applied":
      return {
        kind: "already-applied",
        operationId: acknowledgment.operationId,
      };
    case "conflict":
      return {
        kind: "conflict",
        operationId: acknowledgment.operationId,
        reasonCode: acknowledgment.conflict?.conflictType ?? "SYNC_CONFLICT",
      };
    case "rejected":
    case "requires-amendment":
      return {
        kind: "rejected",
        operationId: acknowledgment.operationId,
        reasonCode: acknowledgment.state,
      };
    default:
      return {
        kind: "retryable",
        operationId: acknowledgment.operationId,
        reasonCode: "SYNC_UNKNOWN_ACKNOWLEDGMENT",
      };
  }
}

interface RegisteredLanSession {
  context: SessionContext;
  channel: SessionFrameChannel;
}

export interface LanSyncFrameRouterOptions {
  sessionChannel: Omit<SessionFrameChannelOptions, "sessionId"> & {
    sessionId: string;
  };
  context: SessionContext;
}

export interface SignedLanSessionRegistration extends LanSyncFrameRouterOptions {
  grant: SessionGrant;
  trustedHubPublicKeyPem: string;
  expectedOrganizationId: string;
  expectedRequestNonce: string;
  now: string;
}

export class LanSyncFrameRouter {
  private readonly sessions = new Map<string, RegisteredLanSession>();

  public constructor(
    private readonly synchronizationService: SynchronizationService,
  ) {}

  public registerSession(options: LanSyncFrameRouterOptions): void {
    this.sessions.set(options.sessionChannel.sessionId, {
      context: options.context,
      channel: new SessionFrameChannel(options.sessionChannel),
    });
  }

  public registerSignedSession(options: SignedLanSessionRegistration): void {
    const grant = verifySessionGrant(
      options.grant,
      options.trustedHubPublicKeyPem,
      options.expectedOrganizationId,
      options.context.deviceId,
      options.grant.sessionId,
      options.expectedRequestNonce,
      options.now,
    );
    if (grant.userId !== options.context.userId) {
      throw new Error(
        "ELITE_LAN_SESSION_USER_MISMATCH: grant user is not bound to the context",
      );
    }
    if (grant.sessionId !== options.sessionChannel.sessionId) {
      throw new Error(
        "ELITE_LAN_SESSION_ID_MISMATCH: grant is not bound to the channel",
      );
    }
    this.registerSession(options);
  }

  public removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  public route(frame: SessionFrame): SessionFrame {
    const session = this.sessions.get(frame.sessionId);
    if (!session) {
      throw new Error(
        "ELITE_LAN_SESSION_NOT_FOUND: secure LAN session is not registered",
      );
    }
    const decrypted = session.channel.decrypt(frame);
    const request = JSON.parse(decrypted.plaintext.toString("utf8")) as unknown;
    const response = this.routeRequest(
      session.context,
      frame.messageType,
      request,
    );
    const responseType =
      frame.messageType === "sync-request"
        ? "sync-response"
        : "outbox-response";
    return session.channel.encrypt(
      responseType,
      Buffer.from(canonicalJson(response), "utf8"),
    );
  }

  private routeRequest(
    context: SessionContext,
    messageType: SessionFrame["messageType"],
    value: unknown,
  ): Record<string, unknown> {
    if (!value || typeof value !== "object" || !("request" in value)) {
      throw new Error(
        "ELITE_LAN_REQUEST_ENVELOPE_INVALID: request envelope is invalid",
      );
    }
    const request = (value as { request: unknown }).request;
    if (messageType === "sync-request") {
      return {
        response: this.synchronizationService.getDelta(
          context,
          syncDeltaRequestSchema.parse(request),
        ),
      };
    }
    if (messageType === "outbox-request") {
      const queued = this.synchronizationService.queueOutbox(
        context,
        syncOutboxInputSchema.parse(request),
      );
      return {
        operationId: queued.operationId,
        state: "accepted",
        queued,
      };
    }
    throw new Error(
      "ELITE_LAN_MESSAGE_TYPE_UNSUPPORTED: message type is not a request",
    );
  }
}
