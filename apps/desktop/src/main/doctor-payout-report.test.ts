import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BillingDoctorPayoutReport } from "@elite/contracts";
import {
  previousCairoReportMonth,
  renderDoctorPayoutCsv,
  writeDoctorPayoutCsv,
} from "./doctor-payout-report.js";

const report: BillingDoctorPayoutReport = {
  reportMonth: "2026-07",
  generatedAt: "2026-08-01T05:00:00.000Z",
  generatedBy: "admin",
  rows: [
    {
      reportMonth: "2026-07",
      doctorId: "synthetic-doctor-report",
      doctorNameEn: "Dr. Salma, Synthetic",
      doctorNameAr: "د. سلمى التجريبية",
      collectedEgp: 500,
      refundedEgp: 100,
      doctorEarningsEgp: 240,
      clinicRetainedEgp: 160,
      invoiceCount: 1,
    },
  ],
  totals: {
    collectedEgp: 500,
    refundedEgp: 100,
    doctorEarningsEgp: 240,
    clinicRetainedEgp: 160,
    invoiceCount: 1,
  },
};

describe("doctor payout report helper", () => {
  it("selects the previous Cairo calendar month", () => {
    expect(previousCairoReportMonth(new Date("2026-08-01T03:30:00.000Z"))).toBe(
      "2026-07",
    );
    expect(previousCairoReportMonth(new Date("2026-01-01T04:00:00.000Z"))).toBe(
      "2025-12",
    );
  });

  it("renders an Excel-compatible escaped CSV with a total row", () => {
    const csv = renderDoctorPayoutCsv(report);
    expect(csv.startsWith("\ufeffreport_month,doctor_id")).toBe(true);
    expect(csv).toContain('"Dr. Salma, Synthetic"');
    expect(csv).toContain(
      "2026-07,TOTAL,All active doctors,,500,100,240,160,1",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("writes a deterministic monthly file atomically", () => {
    const directory = mkdtempSync(join(tmpdir(), "elite-payout-report-test-"));
    try {
      const result = writeDoctorPayoutCsv(report, directory);
      expect(result.fileName).toBe("doctor-payouts-2026-07.csv");
      expect(readFileSync(result.filePath, "utf8")).toContain("doctor_id");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
