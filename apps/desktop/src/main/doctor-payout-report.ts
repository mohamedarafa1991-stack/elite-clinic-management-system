import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type {
  BillingDoctorPayoutExportResult,
  BillingDoctorPayoutReport,
  BillingDoctorPayoutScheduleStatus,
} from "@elite/contracts";

const REPORT_DIRECTORY_NAME = "Elite Clinic Reports\\Doctor Payouts";
const STATE_FILE_NAME = "doctor-payout-report-state.json";

export function defaultDoctorPayoutReportDirectory(
  documentsDirectory: string,
): string {
  return join(documentsDirectory, "Elite Clinic Reports", "Doctor Payouts");
}

export function doctorPayoutReportStatePath(userDataDirectory: string): string {
  return join(userDataDirectory, STATE_FILE_NAME);
}

export function previousCairoReportMonth(referenceDate = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(referenceDate)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
  const currentMonth = new Date(
    Date.UTC(Number(parts["year"]), Number(parts["month"]) - 1, 1),
  );
  currentMonth.setUTCMonth(currentMonth.getUTCMonth() - 1);
  return `${currentMonth.getUTCFullYear()}-${String(
    currentMonth.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function csvField(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderDoctorPayoutCsv(
  report: BillingDoctorPayoutReport,
): string {
  const headers = [
    "report_month",
    "doctor_id",
    "doctor_name_en",
    "doctor_name_ar",
    "collected_egp",
    "refunded_egp",
    "doctor_earnings_egp",
    "clinic_retained_egp",
    "invoice_count",
  ];
  const rows = report.rows.map((row) => [
    row.reportMonth,
    row.doctorId,
    row.doctorNameEn,
    row.doctorNameAr ?? "",
    row.collectedEgp,
    row.refundedEgp,
    row.doctorEarningsEgp,
    row.clinicRetainedEgp,
    row.invoiceCount,
  ]);
  const total = [
    report.reportMonth,
    "TOTAL",
    "All active doctors",
    "",
    report.totals.collectedEgp,
    report.totals.refundedEgp,
    report.totals.doctorEarningsEgp,
    report.totals.clinicRetainedEgp,
    report.totals.invoiceCount,
  ];
  return `\ufeff${[headers, ...rows, total]
    .map((row) => row.map(csvField).join(","))
    .join("\r\n")}\r\n`;
}

export function writeDoctorPayoutCsv(
  report: BillingDoctorPayoutReport,
  outputDirectory: string,
): BillingDoctorPayoutExportResult {
  mkdirSync(outputDirectory, { recursive: true });
  const fileName = `doctor-payouts-${report.reportMonth}.csv`;
  const filePath = join(outputDirectory, fileName);
  const temporaryPath = join(
    outputDirectory,
    `.${fileName}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(temporaryPath, renderDoctorPayoutCsv(report), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporaryPath, filePath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw new Error(
      "ELITE_BILLING_PAYOUT_REPORT_WRITE_FAILED: CSV could not be written",
      { cause: error },
    );
  }
  return { report, fileName, filePath };
}

export function defaultPayoutScheduleStatus(
  outputDirectory: string,
): BillingDoctorPayoutScheduleStatus {
  return {
    enabled: true,
    timeZone: "Africa/Cairo",
    scheduleTime: "07:00",
    outputDirectory,
  };
}

export function readPayoutScheduleStatus(
  userDataDirectory: string,
  outputDirectory: string,
): BillingDoctorPayoutScheduleStatus {
  const fallback = defaultPayoutScheduleStatus(outputDirectory);
  try {
    const parsed = JSON.parse(
      readFileSync(doctorPayoutReportStatePath(userDataDirectory), "utf8"),
    ) as Partial<BillingDoctorPayoutScheduleStatus>;
    return {
      ...fallback,
      ...parsed,
      outputDirectory,
      timeZone: "Africa/Cairo",
      scheduleTime: "07:00",
    };
  } catch {
    return fallback;
  }
}

export function writePayoutScheduleStatus(
  userDataDirectory: string,
  status: BillingDoctorPayoutScheduleStatus,
): void {
  const path = doctorPayoutReportStatePath(userDataDirectory);
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  mkdirSync(userDataDirectory, { recursive: true });
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(status, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw new Error(
      "ELITE_BILLING_PAYOUT_REPORT_STATE_WRITE_FAILED: schedule status could not be saved",
      { cause: error },
    );
  }
}

export { REPORT_DIRECTORY_NAME };
