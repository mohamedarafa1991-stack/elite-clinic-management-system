import {
  reportsAnalyticsSchema,
  type ReportsAnalytics,
  type ReportsPatientTrendPoint,
  type ReportsRevenuePoint,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";

type Row = Record<string, unknown>;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStart(key: string): Date {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1));
}

function addMonths(date: Date, count: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1),
  );
}

function toIso(date: Date): string {
  return date.toISOString();
}

function buildMonthKeys(referenceDate: Date, count: number): readonly string[] {
  const current = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
  );
  return Array.from({ length: count }, (_, index) =>
    monthKey(addMonths(current, index - count + 1)),
  );
}

export class ReportsService {
  public constructor(private readonly database: EliteDatabase) {}

  public getAnalytics(
    context: SessionContext,
    referenceDate: Date = new Date(),
    monthCount = 6,
  ): ReportsAnalytics {
    requireCapability(context, "reports.read");
    const safeMonthCount = Math.min(Math.max(Math.trunc(monthCount), 1), 24);
    const months = buildMonthKeys(referenceDate, safeMonthCount);

    const revenue: ReportsRevenuePoint[] = months.map((month) => {
      const from = toIso(monthStart(month));
      const to = toIso(addMonths(monthStart(month), 1));
      const invoices = this.database.raw
        .prepare(
          `SELECT COALESCE(SUM(total_egp), 0) AS invoiced
           FROM billing_invoices
           WHERE created_at >= ? AND created_at < ?`,
        )
        .get(from, to) as Row;
      const payments = this.database.raw
        .prepare(
          `SELECT COALESCE(SUM(amount_egp), 0) AS collected
           FROM billing_payments
           WHERE received_at >= ? AND received_at < ?
             AND status IN ('posted', 'refunded')`,
        )
        .get(from, to) as Row;
      const refunds = this.database.raw
        .prepare(
          `SELECT COALESCE(SUM(amount_egp), 0) AS refunded
           FROM billing_refunds
           WHERE refunded_at >= ? AND refunded_at < ?
             AND status = 'posted'`,
        )
        .get(from, to) as Row;
      return {
        month,
        invoicedEgp: Number(invoices["invoiced"]),
        collectedEgp: Number(payments["collected"]),
        refundedEgp: Number(refunds["refunded"]),
      };
    });

    const patientTrends: ReportsPatientTrendPoint[] = months.map((month) => {
      const from = toIso(monthStart(month));
      const to = toIso(addMonths(monthStart(month), 1));
      const patients = this.database.raw
        .prepare(
          `SELECT COUNT(*) AS new_patients
           FROM patients
           WHERE created_at >= ? AND created_at < ?`,
        )
        .get(from, to) as Row;
      const appointments = this.database.raw
        .prepare(
          `SELECT COUNT(*) AS appointments,
                  COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_visits
           FROM appointments
           WHERE scheduled_start >= ? AND scheduled_start < ?`,
        )
        .get(from, to) as Row;
      return {
        month,
        newPatients: Number(patients["new_patients"]),
        appointments: Number(appointments["appointments"]),
        completedVisits: Number(appointments["completed_visits"]),
      };
    });

    return reportsAnalyticsSchema.parse({
      fromMonth: months[0]!,
      toMonth: months[months.length - 1]!,
      revenue,
      patientTrends,
    });
  }
}
