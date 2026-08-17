import { randomBytes, randomUUID } from "node:crypto";
import {
  syncDeltaRequestSchema,
  syncOutboxInputSchema,
  type SyncDeltaRequest,
  type SyncDevicePolicy,
  type SyncOutboxInput,
  type SyncOutboxOperation,
  type SyncResourceType,
  type SyncScope,
} from "@elite/contracts";

export interface LocalOutboxEventInput {
  operationId: string;
  organizationId: string;
  deviceId: string;
  userId: string;
  scope: SyncScope;
  operation: SyncOutboxOperation;
  resourceType: SyncResourceType;
  resourceId: string;
  baseVersion: number;
  payload: Record<string, unknown>;
  reason: string;
  createdAt: string;
}

export function createSyncRequestNonce(): string {
  return randomBytes(24).toString("hex");
}

export function createSyncSessionId(): string {
  return `sync-${randomUUID()}`;
}

export function buildDeltaRequest(
  policy: SyncDevicePolicy,
  scope: SyncScope,
  cursor: string | undefined,
  syncSessionId = createSyncSessionId(),
  requestNonce = createSyncRequestNonce(),
  requestedAt = new Date().toISOString(),
  clientBaseVersion = 0,
  maxChanges = 500,
): SyncDeltaRequest {
  assertPolicyScope(policy, scope);
  return syncDeltaRequestSchema.parse({
    protocolVersion: 1,
    organizationId: policy.organizationId,
    deviceId: policy.deviceId,
    userId: policy.ownerUserId,
    syncSessionId,
    scope,
    cursor,
    clientBaseVersion,
    knownPolicyVersion: policy.policyVersion,
    requestNonce,
    requestedAt,
    maxChanges,
  });
}

export function buildOutboxRequest(
  event: LocalOutboxEventInput,
  policy: SyncDevicePolicy,
): SyncOutboxInput {
  if (event.organizationId !== policy.organizationId) {
    throw new Error("ELITE_LAN_OUTBOX_ORGANIZATION_MISMATCH");
  }
  if (event.deviceId !== policy.deviceId) {
    throw new Error("ELITE_LAN_OUTBOX_DEVICE_MISMATCH");
  }
  if (event.userId !== policy.ownerUserId) {
    throw new Error("ELITE_LAN_OUTBOX_USER_MISMATCH");
  }
  assertPolicyScope(policy, event.scope);
  return syncOutboxInputSchema.parse({
    operationId: event.operationId,
    organizationId: event.organizationId,
    deviceId: event.deviceId,
    userId: event.userId,
    scope: event.scope,
    operation: event.operation,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    baseVersion: event.baseVersion,
    payload: event.payload,
    reason: event.reason,
    createdAt: event.createdAt,
  });
}

function assertPolicyScope(policy: SyncDevicePolicy, scope: SyncScope): void {
  if (policy.state !== "active") {
    throw new Error("ELITE_LAN_DEVICE_POLICY_NOT_ACTIVE");
  }
  if (!policy.allowedScopes.includes(scope)) {
    throw new Error("ELITE_LAN_DEVICE_POLICY_SCOPE_DENIED");
  }
}
