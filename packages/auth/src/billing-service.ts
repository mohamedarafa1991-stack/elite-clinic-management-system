import { nanoid } from "nanoid";
import {
  billingInvoiceCreateInputSchema,
  billingDashboardSummarySchema,
  billingDoctorCompensationRuleInputSchema,
  billingDoctorCompensationRuleSchema,
  billingDoctorPayoutReportSchema,
  billingInvoiceSchema,
  doctorEarningsAnalyticsSchema,
  billingPackageInputSchema,
  billingPackageSchema,
  billingPaymentInputSchema,
  billingPaymentSchema,
  billingReceiptSchema,
  billingRefundInputSchema,
  billingRefundSchema,
  type BillingDashboardSummary,
  type BillingDoctorCompensationRule,
  type BillingDoctorCompensationRuleInput,
  type BillingDoctorPayoutReport,
  type BillingDoctorPayoutReportInput,
  type BillingInvoice,
  type DoctorEarningsAnalytics,
  type BillingInvoiceCreateInput,
  type BillingPackage,
  type BillingPayment,
  type BillingReceipt,
  type BillingRefund,
} from "@elite/contracts";
import type { EliteDatabase } from "@elite/database";
import { requireCapability, type SessionContext } from "./index.js";

type Row = any;

function now(): string {
  return new Date().toISOString();
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function cairoMonthStart(reportMonth: string): Date {
  const [yearText, monthText] = reportMonth.split("-");
  const utcGuess = Date.UTC(Number(yearText), Number(monthText) - 1, 1);
  const offsetLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    timeZoneName: "shortOffset",
  })
    .formatToParts(new Date(utcGuess))
    .find((part) => part.type === "timeZoneName")?.value;
  const match = offsetLabel?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(
      "ELITE_BILLING_PAYOUT_REPORT_TIMEZONE_UNAVAILABLE: Cairo timezone offset could not be resolved",
    );
  }
  const offsetMinutes =
    (Number(match[2]) * 60 + Number(match[3] ?? 0)) *
    (match[1] === "-" ? -1 : 1);
  return new Date(utcGuess - offsetMinutes * 60_000);
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

export class BillingService {
  public constructor(private readonly database: EliteDatabase) {}

  public listPackages(context: SessionContext): readonly BillingPackage[] {
    requireCapability(context, "billing.read");
    return (
      this.database.raw
        .prepare("SELECT * FROM billing_packages ORDER BY status, name_en")
        .all() as Row[]
    ).map((row) => this.mapPackage(row));
  }

  public createPackage(
    context: SessionContext,
    input: unknown,
  ): BillingPackage {
    requireCapability(context, "module.manage");
    const parsed = billingPackageInputSchema.parse(input);
    const timestamp = now();
    const id = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      for (const item of parsed.items) {
        const service = this.database.raw
          .prepare("SELECT id FROM services WHERE id = ? AND status = 'active'")
          .get(item.serviceId);
        if (!service) {
          throw new Error(
            "ELITE_BILLING_SERVICE_NOT_ACTIVE: package service is unavailable",
          );
        }
      }
      this.database.raw
        .prepare(
          `INSERT INTO billing_packages
           (id, code, name_en, name_ar, price_egp, validity_days, status,
            created_at, created_by_user_id, updated_at, updated_by_user_id, version)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1)`,
        )
        .run(
          id,
          parsed.code,
          parsed.nameEn,
          parsed.nameAr ?? null,
          parsed.priceEgp,
          parsed.validityDays ?? null,
          timestamp,
          context.userId,
          timestamp,
          context.userId,
        );
      const insertItem = this.database.raw.prepare(
        "INSERT INTO billing_package_items (id, package_id, service_id, quantity) VALUES (?, ?, ?, ?)",
      );
      for (const item of parsed.items) {
        insertItem.run(nanoid(18), id, item.serviceId, item.quantity);
      }
    });
    transaction();
    this.writeAudit(context, "billing.package.created", id, {
      code: parsed.code,
      priceEgp: parsed.priceEgp,
      itemCount: parsed.items.length,
    });
    return this.getPackage(context, id);
  }

  public archivePackage(
    context: SessionContext,
    packageId: string,
    reason: string,
  ): void {
    requireCapability(context, "module.manage");
    if (reason.trim().length < 3) {
      throw new Error(
        "ELITE_BILLING_REASON_REQUIRED: archive reason is required",
      );
    }
    const result = this.database.raw
      .prepare(
        "UPDATE billing_packages SET status = 'archived', updated_at = ?, updated_by_user_id = ?, version = version + 1 WHERE id = ? AND status = 'active'",
      )
      .run(now(), context.userId, packageId);
    if (result.changes !== 1) {
      throw new Error(
        "ELITE_BILLING_PACKAGE_NOT_ACTIVE: package is unavailable",
      );
    }
    this.writeAudit(context, "billing.package.archived", packageId, { reason });
  }

  public listCompensationRules(
    context: SessionContext,
    doctorId?: string,
  ): readonly BillingDoctorCompensationRule[] {
    requireCapability(context, "billing.compensation.manage");
    if (context.role !== "admin") {
      throw new Error(
        "ELITE_BILLING_COMPENSATION_ADMIN_REQUIRED: only Admins may view compensation rules",
      );
    }
    const rows = doctorId
      ? (this.database.raw
          .prepare(
            `SELECT r.*, u.display_name_en AS doctor_name_en, s.name_en AS service_name_en
             FROM billing_doctor_compensation_rules r
             JOIN users u ON u.id = r.doctor_id
             JOIN services s ON s.id = r.service_id
             WHERE r.doctor_id = ?
             ORDER BY r.doctor_id, r.service_id, r.effective_from DESC`,
          )
          .all(doctorId) as Row[])
      : (this.database.raw
          .prepare(
            `SELECT r.*, u.display_name_en AS doctor_name_en, s.name_en AS service_name_en
             FROM billing_doctor_compensation_rules r
             JOIN users u ON u.id = r.doctor_id
             JOIN services s ON s.id = r.service_id
             ORDER BY u.display_name_en, s.name_en, r.effective_from DESC`,
          )
          .all() as Row[]);
    return rows.map((row) => this.mapCompensationRule(row));
  }

  public createCompensationRule(
    context: SessionContext,
    input: unknown,
  ): BillingDoctorCompensationRule {
    requireCapability(context, "billing.compensation.manage");
    if (context.role !== "admin") {
      throw new Error(
        "ELITE_BILLING_COMPENSATION_ADMIN_REQUIRED: only Admins may manage compensation rules",
      );
    }
    const parsed = billingDoctorCompensationRuleInputSchema.parse(input);
    if (
      parsed.compensationType === "fixed" &&
      parsed.shareAmountEgp! > parsed.feeEgp
    ) {
      throw new Error(
        "ELITE_BILLING_COMPENSATION_INVALID: fixed share cannot exceed the doctor fee",
      );
    }
    const timestamp = now();
    const ruleId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      const doctor = this.database.raw
        .prepare(
          "SELECT id FROM users WHERE id = ? AND role = 'doctor' AND is_active = 1",
        )
        .get(parsed.doctorId) as Row | undefined;
      if (!doctor) {
        throw new Error(
          "ELITE_BILLING_DOCTOR_NOT_ACTIVE: doctor is unavailable",
        );
      }
      const service = this.database.raw
        .prepare("SELECT id FROM services WHERE id = ? AND status = 'active'")
        .get(parsed.serviceId) as Row | undefined;
      if (!service) {
        throw new Error(
          "ELITE_BILLING_SERVICE_NOT_ACTIVE: service is unavailable",
        );
      }
      this.database.raw
        .prepare(
          `UPDATE billing_doctor_compensation_rules
           SET effective_to = ?
           WHERE doctor_id = ? AND service_id = ? AND effective_to IS NULL AND effective_from < ?`,
        )
        .run(
          parsed.effectiveFrom,
          parsed.doctorId,
          parsed.serviceId,
          parsed.effectiveFrom,
        );
      const overlap = this.database.raw
        .prepare(
          `SELECT id FROM billing_doctor_compensation_rules
           WHERE doctor_id = ? AND service_id = ?
             AND effective_from < COALESCE(?, '9999-12-31T23:59:59.999Z')
             AND COALESCE(effective_to, '9999-12-31T23:59:59.999Z') > ?
           LIMIT 1`,
        )
        .get(
          parsed.doctorId,
          parsed.serviceId,
          parsed.effectiveTo ?? null,
          parsed.effectiveFrom,
        ) as Row | undefined;
      if (overlap) {
        throw new Error(
          "ELITE_BILLING_COMPENSATION_OVERLAP: compensation rule overlaps an existing effective period",
        );
      }
      this.database.raw
        .prepare(
          `INSERT INTO billing_doctor_compensation_rules
           (id, doctor_id, service_id, fee_egp, compensation_type, share_bps,
            share_amount_egp, effective_from, effective_to, created_at, created_by_user_id, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          ruleId,
          parsed.doctorId,
          parsed.serviceId,
          parsed.feeEgp,
          parsed.compensationType,
          parsed.shareBps ?? null,
          parsed.shareAmountEgp ?? null,
          parsed.effectiveFrom,
          parsed.effectiveTo ?? null,
          timestamp,
          context.userId,
        );
    });
    transaction();
    this.writeAudit(context, "billing.compensation-rule.created", ruleId, {
      doctorId: parsed.doctorId,
      serviceId: parsed.serviceId,
      feeEgp: parsed.feeEgp,
      compensationType: parsed.compensationType,
      effectiveFrom: parsed.effectiveFrom,
      effectiveTo: parsed.effectiveTo,
    });
    return this.getCompensationRule(context, ruleId);
  }

  public getDoctorEarnings(
    context: SessionContext,
    doctorId = context.userId,
    referenceDate: Date = new Date(),
    monthCount = 6,
  ): DoctorEarningsAnalytics {
    requireCapability(context, "billing.earnings.read");
    if (context.role !== "admin" && context.role !== "doctor") {
      throw new Error(
        "ELITE_BILLING_EARNINGS_ROLE_REQUIRED: only Doctors and Admins may view earnings",
      );
    }
    if (context.role === "doctor" && doctorId !== context.userId) {
      throw new Error(
        "ELITE_BILLING_EARNINGS_OWNER_REQUIRED: doctors may view only their own earnings",
      );
    }
    const doctor = this.database.raw
      .prepare(
        "SELECT id, display_name_en FROM users WHERE id = ? AND role = 'doctor'",
      )
      .get(doctorId) as Row | undefined;
    if (!doctor) {
      throw new Error("ELITE_BILLING_DOCTOR_NOT_FOUND: doctor does not exist");
    }
    const safeMonthCount = Math.min(Math.max(Math.trunc(monthCount), 1), 24);
    const current = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
    );
    const months = Array.from({ length: safeMonthCount }, (_, index) => {
      const start = new Date(
        Date.UTC(
          current.getUTCFullYear(),
          current.getUTCMonth() + index - safeMonthCount + 1,
          1,
        ),
      );
      return {
        key: monthKey(start),
        from: start.toISOString(),
        to: nextMonth(start).toISOString(),
      };
    });
    const monthly = months.map((month) => {
      const row = this.database.raw
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN event_type = 'payment' THEN allocated_amount_egp ELSE 0 END), 0) AS collected,
             COALESCE(SUM(CASE WHEN event_type = 'refund' THEN allocated_amount_egp ELSE 0 END), 0) AS refunded,
             COALESCE(SUM(CASE WHEN event_type = 'payment' THEN amount_egp ELSE -amount_egp END), 0) AS earnings,
             COUNT(DISTINCT invoice_id) AS invoice_count
           FROM billing_doctor_earnings
           WHERE doctor_id = ? AND event_at >= ? AND event_at < ?`,
        )
        .get(doctorId, month.from, month.to) as Row;
      const collectedEgp = Number(row.collected);
      const refundedEgp = Number(row.refunded);
      const earningsEgp = Number(row.earnings);
      return {
        month: month.key,
        collectedEgp,
        refundedEgp,
        earningsEgp,
        clinicRetainedEgp: collectedEgp - refundedEgp - earningsEgp,
        invoiceCount: Number(row.invoice_count),
      };
    });
    return doctorEarningsAnalyticsSchema.parse({
      doctorId,
      doctorNameEn: String(doctor.display_name_en),
      fromMonth: months[0]!.key,
      toMonth: months[months.length - 1]!.key,
      monthly,
    });
  }

  public generateDoctorPayoutReport(
    context: SessionContext,
    input: BillingDoctorPayoutReportInput,
    generatedBy: "admin" | "scheduled" = "admin",
  ): BillingDoctorPayoutReport {
    requireCapability(context, "billing.payout.report");
    if (context.role !== "admin") {
      throw new Error(
        "ELITE_BILLING_PAYOUT_REPORT_ADMIN_REQUIRED: only Admins may generate payout reports",
      );
    }
    const start = cairoMonthStart(input.reportMonth);
    const [yearText, monthText] = input.reportMonth.split("-");
    const end = cairoMonthStart(
      monthKey(new Date(Date.UTC(Number(yearText), Number(monthText), 1))),
    );
    const from = start.toISOString();
    const to = end.toISOString();
    const rows = this.database.raw
      .prepare(
        `SELECT
           u.id AS doctor_id,
           u.display_name_en AS doctor_name_en,
           u.display_name_ar AS doctor_name_ar,
           COALESCE(SUM(CASE WHEN e.event_type = 'payment' THEN e.allocated_amount_egp ELSE 0 END), 0) AS collected,
           COALESCE(SUM(CASE WHEN e.event_type = 'refund' THEN e.allocated_amount_egp ELSE 0 END), 0) AS refunded,
           COALESCE(SUM(CASE WHEN e.event_type = 'payment' THEN e.amount_egp ELSE -e.amount_egp END), 0) AS doctor_earnings,
           COUNT(DISTINCT e.invoice_id) AS invoice_count
         FROM users u
         LEFT JOIN billing_doctor_earnings e
           ON e.doctor_id = u.id AND e.event_at >= ? AND e.event_at < ?
         WHERE u.role = 'doctor' AND u.is_active = 1
         GROUP BY u.id, u.display_name_en, u.display_name_ar
         ORDER BY u.display_name_en`,
      )
      .all(from, to) as Row[];
    const reportRows = rows.map((row) => {
      const collectedEgp = Number(row.collected);
      const refundedEgp = Number(row.refunded);
      const doctorEarningsEgp = Number(row.doctor_earnings);
      return {
        reportMonth: input.reportMonth,
        doctorId: String(row.doctor_id),
        doctorNameEn: String(row.doctor_name_en),
        ...(optionalString(row.doctor_name_ar)
          ? { doctorNameAr: String(row.doctor_name_ar) }
          : {}),
        collectedEgp,
        refundedEgp,
        doctorEarningsEgp,
        clinicRetainedEgp: collectedEgp - refundedEgp - doctorEarningsEgp,
        invoiceCount: Number(row.invoice_count),
      };
    });
    const invoiceCount = Number(
      (
        this.database.raw
          .prepare(
            "SELECT COUNT(DISTINCT invoice_id) AS invoice_count FROM billing_doctor_earnings WHERE event_at >= ? AND event_at < ?",
          )
          .get(from, to) as Row
      ).invoice_count,
    );
    const totals = reportRows.reduce(
      (result, row) => ({
        collectedEgp: result.collectedEgp + row.collectedEgp,
        refundedEgp: result.refundedEgp + row.refundedEgp,
        doctorEarningsEgp: result.doctorEarningsEgp + row.doctorEarningsEgp,
        clinicRetainedEgp: result.clinicRetainedEgp + row.clinicRetainedEgp,
        invoiceCount: result.invoiceCount,
      }),
      {
        collectedEgp: 0,
        refundedEgp: 0,
        doctorEarningsEgp: 0,
        clinicRetainedEgp: 0,
        invoiceCount,
      },
    );
    const report = billingDoctorPayoutReportSchema.parse({
      reportMonth: input.reportMonth,
      generatedAt: now(),
      generatedBy,
      rows: reportRows,
      totals,
    });
    this.writeAuditWithoutContext(
      "billing.doctor-payout-report.generated",
      input.reportMonth,
      {
        generatedBy,
        doctorCount: report.rows.length,
        totals: report.totals,
      },
      generatedBy === "admin" ? context : undefined,
    );
    return report;
  }

  public createInvoice(
    context: SessionContext,
    input: BillingInvoiceCreateInput,
  ): BillingInvoice {
    requireCapability(context, "billing.write");
    const parsed = billingInvoiceCreateInputSchema.parse(input);
    const timestamp = now();
    const invoiceId = nanoid(18);
    let invoiceNumber = "";
    const patient = this.database.raw
      .prepare(
        "SELECT id, patient_id FROM patients WHERE patient_id = ? AND status = 'active'",
      )
      .get(parsed.patientId) as Row | undefined;
    if (!patient) {
      throw new Error(
        "ELITE_BILLING_PATIENT_NOT_ACTIVE: patient is unavailable",
      );
    }
    let appointmentDoctorId: string | undefined;
    if (parsed.appointmentId) {
      const appointment = this.database.raw
        .prepare("SELECT patient_id, doctor_id FROM appointments WHERE id = ?")
        .get(parsed.appointmentId) as Row | undefined;
      if (!appointment || appointment.patient_id !== patient.id) {
        throw new Error(
          "ELITE_BILLING_APPOINTMENT_MISMATCH: appointment is not for this patient",
        );
      }
      appointmentDoctorId = appointment.doctor_id
        ? String(appointment.doctor_id)
        : undefined;
    }

    const lines = parsed.lines.map((line) =>
      this.resolveInvoiceLine(line, appointmentDoctorId, timestamp),
    );
    const subtotalEgp = lines.reduce((sum, line) => sum + line.lineTotalEgp, 0);
    if (parsed.discountEgp > subtotalEgp) {
      throw new Error(
        "ELITE_BILLING_DISCOUNT_EXCEEDS_TOTAL: discount exceeds invoice subtotal",
      );
    }
    if (parsed.discountEgp > 0 && !parsed.discountReason) {
      throw new Error(
        "ELITE_BILLING_DISCOUNT_REASON_REQUIRED: discount reason is required",
      );
    }
    const totalEgp = subtotalEgp - parsed.discountEgp;
    const transaction = this.database.raw.transaction(() => {
      invoiceNumber = this.nextNumber("invoice", "EL-INV");
      this.database.raw
        .prepare(
          `INSERT INTO billing_invoices
           (id, invoice_number, patient_id, appointment_id, currency, status,
            subtotal_egp, discount_egp, discount_reason, total_egp,
            created_at, created_by_user_id, updated_at, updated_by_user_id, version)
           VALUES (?, ?, ?, ?, 'EGP', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          invoiceId,
          invoiceNumber,
          patient.id,
          parsed.appointmentId ?? null,
          totalEgp === 0 ? "paid" : "open",
          subtotalEgp,
          parsed.discountEgp,
          parsed.discountReason ?? null,
          totalEgp,
          timestamp,
          context.userId,
          timestamp,
          context.userId,
        );
      const insertLine = this.database.raw.prepare(
        `INSERT INTO billing_invoice_lines
         (id, invoice_id, service_id, package_id, quantity, description_en, unit_price_egp, line_total_egp,
          doctor_id, doctor_fee_egp, compensation_type, compensation_share_bps, compensation_share_amount_egp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const line of lines) {
        insertLine.run(
          nanoid(18),
          invoiceId,
          line.serviceId ?? null,
          line.packageId ?? null,
          line.quantity,
          line.descriptionEn,
          line.unitPriceEgp,
          line.lineTotalEgp,
          line.doctorId ?? null,
          line.doctorFeeEgp ?? null,
          line.compensationType ?? null,
          line.compensationShareBps ?? null,
          line.compensationShareAmountEgp ?? null,
        );
      }
    });
    transaction();
    this.writeAudit(context, "billing.invoice.created", invoiceId, {
      invoiceNumber,
      patientId: parsed.patientId,
      totalEgp,
      discountEgp: parsed.discountEgp,
    });
    return this.getInvoice(context, invoiceId);
  }

  public getDashboardSummary(
    context: SessionContext,
    referenceDate: Date = new Date(),
  ): BillingDashboardSummary {
    requireCapability(context, "billing.read");
    const start = monthStart(referenceDate);
    const end = nextMonth(start);
    const from = start.toISOString();
    const to = end.toISOString();
    const rows = this.database.raw
      .prepare(
        `SELECT i.*, p.patient_id AS patient_display_id
         FROM billing_invoices i
         JOIN patients p ON p.id = i.patient_id
         WHERE i.created_at >= ? AND i.created_at < ?
         ORDER BY i.created_at DESC`,
      )
      .all(from, to) as Row[];
    const invoices = rows.map((row) => this.mapInvoice(context, row));
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
    return billingDashboardSummarySchema.parse({
      month: monthKey(start),
      invoicedEgp: invoices.reduce((sum, invoice) => sum + invoice.totalEgp, 0),
      collectedEgp: Math.max(
        0,
        Number(payments.collected) - Number(refunds.refunded),
      ),
      refundedEgp: Number(refunds.refunded),
      outstandingEgp: invoices.reduce(
        (sum, invoice) => sum + invoice.balanceEgp,
        0,
      ),
      invoiceCount: invoices.length,
      openInvoiceCount: invoices.filter((invoice) =>
        ["open", "partially-paid"].includes(invoice.status),
      ).length,
      recentInvoices: invoices.slice(0, 8).map((invoice) => ({
        invoiceNumber: invoice.invoiceNumber,
        patientId: invoice.patientId,
        status: invoice.status,
        totalEgp: invoice.totalEgp,
        balanceEgp: invoice.balanceEgp,
        createdAt: invoice.createdAt,
      })),
    });
  }

  public listInvoices(
    context: SessionContext,
    patientId?: string,
  ): readonly BillingInvoice[] {
    requireCapability(context, "billing.read");
    const rows = patientId
      ? (this.database.raw
          .prepare(
            "SELECT i.* FROM billing_invoices i JOIN patients p ON p.id = i.patient_id WHERE p.patient_id = ? ORDER BY i.created_at DESC LIMIT 200",
          )
          .all(patientId) as Row[])
      : (this.database.raw
          .prepare(
            "SELECT * FROM billing_invoices ORDER BY created_at DESC LIMIT 200",
          )
          .all() as Row[]);
    return rows.map((row) => this.mapInvoice(context, row));
  }

  public getInvoice(
    context: SessionContext,
    invoiceId: string,
  ): BillingInvoice {
    requireCapability(context, "billing.read");
    const row = this.database.raw
      .prepare(
        "SELECT i.*, p.patient_id AS patient_display_id FROM billing_invoices i JOIN patients p ON p.id = i.patient_id WHERE i.id = ?",
      )
      .get(invoiceId) as Row | undefined;
    if (!row) {
      throw new Error(
        "ELITE_BILLING_INVOICE_NOT_FOUND: invoice does not exist",
      );
    }
    return this.mapInvoice(context, row);
  }

  public postPayment(
    context: SessionContext,
    input: unknown,
  ): {
    payment: BillingPayment;
    receipt: BillingReceipt;
    invoice: BillingInvoice;
  } {
    requireCapability(context, "billing.write");
    const parsed = billingPaymentInputSchema.parse(input);
    const timestamp = now();
    const paymentId = nanoid(18);
    const receiptId = nanoid(18);
    let receiptNumber = "";
    const transaction = this.database.raw.transaction(() => {
      receiptNumber = this.nextNumber("receipt", "EL-REC");
      const invoice = this.getInvoiceTotals(parsed.invoiceId);
      if (!invoice) {
        throw new Error(
          "ELITE_BILLING_INVOICE_NOT_FOUND: invoice does not exist",
        );
      }
      if (["voided", "refunded"].includes(invoice.status)) {
        throw new Error(
          "ELITE_BILLING_INVOICE_CLOSED: invoice cannot accept payment",
        );
      }
      if (parsed.amountEgp > invoice.balanceEgp) {
        throw new Error(
          "ELITE_BILLING_PAYMENT_EXCEEDS_BALANCE: payment exceeds balance",
        );
      }
      this.database.raw
        .prepare(
          `INSERT INTO billing_payments
           (id, invoice_id, amount_egp, method, reference, status, received_at, received_by_user_id, version)
           VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, 1)`,
        )
        .run(
          paymentId,
          parsed.invoiceId,
          parsed.amountEgp,
          parsed.method,
          parsed.reference ?? null,
          timestamp,
          context.userId,
        );
      this.database.raw
        .prepare(
          `INSERT INTO billing_receipts
           (id, receipt_number, invoice_id, payment_id, amount_egp, issued_at, issued_by_user_id, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'issued')`,
        )
        .run(
          receiptId,
          receiptNumber,
          parsed.invoiceId,
          paymentId,
          parsed.amountEgp,
          timestamp,
          context.userId,
        );
      this.recordPaymentEarnings(
        paymentId,
        parsed.invoiceId,
        parsed.amountEgp,
        timestamp,
      );
      this.reconcileInvoice(parsed.invoiceId, timestamp, context.userId);
    });
    transaction();
    this.writeAudit(context, "billing.payment.posted", paymentId, {
      invoiceId: parsed.invoiceId,
      amountEgp: parsed.amountEgp,
      method: parsed.method,
      receiptNumber,
    });
    return {
      payment: this.getPayment(context, paymentId),
      receipt: this.getReceipt(context, receiptId),
      invoice: this.getInvoice(context, parsed.invoiceId),
    };
  }

  public refundPayment(
    context: SessionContext,
    input: unknown,
  ): { refund: BillingRefund; invoice: BillingInvoice } {
    requireCapability(context, "billing.refund");
    const parsed = billingRefundInputSchema.parse(input);
    const timestamp = now();
    const refundId = nanoid(18);
    const transaction = this.database.raw.transaction(() => {
      const payment = this.database.raw
        .prepare("SELECT * FROM billing_payments WHERE id = ?")
        .get(parsed.paymentId) as Row | undefined;
      if (
        !payment ||
        payment.status === "voided" ||
        payment.status === "refunded"
      ) {
        throw new Error(
          "ELITE_BILLING_PAYMENT_NOT_REFUNDABLE: payment is unavailable",
        );
      }
      const refunded = this.database.raw
        .prepare(
          "SELECT COALESCE(SUM(amount_egp), 0) AS total FROM billing_refunds WHERE payment_id = ? AND status = 'posted'",
        )
        .get(parsed.paymentId) as Row;
      const remaining = Number(payment.amount_egp) - Number(refunded.total);
      if (parsed.amountEgp > remaining) {
        throw new Error(
          "ELITE_BILLING_REFUND_EXCEEDS_PAYMENT: refund exceeds refundable amount",
        );
      }
      this.database.raw
        .prepare(
          `INSERT INTO billing_refunds
           (id, payment_id, amount_egp, reason, status, refunded_at, refunded_by_user_id)
           VALUES (?, ?, ?, ?, 'posted', ?, ?)`,
        )
        .run(
          refundId,
          parsed.paymentId,
          parsed.amountEgp,
          parsed.reason,
          timestamp,
          context.userId,
        );
      this.recordRefundEarnings(
        refundId,
        parsed.paymentId,
        parsed.amountEgp,
        timestamp,
      );
      if (parsed.amountEgp === remaining) {
        this.database.raw
          .prepare(
            "UPDATE billing_payments SET status = 'refunded', version = version + 1 WHERE id = ?",
          )
          .run(parsed.paymentId);
        this.database.raw
          .prepare(
            "UPDATE billing_receipts SET status = 'voided' WHERE payment_id = ?",
          )
          .run(parsed.paymentId);
      }
      this.reconcileInvoice(
        String(payment.invoice_id),
        timestamp,
        context.userId,
      );
    });
    transaction();
    this.writeAudit(context, "billing.payment.refunded", refundId, {
      paymentId: parsed.paymentId,
      amountEgp: parsed.amountEgp,
      reason: parsed.reason,
    });
    const refund = this.database.raw
      .prepare("SELECT * FROM billing_refunds WHERE id = ?")
      .get(refundId) as Row;
    return {
      refund: billingRefundSchema.parse({
        id: String(refund.id),
        paymentId: String(refund.payment_id),
        amountEgp: Number(refund.amount_egp),
        reason: String(refund.reason),
        status: refund.status,
        refundedAt: String(refund.refunded_at),
        refundedByUserId: String(refund.refunded_by_user_id),
      }),
      invoice: this.getInvoice(
        context,
        String(
          (
            this.database.raw
              .prepare("SELECT invoice_id FROM billing_payments WHERE id = ?")
              .get(parsed.paymentId) as Row
          ).invoice_id,
        ),
      ),
    };
  }

  private allocateProportionally(
    total: number,
    weights: readonly number[],
  ): number[] {
    const denominator = weights.reduce(
      (sum, weight) => sum + Math.max(0, weight),
      0,
    );
    if (total <= 0 || denominator <= 0) {
      return weights.map(() => 0);
    }
    const allocations = weights.map((weight) =>
      Math.floor((total * Math.max(0, weight)) / denominator),
    );
    let remainder =
      total - allocations.reduce((sum, amount) => sum + amount, 0);
    for (let index = 0; remainder > 0 && index < weights.length; index += 1) {
      if (weights[index]! > 0) {
        allocations[index] = allocations[index]! + 1;
        remainder -= 1;
      }
    }
    return allocations;
  }

  private compensationAmount(
    line: Row,
    allocatedAmountEgp: number,
    netLineEgp: number,
  ): number {
    if (allocatedAmountEgp <= 0 || netLineEgp <= 0 || !line.doctor_id) {
      return 0;
    }
    if (line.compensation_type === "percentage") {
      return Math.floor(
        (allocatedAmountEgp * Number(line.compensation_share_bps ?? 0)) /
          10_000,
      );
    }
    if (line.compensation_type === "fixed") {
      return Math.min(
        allocatedAmountEgp,
        Math.floor(
          (Number(line.compensation_share_amount_egp ?? 0) *
            Number(line.quantity ?? 1) *
            allocatedAmountEgp) /
            netLineEgp,
        ),
      );
    }
    return 0;
  }

  private recordPaymentEarnings(
    paymentId: string,
    invoiceId: string,
    amountEgp: number,
    eventAt: string,
  ): void {
    const invoice = this.database.raw
      .prepare(
        "SELECT subtotal_egp, discount_egp, total_egp FROM billing_invoices WHERE id = ?",
      )
      .get(invoiceId) as Row | undefined;
    if (!invoice) return;
    const lines = this.database.raw
      .prepare(
        "SELECT * FROM billing_invoice_lines WHERE invoice_id = ? ORDER BY rowid",
      )
      .all(invoiceId) as Row[];
    const lineTotals = lines.map((line) => Number(line.line_total_egp));
    const discountAllocations = this.allocateProportionally(
      Number(invoice.discount_egp),
      lineTotals,
    );
    const netLineTotals = lineTotals.map(
      (lineTotal, index) => lineTotal - discountAllocations[index]!,
    );
    const collectedAllocations = this.allocateProportionally(
      amountEgp,
      netLineTotals,
    );
    const insert = this.database.raw.prepare(
      `INSERT INTO billing_doctor_earnings
       (id, invoice_line_id, doctor_id, invoice_id, payment_id, refund_id, event_type,
        allocated_amount_egp, amount_egp, event_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'payment', ?, ?, ?)`,
    );
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (!line.doctor_id) continue;
      const allocatedAmountEgp = collectedAllocations[index]!;
      insert.run(
        nanoid(18),
        line.id,
        line.doctor_id,
        invoiceId,
        paymentId,
        allocatedAmountEgp,
        this.compensationAmount(
          line,
          allocatedAmountEgp,
          netLineTotals[index]!,
        ),
        eventAt,
      );
    }
  }

  private recordRefundEarnings(
    refundId: string,
    paymentId: string,
    amountEgp: number,
    eventAt: string,
  ): void {
    const payment = this.database.raw
      .prepare(
        "SELECT amount_egp, invoice_id FROM billing_payments WHERE id = ?",
      )
      .get(paymentId) as Row | undefined;
    if (!payment || Number(payment.amount_egp) <= 0) return;
    const rows = this.database.raw
      .prepare(
        `SELECT * FROM billing_doctor_earnings
         WHERE payment_id = ? AND event_type = 'payment'
         ORDER BY rowid`,
      )
      .all(paymentId) as Row[];
    const insert = this.database.raw.prepare(
      `INSERT INTO billing_doctor_earnings
       (id, invoice_line_id, doctor_id, invoice_id, payment_id, refund_id, event_type,
        allocated_amount_egp, amount_egp, event_at)
       VALUES (?, ?, ?, ?, NULL, ?, 'refund', ?, ?, ?)`,
    );
    const refundAllocations = this.allocateProportionally(
      amountEgp,
      rows.map((row) => Number(row.allocated_amount_egp)),
    );
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      const allocatedAmountEgp = refundAllocations[index]!;
      const earningsAmountEgp =
        Number(row.allocated_amount_egp) > 0
          ? Math.floor(
              (allocatedAmountEgp * Number(row.amount_egp)) /
                Number(row.allocated_amount_egp),
            )
          : 0;
      insert.run(
        nanoid(18),
        row.invoice_line_id,
        row.doctor_id,
        row.invoice_id,
        refundId,
        allocatedAmountEgp,
        earningsAmountEgp,
        eventAt,
      );
    }
  }

  private getPackage(
    context: SessionContext,
    packageId: string,
  ): BillingPackage {
    const row = this.database.raw
      .prepare("SELECT * FROM billing_packages WHERE id = ?")
      .get(packageId) as Row | undefined;
    if (!row) {
      throw new Error(
        "ELITE_BILLING_PACKAGE_NOT_FOUND: package does not exist",
      );
    }
    return this.mapPackage(row);
  }

  private getCompensationRule(
    context: SessionContext,
    ruleId: string,
  ): BillingDoctorCompensationRule {
    const row = this.database.raw
      .prepare(
        `SELECT r.*, u.display_name_en AS doctor_name_en, s.name_en AS service_name_en
         FROM billing_doctor_compensation_rules r
         JOIN users u ON u.id = r.doctor_id
         JOIN services s ON s.id = r.service_id
         WHERE r.id = ?`,
      )
      .get(ruleId) as Row | undefined;
    if (!row) {
      throw new Error(
        "ELITE_BILLING_COMPENSATION_RULE_NOT_FOUND: rule does not exist",
      );
    }
    return this.mapCompensationRule(row);
  }

  private mapCompensationRule(row: Row): BillingDoctorCompensationRule {
    return billingDoctorCompensationRuleSchema.parse({
      id: String(row.id),
      doctorId: String(row.doctor_id),
      serviceId: String(row.service_id),
      feeEgp: Number(row.fee_egp),
      compensationType: row.compensation_type,
      ...(row.share_bps === null || row.share_bps === undefined
        ? {}
        : { shareBps: Number(row.share_bps) }),
      ...(row.share_amount_egp === null || row.share_amount_egp === undefined
        ? {}
        : { shareAmountEgp: Number(row.share_amount_egp) }),
      effectiveFrom: String(row.effective_from),
      ...(row.effective_to ? { effectiveTo: String(row.effective_to) } : {}),
      doctorNameEn: String(row.doctor_name_en),
      serviceNameEn: String(row.service_name_en),
      createdAt: String(row.created_at),
      createdByUserId: String(row.created_by_user_id),
      version: Number(row.version),
    });
  }

  private compensationRuleAt(
    doctorId: string,
    serviceId: string,
    at: string,
  ): Row | undefined {
    return this.database.raw
      .prepare(
        `SELECT * FROM billing_doctor_compensation_rules
         WHERE doctor_id = ? AND service_id = ?
           AND effective_from <= ?
           AND (effective_to IS NULL OR effective_to > ?)
         ORDER BY effective_from DESC
         LIMIT 1`,
      )
      .get(doctorId, serviceId, at, at) as Row | undefined;
  }

  private mapPackage(row: Row): BillingPackage {
    const items = (
      this.database.raw
        .prepare(
          `SELECT i.*, s.name_en AS service_name_en
           FROM billing_package_items i JOIN services s ON s.id = i.service_id
           WHERE i.package_id = ? ORDER BY s.name_en`,
        )
        .all(row.id) as Row[]
    ).map((item) => ({
      serviceId: String(item.service_id),
      serviceNameEn: String(item.service_name_en),
      quantity: Number(item.quantity),
    }));
    return billingPackageSchema.parse({
      id: String(row.id),
      code: String(row.code),
      nameEn: String(row.name_en),
      ...(optionalString(row.name_ar) ? { nameAr: String(row.name_ar) } : {}),
      priceEgp: Number(row.price_egp),
      ...(row.validity_days === null
        ? {}
        : { validityDays: Number(row.validity_days) }),
      status: row.status,
      items,
      createdAt: String(row.created_at),
      createdByUserId: String(row.created_by_user_id),
      updatedAt: String(row.updated_at),
      updatedByUserId: String(row.updated_by_user_id),
      version: Number(row.version),
    });
  }

  private mapInvoice(context: SessionContext, row: Row): BillingInvoice {
    const showCompensation = context.role === "admin";
    const lines = (
      this.database.raw
        .prepare(
          "SELECT * FROM billing_invoice_lines WHERE invoice_id = ? ORDER BY rowid",
        )
        .all(row.id) as Row[]
    ).map((line) => ({
      id: String(line.id),
      ...(line.service_id ? { serviceId: String(line.service_id) } : {}),
      ...(line.package_id ? { packageId: String(line.package_id) } : {}),
      ...(showCompensation && line.doctor_id
        ? { doctorId: String(line.doctor_id) }
        : {}),
      quantity: Number(line.quantity),
      descriptionEn: String(line.description_en),
      unitPriceEgp: Number(line.unit_price_egp),
      lineTotalEgp: Number(line.line_total_egp),
      ...(showCompensation &&
      line.doctor_fee_egp !== null &&
      line.doctor_fee_egp !== undefined
        ? { doctorFeeEgp: Number(line.doctor_fee_egp) }
        : {}),
      ...(showCompensation && line.compensation_type
        ? { compensationType: line.compensation_type }
        : {}),
      ...(showCompensation &&
      line.compensation_share_bps !== null &&
      line.compensation_share_bps !== undefined
        ? { compensationShareBps: Number(line.compensation_share_bps) }
        : {}),
      ...(showCompensation &&
      line.compensation_share_amount_egp !== null &&
      line.compensation_share_amount_egp !== undefined
        ? {
            compensationShareAmountEgp: Number(
              line.compensation_share_amount_egp,
            ),
          }
        : {}),
    }));
    const totals = this.getInvoiceTotals(String(row.id));
    return billingInvoiceSchema.parse({
      id: String(row.id),
      invoiceNumber: String(row.invoice_number),
      patientId: String(
        row.patient_display_id ?? this.patientDisplayId(String(row.patient_id)),
      ),
      ...(row.appointment_id
        ? { appointmentId: String(row.appointment_id) }
        : {}),
      currency: "EGP",
      status: totals?.status ?? row.status,
      subtotalEgp: Number(row.subtotal_egp),
      discountEgp: Number(row.discount_egp),
      totalEgp: Number(row.total_egp),
      paidEgp: totals?.paidEgp ?? 0,
      balanceEgp: totals?.balanceEgp ?? Number(row.total_egp),
      lines,
      createdAt: String(row.created_at),
      createdByUserId: String(row.created_by_user_id),
      updatedAt: String(row.updated_at),
      updatedByUserId: String(row.updated_by_user_id),
      version: Number(row.version),
    });
  }

  private getPayment(
    context: SessionContext,
    paymentId: string,
  ): BillingPayment {
    const row = this.database.raw
      .prepare("SELECT * FROM billing_payments WHERE id = ?")
      .get(paymentId) as Row | undefined;
    if (!row)
      throw new Error(
        "ELITE_BILLING_PAYMENT_NOT_FOUND: payment does not exist",
      );
    return billingPaymentSchema.parse({
      id: String(row.id),
      invoiceId: String(row.invoice_id),
      amountEgp: Number(row.amount_egp),
      method: row.method,
      ...(optionalString(row.reference)
        ? { reference: String(row.reference) }
        : {}),
      status: row.status,
      receivedAt: String(row.received_at),
      receivedByUserId: String(row.received_by_user_id),
      version: Number(row.version),
    });
  }

  private getReceipt(
    context: SessionContext,
    receiptId: string,
  ): BillingReceipt {
    const row = this.database.raw
      .prepare("SELECT * FROM billing_receipts WHERE id = ?")
      .get(receiptId) as Row | undefined;
    if (!row)
      throw new Error(
        "ELITE_BILLING_RECEIPT_NOT_FOUND: receipt does not exist",
      );
    return billingReceiptSchema.parse({
      id: String(row.id),
      receiptNumber: String(row.receipt_number),
      invoiceId: String(row.invoice_id),
      paymentId: String(row.payment_id),
      amountEgp: Number(row.amount_egp),
      issuedAt: String(row.issued_at),
      issuedByUserId: String(row.issued_by_user_id),
      status: row.status,
    });
  }

  private resolveInvoiceLine(
    line: BillingInvoiceCreateInput["lines"][number],
    appointmentDoctorId: string | undefined,
    at: string,
  ): {
    serviceId?: string;
    packageId?: string;
    doctorId?: string;
    quantity: number;
    descriptionEn: string;
    unitPriceEgp: number;
    lineTotalEgp: number;
    doctorFeeEgp?: number;
    compensationType?: "percentage" | "fixed";
    compensationShareBps?: number;
    compensationShareAmountEgp?: number;
  } {
    const doctorId = line.doctorId ?? appointmentDoctorId;
    if (line.serviceId) {
      const service = this.database.raw
        .prepare("SELECT name_en, price_egp, status FROM services WHERE id = ?")
        .get(line.serviceId) as Row | undefined;
      if (!service || service.status !== "active") {
        throw new Error(
          "ELITE_BILLING_SERVICE_NOT_ACTIVE: service is unavailable",
        );
      }
      const rule = doctorId
        ? this.compensationRuleAt(doctorId, line.serviceId, at)
        : undefined;
      const unitPriceEgp = rule
        ? Number(rule.fee_egp)
        : Number(service.price_egp);
      return {
        serviceId: line.serviceId,
        ...(doctorId ? { doctorId } : {}),
        quantity: line.quantity,
        descriptionEn: line.descriptionEn ?? String(service.name_en),
        unitPriceEgp,
        lineTotalEgp: unitPriceEgp * line.quantity,
        ...(rule
          ? {
              doctorFeeEgp: Number(rule.fee_egp),
              compensationType: rule.compensation_type,
              ...(rule.share_bps === null || rule.share_bps === undefined
                ? {}
                : { compensationShareBps: Number(rule.share_bps) }),
              ...(rule.share_amount_egp === null ||
              rule.share_amount_egp === undefined
                ? {}
                : {
                    compensationShareAmountEgp: Number(rule.share_amount_egp),
                  }),
            }
          : {}),
      };
    }
    const packageRow = this.database.raw
      .prepare(
        "SELECT name_en, price_egp, status FROM billing_packages WHERE id = ?",
      )
      .get(line.packageId) as Row | undefined;
    if (!packageRow || packageRow.status !== "active") {
      throw new Error(
        "ELITE_BILLING_PACKAGE_NOT_ACTIVE: package is unavailable",
      );
    }
    const unitPriceEgp = Number(packageRow.price_egp);
    return {
      packageId: line.packageId!,
      ...(line.doctorId ? { doctorId: line.doctorId } : {}),
      quantity: line.quantity,
      descriptionEn: line.descriptionEn ?? String(packageRow.name_en),
      unitPriceEgp,
      lineTotalEgp: unitPriceEgp * line.quantity,
    };
  }

  private getInvoiceTotals(
    invoiceId: string,
  ): { status: string; paidEgp: number; balanceEgp: number } | undefined {
    const invoice = this.database.raw
      .prepare("SELECT total_egp, status FROM billing_invoices WHERE id = ?")
      .get(invoiceId) as Row | undefined;
    if (!invoice) return undefined;
    const paid = this.database.raw
      .prepare(
        `SELECT COALESCE(SUM(p.amount_egp), 0) AS payments,
                COALESCE((SELECT SUM(r.amount_egp) FROM billing_refunds r JOIN billing_payments rp ON rp.id = r.payment_id WHERE rp.invoice_id = ? AND r.status = 'posted'), 0) AS refunds
         FROM billing_payments p WHERE p.invoice_id = ? AND p.status IN ('posted', 'refunded')`,
      )
      .get(invoiceId, invoiceId) as Row;
    const paidEgp = Math.max(0, Number(paid.payments) - Number(paid.refunds));
    return {
      status: String(invoice.status),
      paidEgp,
      balanceEgp: Math.max(0, Number(invoice.total_egp) - paidEgp),
    };
  }

  private reconcileInvoice(
    invoiceId: string,
    timestamp: string,
    userId: string,
  ): void {
    const invoice = this.database.raw
      .prepare("SELECT total_egp FROM billing_invoices WHERE id = ?")
      .get(invoiceId) as Row;
    const payments = this.database.raw
      .prepare(
        "SELECT COALESCE(SUM(amount_egp), 0) AS total FROM billing_payments WHERE invoice_id = ? AND status IN ('posted', 'refunded')",
      )
      .get(invoiceId) as Row;
    const refunds = this.database.raw
      .prepare(
        `SELECT COALESCE(SUM(r.amount_egp), 0) AS total
         FROM billing_refunds r JOIN billing_payments p ON p.id = r.payment_id
         WHERE p.invoice_id = ? AND r.status = 'posted'`,
      )
      .get(invoiceId) as Row;
    const netPaid = Math.max(0, Number(payments.total) - Number(refunds.total));
    const total = Number(invoice.total_egp);
    const status =
      Number(refunds.total) >= total && total > 0
        ? "refunded"
        : netPaid >= total
          ? "paid"
          : netPaid > 0
            ? "partially-paid"
            : "open";
    this.database.raw
      .prepare(
        "UPDATE billing_invoices SET status = ?, updated_at = ?, updated_by_user_id = ?, version = version + 1 WHERE id = ?",
      )
      .run(status, timestamp, userId, invoiceId);
  }

  private patientDisplayId(patientId: string): string {
    const row = this.database.raw
      .prepare("SELECT patient_id FROM patients WHERE id = ?")
      .get(patientId) as Row | undefined;
    return String(row?.patient_id ?? patientId);
  }

  private nextNumber(
    sequenceName: "invoice" | "receipt",
    prefix: "EL-INV" | "EL-REC",
  ): string {
    const row = this.database.raw
      .prepare("SELECT next_value FROM billing_number_sequences WHERE name = ?")
      .get(sequenceName) as Row;
    const value = Number(row.next_value);
    this.database.raw
      .prepare(
        "UPDATE billing_number_sequences SET next_value = next_value + 1 WHERE name = ?",
      )
      .run(sequenceName);
    return `${prefix}-${String(value).padStart(6, "0")}`;
  }

  private writeAudit(
    context: SessionContext,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.writeAuditWithoutContext(action, entityId, metadata, context);
  }

  private writeAuditWithoutContext(
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
    context?: SessionContext,
  ): void {
    this.database.raw
      .prepare(
        "INSERT INTO audit_events (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)",
      )
      .run(
        nanoid(18),
        context?.userId ?? null,
        context?.deviceId ?? null,
        action,
        "billing",
        entityId,
        JSON.stringify(metadata),
        now(),
      );
  }
}
