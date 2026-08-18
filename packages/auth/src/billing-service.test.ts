import { describe, expect, it } from "vitest";
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
