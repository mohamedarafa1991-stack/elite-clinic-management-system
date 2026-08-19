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
  overview: "Overview",
  overviewDetail: "Today and clinic status",
  patients: "Patients",
  patientsDetail: "Search and patient records",
  careSchedule: "Care & schedule",
  careScheduleDetail: "Appointments and encounters",
  billing: "Billing",
  billingDetail: "Invoices, receipts, and packages",
  doctors: "Doctors",
  doctorsDetail: "Profiles and secure documents",
  governance: "Governance",
  governanceDetail: "Exports, audit, and Admin controls",
};

describe("AppShell navigation model", () => {
  it("always keeps Overview and hides every unauthorized workspace", () => {
    expect(
      getVisibleShellNavigation([], labels).map((item) => item.id),
    ).toEqual(["workspace-overview"]);
  });

  it("reveals each operational workspace only for its matching capability", () => {
    expect(
      getVisibleShellNavigation(
        [
          "patient.read",
          "appointment.read",
          "billing.read",
          "doctor.profile.read",
        ],
        labels,
      ).map((item) => item.id),
    ).toEqual([
      "workspace-overview",
      "workspace-patients",
      "workspace-care",
      "workspace-billing",
      "workspace-doctors",
    ]);
  });

  it("shows Governance for either export management or device management", () => {
    expect(
      getVisibleShellNavigation(["export.manage"], labels).some(
        (item) => item.id === "workspace-governance",
      ),
    ).toBe(true);
    expect(
      getVisibleShellNavigation(["device.manage"], labels).some(
        (item) => item.id === "workspace-governance",
      ),
    ).toBe(true);
    expect(
      getVisibleShellNavigation(["export.read"], labels).some(
        (item) => item.id === "workspace-governance",
      ),
    ).toBe(false);
  });

  it("keeps localized labels attached to capability-filtered items", () => {
    const arabicLabels = {
      ...labels,
      patients: "المرضى",
      patientsDetail: "البحث وسجلات المرضى",
    };
    expect(
      getVisibleShellNavigation(["patient.read"], arabicLabels).find(
        (item) => item.id === "workspace-patients",
      ),
    ).toEqual({
      id: "workspace-patients",
      label: "المرضى",
      detail: "البحث وسجلات المرضى",
    });
  });
});
