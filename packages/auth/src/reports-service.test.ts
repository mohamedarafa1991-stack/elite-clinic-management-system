import { describe, expect, it } from "vitest";
import { openDatabase } from "@elite/database";
import { AuthService, type SessionContext } from "./index.js";
import { ReportsService } from "./reports-service.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.reports.primary",
      password: "Synthetic-Reports-Primary-2026!",
      displayNameEn: "Synthetic Reports Primary",
    },
    {
      username: "admin.reports.backup",
      password: "Synthetic-Reports-Backup-2026!",
      displayNameEn: "Synthetic Reports Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Reports Hub",
    appVersion: "0.1.0-test",
  },
};

describe("ReportsService", () => {
  it("returns monthly aggregate revenue and patient trends for Admins", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const context = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      const analytics = new ReportsService(database).getAnalytics(
        context,
        new Date("2026-08-21T10:00:00.000Z"),
        6,
      );
      expect(analytics.fromMonth).toBe("2026-03");
      expect(analytics.toMonth).toBe("2026-08");
      expect(analytics.revenue).toHaveLength(6);
      expect(analytics.patientTrends).toHaveLength(6);
      expect(analytics.revenue.every((point) => point.invoicedEgp === 0)).toBe(
        true,
      );
    } finally {
      database.close();
    }
  });

  it("denies reports to a front desk context", async () => {
    const database = openDatabase({ filename: ":memory:", mode: "test" });
    try {
      const auth = new AuthService(database);
      const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
      const adminContext = await auth.login({
        username: bootstrapInput.admins[0]!.username,
        password: bootstrapInput.admins[0]!.password,
        deviceId: bootstrap.hubDeviceId,
      });
      const receptionistContext: SessionContext = {
        ...adminContext,
        role: "receptionist",
        capabilities: [
          "patient.read",
          "patient.write",
          "appointment.read",
          "appointment.write",
          "billing.read",
          "billing.write",
          "billing.refund",
        ],
      };
      expect(() =>
        new ReportsService(database).getAnalytics(receptionistContext),
      ).toThrow("ELITE_AUTH_CAPABILITY_REQUIRED: reports.read");
    } finally {
      database.close();
    }
  });
});
