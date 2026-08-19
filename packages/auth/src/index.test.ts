import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import {
  AuthService,
  hasCapability,
  requireCapability,
  type SessionContext,
} from "./index.js";

function createDatabase() {
  return openDatabase({ filename: ":memory:", mode: "test" });
}

const bootstrapInput = {
  admins: [
    {
      username: "admin.primary",
      password: "Synthetic-Admin-Primary-2026!",
      displayNameEn: "Synthetic Primary Admin",
    },
    {
      username: "admin.backup",
      password: "Synthetic-Admin-Backup-2026!",
      displayNameEn: "Synthetic Backup Admin",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Hub",
    appVersion: "0.1.0-test",
  },
};

describe("Elite Step 2 authentication", () => {
  it("bootstraps exactly two Admin accounts and creates an active Hub device", async () => {
    const database = createDatabase();
    try {
      const service = new AuthService(database);
      const result = await service.bootstrapInitialAdmins(bootstrapInput);
      const counts = database.raw
        .prepare(
          "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM devices) AS devices",
        )
        .get() as { users: number; devices: number };

      expect(result.adminUserIds).toHaveLength(2);
      expect(counts.users).toBe(2);
      expect(counts.devices).toBe(1);
      expect(
        database.raw
          .prepare("SELECT status FROM devices WHERE id = ?")
          .get(result.hubDeviceId),
      ).toEqual({ status: "active" });
    } finally {
      database.close();
    }
  });

  it("authenticates a synthetic Admin with Argon2id and exposes capabilities", async () => {
    const database = createDatabase();
    try {
      const service = new AuthService(database);
      const result = await service.bootstrapInitialAdmins(bootstrapInput);
      const session = await service.login({
        username: "admin.primary",
        password: bootstrapInput.admins[0]!.password,
        deviceId: result.hubDeviceId,
      });

      expect(session.role).toBe("admin");
      expect(hasCapability(session, "device.manage")).toBe(true);
      expect(hasCapability(session, "clinical.approve")).toBe(false);
      expect(service.getSession(session.token).sessionId).toBe(
        session.sessionId,
      );
    } finally {
      database.close();
    }
  });

  it("uses the three-hour default and the Admin-configured session duration", async () => {
    const database = createDatabase();
    try {
      const service = new AuthService(database);
      const result = await service.bootstrapInitialAdmins(bootstrapInput);
      const defaultStartedAt = Date.now();
      const defaultSession = await service.login({
        username: "admin.primary",
        password: bootstrapInput.admins[0]!.password,
        deviceId: result.hubDeviceId,
      });
      const defaultDuration =
        Date.parse(defaultSession.expiresAt) - defaultStartedAt;
      expect(defaultDuration).toBeGreaterThan(179 * 60 * 1000);
      expect(defaultDuration).toBeLessThan(181 * 60 * 1000);

      const timestamp = new Date().toISOString();
      database.raw
        .prepare(
          `INSERT INTO org_settings
            (key, value, updated_at, updated_by_user_id)
           VALUES ('sessionTtlMinutes', '60', ?, ?)`,
        )
        .run(timestamp, result.adminUserIds[0]);
      const configuredStartedAt = Date.now();
      const configuredSession = await service.login({
        username: "admin.primary",
        password: bootstrapInput.admins[0]!.password,
        deviceId: result.hubDeviceId,
      });
      const configuredDuration =
        Date.parse(configuredSession.expiresAt) - configuredStartedAt;
      expect(configuredDuration).toBeGreaterThan(59 * 60 * 1000);
      expect(configuredDuration).toBeLessThan(61 * 60 * 1000);
    } finally {
      database.close();
    }
  });

  it("performs password verification for an unknown username", async () => {
    const database = createDatabase();
    const calls: Array<{ passwordHash: string; password: string }> = [];
    try {
      const service = new AuthService(database, {
        passwordVerifier: async (passwordHash, password) => {
          calls.push({ passwordHash, password });
          return false;
        },
      });
      const result = await service.bootstrapInitialAdmins(bootstrapInput);

      await expect(
        service.login({
          username: "missing.synthetic",
          password: "Synthetic-Missing-Password-2026!",
          deviceId: result.hubDeviceId,
        }),
      ).rejects.toThrow("ELITE_AUTH_INVALID_CREDENTIALS");

      expect(calls).toHaveLength(1);
      expect(calls[0]!.password).toBe("Synthetic-Missing-Password-2026!");
      expect(calls[0]!.passwordHash).toMatch(
        /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/,
      );
      const storedPassword = database.raw
        .prepare("SELECT password_hash FROM auth_credentials WHERE user_id = ?")
        .get(result.adminUserIds[0]) as { password_hash: string };
      expect(calls[0]!.passwordHash).not.toBe(storedPassword.password_hash);
    } finally {
      database.close();
    }
  });

  it("performs password verification before rejecting a locked account", async () => {
    const database = createDatabase();
    const calls: Array<{ passwordHash: string; password: string }> = [];
    try {
      const service = new AuthService(database, {
        passwordVerifier: async (passwordHash, password) => {
          calls.push({ passwordHash, password });
          return false;
        },
      });
      const result = await service.bootstrapInitialAdmins(bootstrapInput);
      database.raw
        .prepare(
          "UPDATE auth_credentials SET locked_until = ? WHERE user_id = ?",
        )
        .run("2099-01-01T00:00:00.000Z", result.adminUserIds[0]);

      await expect(
        service.login({
          username: "admin.primary",
          password: bootstrapInput.admins[0]!.password,
          deviceId: result.hubDeviceId,
        }),
      ).rejects.toThrow("ELITE_AUTH_ACCOUNT_LOCKED");

      expect(calls).toHaveLength(1);
      expect(calls[0]!.passwordHash).toMatch(
        /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/,
      );
      const storedPassword = database.raw
        .prepare("SELECT password_hash FROM auth_credentials WHERE user_id = ?")
        .get(result.adminUserIds[0]) as { password_hash: string };
      expect(calls[0]!.passwordHash).not.toBe(storedPassword.password_hash);
    } finally {
      database.close();
    }
  });

  it("rejects an unauthorized capability", () => {
    const doctorContext: SessionContext = {
      sessionId: "synthetic-session",
      token: "synthetic-token",
      userId: "synthetic-doctor",
      username: "doctor.synthetic",
      role: "doctor",
      deviceId: "synthetic-device",
      capabilities: ["clinical.read", "clinical.write", "clinical.approve"],
      expiresAt: "2099-01-01T00:00:00.000Z",
    };

    expect(() => requireCapability(doctorContext, "device.manage")).toThrow(
      "ELITE_AUTH_CAPABILITY_REQUIRED",
    );
  });

  it("requires Admin approval before a device becomes active and revokes its session", async () => {
    const database = createDatabase();
    try {
      const service = new AuthService(database);
      const result = await service.bootstrapInitialAdmins(bootstrapInput);
      const adminSession = await service.login({
        username: "admin.primary",
        password: bootstrapInput.admins[0]!.password,
        deviceId: result.hubDeviceId,
      });
      const enrollment = service.requestDeviceEnrollment(adminSession, {
        friendlyName: "Synthetic Android",
        platform: "android",
        appVersion: "0.1.0-test",
        apiLevel: 29,
        securityPatchLevel: "2026-07-05",
      });

      expect(enrollment.status).toBe("pending");
      expect(
        database.raw
          .prepare("SELECT status FROM devices WHERE id = ?")
          .get(enrollment.deviceId),
      ).toEqual({ status: "pending" });

      service.approveDevice(adminSession, enrollment.requestId);
      expect(
        database.raw
          .prepare("SELECT status FROM devices WHERE id = ?")
          .get(enrollment.deviceId),
      ).toEqual({ status: "active" });

      const androidSession = await service.login({
        username: "admin.primary",
        password: bootstrapInput.admins[0]!.password,
        deviceId: enrollment.deviceId,
      });
      service.revokeDevice(
        adminSession,
        enrollment.deviceId,
        "Synthetic revocation test",
      );
      expect(() => service.getSession(androidSession.token)).toThrow(
        "ELITE_AUTH_SESSION_INVALID",
      );
      expect(
        database.raw
          .prepare("SELECT status FROM devices WHERE id = ?")
          .get(enrollment.deviceId),
      ).toEqual({ status: "wipe-pending" });
    } finally {
      database.close();
    }
  });

  it("closes initial bootstrap after the first two Admins exist", async () => {
    const database = createDatabase();
    try {
      const service = new AuthService(database);
      await service.bootstrapInitialAdmins(bootstrapInput);
      await expect(
        service.bootstrapInitialAdmins(bootstrapInput),
      ).rejects.toThrow("ELITE_AUTH_BOOTSTRAP_CLOSED");
    } finally {
      database.close();
    }
  });
});
