import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import {
  AuthService,
  type SessionContext,
  SynchronizationService,
  type ExportSignaturePort,
} from "./index.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.sync.primary",
      password: "Synthetic-Sync-Primary-2026!",
      displayNameEn: "Synthetic Sync Primary",
    },
    {
      username: "admin.sync.backup",
      password: "Synthetic-Sync-Backup-2026!",
      displayNameEn: "Synthetic Sync Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Sync Hub",
    appVersion: "0.1.0-test",
  },
};

function syntheticSigner(): ExportSignaturePort {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  return {
    sign(data: Buffer) {
      return {
        publicKeyPem: publicKey,
        signature: sign(null, data, privateKey),
        keyId: "esk-sync-test-key",
        keyVersion: 1,
      };
    },
  };
}

function androidDevice(
  database: ReturnType<typeof openDatabase>,
  ownerUserId: string,
): void {
  const timestamp = "2030-03-01T00:00:00.000Z";
  database.raw
    .prepare(
      `INSERT INTO devices
       (id, friendly_name, platform, app_version, api_level, owner_user_id, status, created_at, updated_at)
       VALUES (?, ?, 'android', ?, ?, ?, 'active', ?, ?)`,
    )
    .run(
      "sync-android-device",
      "Synthetic Android Sync Device",
      "0.1.0-test",
      35,
      ownerUserId,
      timestamp,
      timestamp,
    );
}

function androidContext(admin: SessionContext): SessionContext {
  return {
    ...admin,
    deviceId: "sync-android-device",
  };
}

function syntheticPatientAndAppointment(
  database: ReturnType<typeof openDatabase>,
  userId: string,
): void {
  const timestamp = "2030-03-01T01:00:00.000Z";
  database.raw
    .prepare(
      `INSERT INTO patients
       (id, patient_id, name_en, name_ar, dob, sex, phone, national_id, status, created_at, created_by_user_id, updated_at, updated_by_user_id, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1)`,
    )
    .run(
      "sync-patient-row",
      "EL-00042",
      "Synthetic Sync Patient",
      "مريض مزامنة تجريبي",
      "1990-04-02",
      "unknown",
      "+201000000042",
      "29904021234567",
      timestamp,
      userId,
      timestamp,
      userId,
    );
  database.raw
    .prepare(
      `INSERT INTO appointments
       (id, patient_id, department_id, doctor_id, scheduled_start, scheduled_end, status, visit_type, is_walk_in, notes, created_at, created_by_user_id, updated_at, updated_by_user_id, version)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, 0, ?, ?, ?, ?, ?, 2)`,
    )
    .run(
      "sync-appointment-row",
      "sync-patient-row",
      "sync-department",
      userId,
      "2030-03-02T09:00:00.000Z",
      "2030-03-02T09:15:00.000Z",
      "Synthetic appointment",
      "Synthetic queue note must not leave the Hub",
      timestamp,
      userId,
      timestamp,
      userId,
    );
}

function syntheticBillingInvoice(
  database: ReturnType<typeof openDatabase>,
  userId: string,
): void {
  const timestamp = "2030-03-02T02:00:00.000Z";
  database.raw
    .prepare(
      `INSERT INTO billing_invoices
       (id, invoice_number, patient_id, currency, status, subtotal_egp, discount_egp, discount_reason, total_egp, created_at, created_by_user_id, updated_at, updated_by_user_id, version)
       VALUES (?, ?, ?, 'EGP', 'partially-paid', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "sync-billing-invoice",
      "EL-INV-000042",
      "sync-patient-row",
      1000,
      100,
      "Synthetic billing discount",
      900,
      timestamp,
      userId,
      timestamp,
      userId,
      4,
    );
  database.raw
    .prepare(
      `INSERT INTO billing_payments
       (id, invoice_id, amount_egp, method, reference, status, received_at, received_by_user_id, version)
       VALUES (?, ?, ?, 'cash', NULL, 'posted', ?, ?, 1)`,
    )
    .run(
      "sync-billing-payment",
      "sync-billing-invoice",
      300,
      timestamp,
      userId,
    );
}

describe("SynchronizationService", () => {
  it("authorizes scopes and emits minimum-necessary appointment deltas", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const admin = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      androidDevice(database, admin.userId);
      syntheticPatientAndAppointment(database, admin.userId);
      database.raw
        .prepare(
          `INSERT INTO appointments
           (id, patient_id, department_id, doctor_id, scheduled_start, scheduled_end, status, visit_type, is_walk_in, notes, created_at, created_by_user_id, updated_at, updated_by_user_id, version)
           VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, 0, ?, ?, ?, ?, ?, 3)`,
        )
        .run(
          "sync-appointment-row-2",
          "sync-patient-row",
          "sync-department",
          admin.userId,
          "2030-03-03T09:00:00.000Z",
          "2030-03-03T09:15:00.000Z",
          "Synthetic appointment two",
          "Synthetic second appointment",
          "2030-03-01T01:00:00.000Z",
          admin.userId,
          "2030-03-01T02:00:00.000Z",
          admin.userId,
        );
      const service = new SynchronizationService(
        database,
        syntheticSigner(),
        () => "2030-03-02T10:00:00.000Z",
      );
      const mobile = androidContext(admin);
      service.registerDevice(admin, {
        deviceId: "sync-android-device",
        enrollmentId: "sync-enrollment-1",
        organizationId: "elite-clinic",
        ownerUserId: admin.userId,
        policyVersion: 1,
        allowedScopes: ["appointments", "patient-summary"],
      });
      const capabilities = service.getCapabilities(mobile, {
        protocolVersion: 1,
        organizationId: "elite-clinic",
        deviceId: "sync-android-device",
        enrollmentId: "sync-enrollment-1",
        userId: admin.userId,
        clientVersion: "0.1.0-test",
        requestedScopes: ["appointments", "encounter-summary"],
        requestNonce: "nonce-capability-0001",
        requestedAt: "2030-03-02T10:00:00.000Z",
      });
      expect(capabilities.supportedScopes).toEqual(["appointments"]);
      const delta = service.getDelta(mobile, {
        protocolVersion: 1,
        organizationId: "elite-clinic",
        deviceId: "sync-android-device",
        userId: admin.userId,
        syncSessionId: "sync-session-0001",
        scope: "appointments",
        clientBaseVersion: 0,
        knownPolicyVersion: 1,
        requestNonce: "nonce-delta-0000001",
        requestedAt: "2030-03-02T10:00:00.000Z",
        maxChanges: 1,
      });
      expect(delta.changes).toHaveLength(1);
      expect(delta.hasMore).toBe(true);
      expect(delta.changes[0]).toMatchObject({
        resourceType: "Appointment",
        resourceId: "sync-appointment-row",
        operation: "upsert",
      });
      expect(delta.changes[0]?.payload).toMatchObject({
        patientId: "EL-00042",
        status: "scheduled",
      });
      expect(delta.changes[0]?.payload).not.toHaveProperty("notes");
      const replay = service.getDelta(mobile, {
        protocolVersion: 1,
        organizationId: "elite-clinic",
        deviceId: "sync-android-device",
        userId: admin.userId,
        syncSessionId: "sync-session-0001",
        scope: "appointments",
        cursor: delta.nextCursor,
        clientBaseVersion: 0,
        knownPolicyVersion: 1,
        requestNonce: "nonce-delta-0000002",
        requestedAt: "2030-03-02T10:00:00.000Z",
        maxChanges: 1,
      });
      expect(replay.changes).toHaveLength(1);
      expect(replay.hasMore).toBe(false);
      const complete = service.getDelta(mobile, {
        protocolVersion: 1,
        organizationId: "elite-clinic",
        deviceId: "sync-android-device",
        userId: admin.userId,
        syncSessionId: "sync-session-0001",
        scope: "appointments",
        cursor: replay.nextCursor,
        clientBaseVersion: 0,
        knownPolicyVersion: 1,
        requestNonce: "nonce-delta-0000003",
        requestedAt: "2030-03-02T10:00:00.000Z",
        maxChanges: 1,
      });
      expect(complete.changes).toEqual([]);
      expect(complete.hasMore).toBe(false);
    } finally {
      database.close();
    }
  });

  it("emits minimized billing summaries, advances cursors, and enforces billing-read access", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const admin = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      androidDevice(database, admin.userId);
      syntheticPatientAndAppointment(database, admin.userId);
      syntheticBillingInvoice(database, admin.userId);
      const service = new SynchronizationService(
        database,
        syntheticSigner(),
        () => "2030-03-02T10:00:00.000Z",
      );
      const mobile = androidContext(admin);
      service.registerDevice(admin, {
        deviceId: "sync-android-device",
        enrollmentId: "sync-enrollment-billing",
        organizationId: "elite-clinic",
        ownerUserId: admin.userId,
        policyVersion: 1,
        allowedScopes: ["billing-summary"],
      });
      const capabilities = service.getCapabilities(mobile, {
        protocolVersion: 1,
        organizationId: "elite-clinic",
        deviceId: "sync-android-device",
        enrollmentId: "sync-enrollment-billing",
        userId: admin.userId,
        clientVersion: "0.1.0-test",
        requestedScopes: ["billing-summary"],
        requestNonce: "nonce-billing-cap-0001",
        requestedAt: "2030-03-02T10:00:00.000Z",
      });
      expect(capabilities.supportedScopes).toEqual(["billing-summary"]);
      const delta = service.getDelta(mobile, {
        protocolVersion: 1,
        organizationId: "elite-clinic",
        deviceId: "sync-android-device",
        userId: admin.userId,
        syncSessionId: "sync-session-billing-1",
        scope: "billing-summary",
        clientBaseVersion: 0,
        knownPolicyVersion: 1,
        requestNonce: "nonce-billing-delta-0001",
        requestedAt: "2030-03-02T10:00:00.000Z",
      });
      expect(delta.changes).toHaveLength(1);
      expect(delta.changes[0]).toMatchObject({
        resourceType: "BillingInvoice",
        resourceId: "sync-billing-invoice",
        version: 4,
      });
      expect(delta.changes[0]?.payload).toMatchObject({
        invoiceNumber: "EL-INV-000042",
        patientId: "EL-00042",
        currency: "EGP",
        totalEgp: 900,
        paidEgp: 300,
        balanceEgp: 600,
      });
      expect(delta.changes[0]?.payload).not.toHaveProperty("discountReason");
      expect(delta.changes[0]?.payload).not.toHaveProperty("reference");
      expect(delta.changes[0]?.payload).not.toHaveProperty("paymentId");
      const replay = service.getDelta(mobile, {
        protocolVersion: 1,
        organizationId: "elite-clinic",
        deviceId: "sync-android-device",
        userId: admin.userId,
        syncSessionId: "sync-session-billing-1",
        scope: "billing-summary",
        cursor: delta.nextCursor,
        clientBaseVersion: 0,
        knownPolicyVersion: 1,
        requestNonce: "nonce-billing-delta-0002",
        requestedAt: "2030-03-02T10:00:00.000Z",
      });
      expect(replay.changes).toEqual([]);
      const withoutBillingRead = {
        ...mobile,
        capabilities: mobile.capabilities.filter(
          (capability) => capability !== "billing.read",
        ),
      };
      expect(() =>
        service.getDelta(withoutBillingRead, {
          protocolVersion: 1,
          organizationId: "elite-clinic",
          deviceId: "sync-android-device",
          userId: admin.userId,
          syncSessionId: "sync-session-billing-2",
          scope: "billing-summary",
          clientBaseVersion: 0,
          knownPolicyVersion: 1,
          requestNonce: "nonce-billing-denied-01",
          requestedAt: "2030-03-02T10:00:00.000Z",
        }),
      ).toThrow("billing summary requires billing-read capability");
    } finally {
      database.close();
    }
  });

  it("rejects unauthorized scopes and records idempotent outbox conflicts", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const admin = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      androidDevice(database, admin.userId);
      const service = new SynchronizationService(database, syntheticSigner());
      const mobile = androidContext(admin);
      service.registerDevice(admin, {
        deviceId: "sync-android-device",
        enrollmentId: "sync-enrollment-2",
        organizationId: "elite-clinic",
        ownerUserId: admin.userId,
        policyVersion: 1,
        allowedScopes: ["appointments"],
      });
      expect(() =>
        service.getDelta(mobile, {
          protocolVersion: 1,
          organizationId: "elite-clinic",
          deviceId: "sync-android-device",
          userId: admin.userId,
          syncSessionId: "sync-session-0002",
          scope: "clinical-notes",
          clientBaseVersion: 0,
          knownPolicyVersion: 1,
          requestNonce: "nonce-denied-00001",
          requestedAt: "2030-03-02T10:00:00.000Z",
        }),
      ).toThrow("ELITE_SYNC_SCOPE_DENIED");
      const queued = service.queueOutbox(mobile, {
        operationId: "sync-operation-0001",
        organizationId: "elite-clinic",
        deviceId: "sync-android-device",
        userId: admin.userId,
        scope: "appointments",
        operation: "appointment-acknowledge",
        resourceType: "Appointment",
        resourceId: "sync-appointment-row",
        baseVersion: 2,
        payload: { acknowledged: true },
        reason: "Synthetic appointment acknowledgment",
        createdAt: "2030-03-02T10:00:00.000Z",
      });
      expect(queued.operationId).toBe("sync-operation-0001");
      const acknowledgment = service.recordOutboxAcknowledgment(mobile, {
        operationId: "sync-operation-0001",
        state: "conflict",
        resourceType: "Appointment",
        resourceId: "sync-appointment-row",
        serverVersion: 3,
        conflict: {
          resourceType: "Appointment",
          resourceId: "sync-appointment-row",
          operationId: "sync-operation-0001",
          clientBaseVersion: 2,
          serverVersion: 3,
          conflictType: "version-mismatch",
          resolution: "refresh",
        },
        acknowledgmentHash: "a".repeat(64),
        acknowledgedAt: "2030-03-02T10:01:00.000Z",
      });
      expect(acknowledgment.state).toBe("conflict");
      expect(
        database.raw
          .prepare("SELECT state FROM sync_outbox WHERE operation_id = ?")
          .get("sync-operation-0001"),
      ).toMatchObject({ state: "conflict" });
      expect(
        database.raw
          .prepare(
            "SELECT count(*) AS count FROM clinical_sync_conflicts WHERE operation_id = ?",
          )
          .get("sync-operation-0001"),
      ).toMatchObject({ count: 1 });
    } finally {
      database.close();
    }
  });

  it("preserves the existing session context shape for typed integration fixtures", () => {
    const context: Partial<SessionContext> = {
      role: "admin",
      capabilities: ["sync.read", "sync.write", "sync.manage"],
    };
    expect(context.capabilities).toContain("sync.read");
  });
});
