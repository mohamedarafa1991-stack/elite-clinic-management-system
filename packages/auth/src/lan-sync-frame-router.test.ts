import { describe, expect, it } from "vitest";
import { SessionFrameChannel } from "./session-frame-codec.js";
import {
  LanSyncFrameRouter,
  mapHubAcknowledgment,
} from "./lan-sync-frame-router.js";
import type { SessionContext, SynchronizationService } from "./index.js";
import type { SyncOutboxAcknowledgment } from "@elite/contracts";

const base = {
  operationId: "operation-01",
  resourceType: "Appointment" as const,
  resourceId: "appointment-01",
  acknowledgmentHash: "a".repeat(64),
  acknowledgedAt: "2026-08-17T09:00:00.000Z",
};

function acknowledgment(
  state: SyncOutboxAcknowledgment["state"],
  extra: Partial<SyncOutboxAcknowledgment> = {},
): SyncOutboxAcknowledgment {
  return { ...base, state, ...extra };
}

function testContext(): SessionContext {
  return {
    sessionId: "session-01",
    token: "synthetic-token",
    userId: "user-0001",
    username: "synthetic-user",
    role: "nurse",
    deviceId: "device-01",
    capabilities: ["sync.read", "sync.write"],
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}

describe("mapHubAcknowledgment", () => {
  it.each([
    ["accepted", "accepted"],
    ["already-applied", "already-applied"],
  ] as const)("maps %s to %s", (state, kind) => {
    expect(mapHubAcknowledgment(acknowledgment(state))).toMatchObject({
      kind,
      operationId: "operation-01",
    });
  });

  it("preserves conflict reason codes", () => {
    expect(
      mapHubAcknowledgment(
        acknowledgment("conflict", {
          conflict: {
            resourceType: "Appointment",
            resourceId: "appointment-01",
            clientBaseVersion: 1,
            serverVersion: 2,
            conflictType: "version-mismatch",
            resolution: "refresh",
          },
        }),
      ),
    ).toEqual({
      kind: "conflict",
      operationId: "operation-01",
      reasonCode: "version-mismatch",
    });
  });

  it("maps rejected and amendment-required outcomes to terminal rejection", () => {
    expect(mapHubAcknowledgment(acknowledgment("rejected"))).toMatchObject({
      kind: "rejected",
      reasonCode: "rejected",
    });
    expect(
      mapHubAcknowledgment(acknowledgment("requires-amendment")),
    ).toMatchObject({
      kind: "rejected",
      reasonCode: "requires-amendment",
    });
  });
});

describe("LanSyncFrameRouter", () => {
  it("routes an encrypted sync request and returns an encrypted response", async () => {
    const clientKey = Buffer.alloc(32, 0x11);
    const hubKey = Buffer.alloc(32, 0x22);
    const fakeService = {
      getDelta: (
        _context: SessionContext,
        request: Record<string, unknown>,
      ) => ({
        protocolVersion: 1,
        scope: request["scope"],
        responseNonce: request["requestNonce"],
        changes: [],
      }),
    } as unknown as SynchronizationService;
    const router = new LanSyncFrameRouter(fakeService);
    router.registerSession({
      context: testContext(),
      sessionChannel: {
        sessionId: "session-01",
        noncePrefix: Buffer.from("01020304", "hex"),
        sendKey: hubKey,
        receiveKey: clientKey,
        sendDirection: "hub-to-client",
        receiveDirection: "client-to-hub",
      },
    });
    const client = new SessionFrameChannel({
      sessionId: "session-01",
      noncePrefix: Buffer.from("01020304", "hex"),
      sendKey: clientKey,
      receiveKey: hubKey,
      sendDirection: "client-to-hub",
      receiveDirection: "hub-to-client",
    });
    const request = {
      protocolVersion: 1,
      organizationId: "org-elite-01",
      deviceId: "device-01",
      userId: "user-0001",
      scope: "appointments",
      cursor: "0",
      clientBaseVersion: 0,
      knownPolicyVersion: 1,
      syncSessionId: "session-01",
      requestNonce: "0123456789abcdef0123456789abcdef",
      requestedAt: "2030-01-01T00:00:00.000Z",
      maxChanges: 10,
    };
    const responseFrame = await router.route(
      client.encrypt("sync-request", Buffer.from(JSON.stringify({ request }))),
    );
    const response = JSON.parse(
      client.decrypt(responseFrame).plaintext.toString("utf8"),
    ) as {
      response: { scope: string; responseNonce: string; changes: unknown[] };
    };
    expect(response.response.scope).toBe("appointments");
    expect(response.response.responseNonce).toBe(request.requestNonce);
    expect(response.response.changes).toEqual([]);
  });

  it("routes an encrypted doctor-document request without exposing plaintext outside the frame", async () => {
    const clientKey = Buffer.alloc(32, 0x31);
    const hubKey = Buffer.alloc(32, 0x41);
    const fakeService = {
      getDelta: () => ({
        protocolVersion: 1,
        scope: "appointments",
        responseNonce: "0123456789abcdef0123456789abcdef",
        changes: [],
      }),
    } as unknown as SynchronizationService;
    const fakeDoctorService = {
      viewDocument: async () => ({
        documentId: "doctor-doc-01",
        familyId: "doctor-family-01",
        doctorId: "doctor-01",
        documentType: "cv",
        displayName: "Synthetic CV",
        fileName: "synthetic-cv.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        contentSha256: "a".repeat(64),
        version: 1,
        status: "active",
        sensitive: false,
        uploadedByUserId: "doctor-01",
        uploadedAt: "2030-01-01T00:00:00.000Z",
        contentBase64: Buffer.from("synthetic cv").toString("base64"),
      }),
    } as unknown as import("./doctor-profile-service.js").DoctorProfileService;
    const router = new LanSyncFrameRouter(fakeService, fakeDoctorService);
    router.registerSession({
      context: testContext(),
      sessionChannel: {
        sessionId: "session-document-01",
        noncePrefix: Buffer.from("11121314", "hex"),
        sendKey: hubKey,
        receiveKey: clientKey,
        sendDirection: "hub-to-client",
        receiveDirection: "client-to-hub",
      },
    });
    const client = new SessionFrameChannel({
      sessionId: "session-document-01",
      noncePrefix: Buffer.from("11121314", "hex"),
      sendKey: clientKey,
      receiveKey: hubKey,
      sendDirection: "client-to-hub",
      receiveDirection: "hub-to-client",
    });
    const responseFrame = await router.route(
      client.encrypt(
        "document-request",
        Buffer.from(
          JSON.stringify({ request: { documentId: "doctor-doc-01" } }),
        ),
      ),
    );
    const response = JSON.parse(
      client.decrypt(responseFrame).plaintext.toString("utf8"),
    ) as { response: { contentBase64: string; documentId: string } };
    expect(response.response.documentId).toBe("doctor-doc-01");
    expect(response.response.contentBase64).toBe(
      Buffer.from("synthetic cv").toString("base64"),
    );
  });
});
