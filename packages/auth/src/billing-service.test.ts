import { describe, expect, it } from "vitest";
import { roleCapabilities } from "@elite/contracts";
import { openDatabase } from "@elite/database";
import { BillingService } from "./billing-service.js";
import { ClinicalWorkflowService } from "./clinical-service.js";
import { AuthService, type SessionContext } from "./index.js";
import { PatientIdentityService } from "./patient-service.js";

const bootstrapInput = {
  admins: [
    {
      username: "admin.billing.primary",
      password: "Synthetic-Billing-Primary-2026!",
      displayNameEn: "Synthetic Billing Primary",
    },
    {
      username: "admin.billing.backup",
      password: "Synthetic-Billing-Backup-2026!",
      displayNameEn: "Synthetic Billing Backup",
    },
  ],
  hubDevice: {
    friendlyName: "Synthetic Billing Hub",
    appVersion: "0.1.0-test",
  },
};

async function createFixture() {
  const database = openDatabase({ filename: ":memory:", mode: "test" });
  const auth = new AuthService(database);
  const bootstrap = await auth.bootstrapInitialAdmins(bootstrapInput);
  const context = await auth.login({
    username: bootstrapInput.admins[0]!.username,
    password: bootstrapInput.admins[0]!.password,
    deviceId: bootstrap.hubDeviceId,
  });
  return {
    database,
    context,
    patients: new PatientIdentityService(database),
    clinical: new ClinicalWorkflowService(database),
    billing: new BillingService(database),
  };
}

describe("Step 29 billing service", () => {
  it("snapshots doctor fees and calculates collected earnings with refund adjustments", async () => {
    const fixture = await createFixture();
    const doctorId = "synthetic-doctor-earnings";
    try {
      fixture.database.raw
        .prepare(
          `INSERT INTO users
           (id, username, display_name_en, display_name_ar, role, capabilities_json,
            is_clinical_approver, is_active, created_at, updated_at)
           VALUES (?, ?, ?, NULL, 'doctor', ?, 0, 1, ?, ?)`,
        )
        .run(
          doctorId,
          "doctor.synthetic.earnings",
          "Synthetic Earnings Doctor",
          JSON.stringify(roleCapabilities.doctor),
          new Date().toISOString(),
          new Date().toISOString(),
        );
      const doctor: SessionContext = {
        ...fixture.context,
        userId: doctorId,
        username: "doctor.synthetic.earnings",
        role: "doctor",
        capabilities: roleCapabilities.doctor,
      };
      const specialty = fixture.clinical.createSpecialty(fixture.context, {
        code: "SYN-EARN",
        nameEn: "Synthetic Earnings",
      });
      const department = fixture.clinical.createDepartment(fixture.context, {
        specialtyId: specialty.id,
        code: "SYN-EARN-DEP",
        nameEn: "Synthetic Earnings Department",
      });
      const service = fixture.clinical.createService(fixture.context, {
        departmentId: department.id,
        code: "EARN-CONSULT",
        nameEn: "Synthetic Earnings Consultation",
        durationMinutes: 30,
        priceEgp: 300,
      });
      const patient = fixture.patients.registerPatient(fixture.context, {
        registrationMode: "full",
        nameEn: "Synthetic Earnings Patient",
        phone: "+201000000098",
      });
      const appointment = fixture.clinical.createAppointment(fixture.context, {
        patientId: patient.patient.patientId,
        departmentId: department.id,
        serviceId: service.id,
        doctorId,
        scheduledStart: "2030-01-05T10:00:00.000Z",
        visitType: "consultation",
        isWalkIn: false,
      });
      const rule = fixture.billing.createCompensationRule(fixture.context, {
        doctorId,
        serviceId: service.id,
        feeEgp: 500,
        compensationType: "percentage",
        shareBps: 6000,
        effectiveFrom: "2020-01-01T00:00:00.000Z",
      });
      expect(rule).toMatchObject({
        doctorId,
        serviceId: service.id,
        feeEgp: 500,
        compensationType: "percentage",
        shareBps: 6000,
      });
      const invoice = fixture.billing.createInvoice(fixture.context, {
        patientId: patient.patient.patientId,
        appointmentId: appointment.id,
        lines: [{ serviceId: service.id, quantity: 1 }],
        discountEgp: 0,
      });
      expect(invoice).toMatchObject({
        subtotalEgp: 500,
        totalEgp: 500,
        lines: [
          expect.objectContaining({
            doctorId,
            doctorFeeEgp: 500,
            compensationType: "percentage",
            compensationShareBps: 6000,
          }),
        ],
      });
      const receptionist: SessionContext = {
        ...fixture.context,
        role: "receptionist",
        capabilities: roleCapabilities.receptionist,
      };
      const restrictedInvoice = fixture.billing.getInvoice(
        receptionist,
        invoice.id,
      );
      expect(restrictedInvoice.lines[0]).not.toHaveProperty("doctorId");
      expect(restrictedInvoice.lines[0]).not.toHaveProperty("doctorFeeEgp");
      const firstPayment = fixture.billing.postPayment(fixture.context, {
        invoiceId: invoice.id,
        amountEgp: 250,
        method: "cash",
      });
      fixture.billing.postPayment(fixture.context, {
        invoiceId: invoice.id,
        amountEgp: 250,
        method: "card",
      });
      fixture.billing.refundPayment(fixture.context, {
        paymentId: firstPayment.payment.id,
        amountEgp: 100,
        reason: "Synthetic earnings adjustment",
      });
      const earnings = fixture.billing.getDoctorEarnings(doctor);
      expect(earnings.monthly.at(-1)).toMatchObject({
        collectedEgp: 500,
        refundedEgp: 100,
        earningsEgp: 240,
        clinicRetainedEgp: 160,
        invoiceCount: 1,
      });
      const reportMonth = new Date().toISOString().slice(0, 7);
      const payoutReport = fixture.billing.generateDoctorPayoutReport(
        fixture.context,
        { reportMonth },
      );
      expect(payoutReport).toMatchObject({
        reportMonth,
        generatedBy: "admin",
        rows: [
          expect.objectContaining({
            doctorId,
            collectedEgp: 500,
            refundedEgp: 100,
            doctorEarningsEgp: 240,
            clinicRetainedEgp: 160,
            invoiceCount: 1,
          }),
        ],
        totals: {
          collectedEgp: 500,
          refundedEgp: 100,
          doctorEarningsEgp: 240,
          clinicRetainedEgp: 160,
          invoiceCount: 1,
        },
      });
      expect(() =>
        fixture.billing.getDoctorEarnings(doctor, fixture.context.userId),
      ).toThrow("ELITE_BILLING_EARNINGS_OWNER_REQUIRED");
      expect(() =>
        fixture.billing.getDoctorEarnings(receptionist, doctorId),
      ).toThrow("ELITE_AUTH_CAPABILITY_REQUIRED: billing.earnings.read");
      expect(() =>
        fixture.billing.generateDoctorPayoutReport(receptionist, {
          reportMonth,
        }),
      ).toThrow("ELITE_AUTH_CAPABILITY_REQUIRED: billing.payout.report");
    } finally {
      fixture.database.close();
    }
  });

  it("creates an EGP invoice, supports partial payment, receipts, and refunds", async () => {
    const fixture = await createFixture();
    try {
      const specialty = fixture.clinical.createSpecialty(fixture.context, {
        code: "SYN-BILL",
        nameEn: "Synthetic Billing",
      });
      const department = fixture.clinical.createDepartment(fixture.context, {
        specialtyId: specialty.id,
        code: "SYN-BILL-DEP",
        nameEn: "Synthetic Billing Department",
      });
      const service = fixture.clinical.createService(fixture.context, {
        departmentId: department.id,
        code: "CONSULT-001",
        nameEn: "Synthetic Consultation",
        durationMinutes: 30,
        priceEgp: 300,
      });
      const patient = fixture.patients.registerPatient(fixture.context, {
        registrationMode: "full",
        nameEn: "Synthetic Billing Patient",
        phone: "+201000000099",
      });
      const packageRecord = fixture.billing.createPackage(fixture.context, {
        code: "PKG-001",
        nameEn: "Synthetic Package",
        priceEgp: 600,
        items: [{ serviceId: service.id, quantity: 2 }],
      });
      const invoice = fixture.billing.createInvoice(fixture.context, {
        patientId: patient.patient.patientId,
        lines: [
          { serviceId: service.id, quantity: 1 },
          { packageId: packageRecord.id, quantity: 1 },
        ],
        discountEgp: 100,
        discountReason: "Synthetic approved discount",
      });
      expect(invoice).toMatchObject({
        invoiceNumber: "EL-INV-000001",
        currency: "EGP",
        subtotalEgp: 900,
        discountEgp: 100,
        totalEgp: 800,
        paidEgp: 0,
        balanceEgp: 800,
        status: "open",
      });
      const firstPayment = fixture.billing.postPayment(fixture.context, {
        invoiceId: invoice.id,
        amountEgp: 300,
        method: "cash",
      });
      expect(firstPayment.receipt.receiptNumber).toBe("EL-REC-000001");
      expect(firstPayment.invoice).toMatchObject({
        status: "partially-paid",
        paidEgp: 300,
        balanceEgp: 500,
      });
      const secondPayment = fixture.billing.postPayment(fixture.context, {
        invoiceId: invoice.id,
        amountEgp: 500,
        method: "card",
        reference: "SYN-CARD-001",
      });
      expect(secondPayment.invoice).toMatchObject({
        status: "paid",
        paidEgp: 800,
        balanceEgp: 0,
      });
      expect(() =>
        fixture.billing.postPayment(fixture.context, {
          invoiceId: invoice.id,
          amountEgp: 1,
          method: "cash",
        }),
      ).toThrow("ELITE_BILLING_PAYMENT_EXCEEDS_BALANCE");
      expect(() =>
        fixture.billing.refundPayment(fixture.context, {
          paymentId: firstPayment.payment.id,
          amountEgp: 301,
          reason: "Synthetic over-refund rejection",
        }),
      ).toThrow("ELITE_BILLING_REFUND_EXCEEDS_PAYMENT");
      const refund = fixture.billing.refundPayment(fixture.context, {
        paymentId: firstPayment.payment.id,
        amountEgp: 300,
        reason: "Synthetic patient refund",
      });
      expect(refund.invoice).toMatchObject({
        status: "partially-paid",
        paidEgp: 500,
        balanceEgp: 300,
      });
      expect(refund.refund.status).toBe("posted");
      expect(
        fixture.database.raw
          .prepare("SELECT status FROM billing_receipts WHERE payment_id = ?")
          .get(firstPayment.payment.id),
      ).toMatchObject({ status: "voided" });
      expect(() =>
        fixture.billing.refundPayment(fixture.context, {
          paymentId: firstPayment.payment.id,
          amountEgp: 1,
          reason: "Synthetic duplicate refund rejection",
        }),
      ).toThrow("ELITE_BILLING_PAYMENT_NOT_REFUNDABLE");
      expect(
        fixture.billing.getDashboardSummary(fixture.context, new Date()),
      ).toMatchObject({
        invoiceCount: 1,
        invoicedEgp: 800,
        collectedEgp: 500,
        refundedEgp: 300,
        outstandingEgp: 300,
        openInvoiceCount: 1,
        recentInvoices: [
          expect.objectContaining({
            invoiceNumber: "EL-INV-000001",
            patientId: "EL-00001",
            balanceEgp: 300,
          }),
        ],
      });
    } finally {
      fixture.database.close();
    }
  });

  it("requires module management for package creation and a reason for discounts", async () => {
    const fixture = await createFixture();
    try {
      const receptionistContext: SessionContext = {
        ...fixture.context,
        role: "receptionist",
        capabilities: ["billing.read", "billing.write", "billing.refund"],
      };
      expect(() =>
        fixture.billing.createPackage(receptionistContext, {
          code: "PKG-DENIED",
          nameEn: "Denied Package",
          priceEgp: 100,
          items: [{ serviceId: "missing-service", quantity: 1 }],
        }),
      ).toThrow("ELITE_AUTH_CAPABILITY_REQUIRED: module.manage");
      expect(() =>
        fixture.billing.createInvoice(fixture.context, {
          patientId: "EL-99999",
          lines: [{ serviceId: "missing-service", quantity: 1 }],
          discountEgp: 10,
        }),
      ).toThrow("ELITE_BILLING_PATIENT_NOT_ACTIVE");
    } finally {
      fixture.database.close();
    }
  });
});
