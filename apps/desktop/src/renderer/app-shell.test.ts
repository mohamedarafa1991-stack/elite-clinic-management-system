import { describe, expect, it } from "vitest";
import { getVisibleShellNavigation, type ShellLabels } from "./app-shell.js";

const labels: ShellLabels = {
  appName: "Elite Clinic Management System",
  clinicWorkspace: "Clinic workspace",
  localFirst: "Local-first",
  workingLocally: "Working locally",
  encryptedStore: "Encrypted clinic store",
  interfaceLanguage: "Interface language",
  signOut: "Sign out",
  workspaceLabel: "Workspace",
  primaryNavigationLabel: "Primary navigation",
  expandNavigation: "Expand navigation",
  collapseNavigation: "Collapse navigation",
  todayGroup: "Today",
  frontDeskGroup: "Front desk",
  clinicalGroup: "Clinical care",
  operationsGroup: "Operations",
  insightsGroup: "Insights",
  systemGroup: "System",
  dashboard: "Dashboard",
  dashboardDetail: "Today, queue, and clinic status",
  patients: "Patients",
  patientsDetail: "Profiles, history, and guardians",
  appointments: "Appointments",
  appointmentsDetail: "Calendar, check-in, and visits",
  doctors: "Doctors",
  doctorsDetail: "Profiles, specialties, and documents",
  clinicalRecords: "Clinical records",
  clinicalRecordsDetail: "Encounters, diagnoses, and amendments",
  documents: "Documents",
  documentsDetail: "Secure doctor-document vault",
  billing: "Billing",
  billingDetail: "Invoices, receipts, refunds, and packages",
  drugCatalog: "Drug catalog",
  drugCatalogDetail: "Egyptian medicines and updates",
  reports: "Reports & exports",
  reportsDetail: "Signed records, FHIR, and disclosures",
  syncDevices: "Sync & devices",
  syncDevicesDetail: "LAN health, enrollment, and recovery",
  adminSettings: "Admin settings",
  adminSettingsDetail: "Clinic policy, schedules, and controls",
};

describe("AppShell navigation model", () => {
  it("always keeps Dashboard and hides every unauthorized workspace", () => {
    expect(
      getVisibleShellNavigation([], labels).map((item) => item.id),
    ).toEqual(["workspace-overview"]);
  });

  it("reveals operational workspaces from existing capabilities", () => {
    expect(
      getVisibleShellNavigation(
        [
          "patient.read",
          "appointment.read",
          "billing.read",
          "doctor.profile.read",
          "clinical.read",
          "export.manage",
          "reports.read",
          "device.manage",
          "module.manage",
        ],
        labels,
      ).map((item) => item.id),
    ).toEqual([
      "workspace-overview",
      "workspace-patients",
      "workspace-appointments",
      "workspace-doctors",
      "workspace-records",
      "workspace-documents",
      "workspace-billing",
      "workspace-catalog",
      "workspace-reports",
      "workspace-sync",
      "workspace-settings",
    ]);
  });

  it("keeps reports, sync, and admin settings separately gated", () => {
    expect(
      getVisibleShellNavigation(["export.manage"], labels).map(
        (item) => item.id,
      ),
    ).toEqual(["workspace-overview"]);
    expect(
      getVisibleShellNavigation(["reports.read"], labels).map(
        (item) => item.id,
      ),
    ).toEqual(["workspace-overview", "workspace-reports"]);
    expect(
      getVisibleShellNavigation(["device.manage"], labels).map(
        (item) => item.id,
      ),
    ).toEqual(["workspace-overview", "workspace-sync"]);
    expect(
      getVisibleShellNavigation(["module.manage"], labels).map(
        (item) => item.id,
      ),
    ).toEqual([
      "workspace-overview",
      "workspace-catalog",
      "workspace-settings",
    ]);
  });

  it("keeps front desk navigation free of clinical records", () => {
    expect(
      getVisibleShellNavigation(
        ["patient.read", "appointment.read", "billing.read"],
        labels,
      ).map((item) => item.id),
    ).toEqual([
      "workspace-overview",
      "workspace-patients",
      "workspace-appointments",
      "workspace-billing",
    ]);
  });

  it("keeps localized labels and group metadata attached", () => {
    const arabicLabels = {
      ...labels,
      patients: "المرضى",
      patientsDetail: "الملفات والتاريخ وذوو الصلة",
      frontDeskGroup: "الاستقبال",
    };
    expect(
      getVisibleShellNavigation(["patient.read"], arabicLabels).find(
        (item) => item.id === "workspace-patients",
      ),
    ).toEqual({
      id: "workspace-patients",
      label: "المرضى",
      detail: "الملفات والتاريخ وذوو الصلة",
      icon: "P",
      group: "front-desk",
    });
  });
});
