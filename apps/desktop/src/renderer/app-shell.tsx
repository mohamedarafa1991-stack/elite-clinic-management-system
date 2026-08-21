import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { SessionSummary } from "../preload/index.js";
import type { WorkspaceLocale } from "./workspace-model.js";

export type ShellNavigationGroup =
  "today" | "front-desk" | "clinical" | "operations" | "insights" | "system";

export interface ShellLabels {
  appName: string;
  clinicWorkspace: string;
  localFirst: string;
  workingLocally: string;
  encryptedStore: string;
  interfaceLanguage: string;
  signOut: string;
  workspaceLabel: string;
  primaryNavigationLabel: string;
  expandNavigation: string;
  collapseNavigation: string;
  todayGroup: string;
  frontDeskGroup: string;
  clinicalGroup: string;
  operationsGroup: string;
  insightsGroup: string;
  systemGroup: string;
  dashboard: string;
  dashboardDetail: string;
  patients: string;
  patientsDetail: string;
  appointments: string;
  appointmentsDetail: string;
  doctors: string;
  doctorsDetail: string;
  clinicalRecords: string;
  clinicalRecordsDetail: string;
  documents: string;
  documentsDetail: string;
  billing: string;
  billingDetail: string;
  drugCatalog: string;
  drugCatalogDetail: string;
  reports: string;
  reportsDetail: string;
  syncDevices: string;
  syncDevicesDetail: string;
  adminSettings: string;
  adminSettingsDetail: string;
}

export interface ShellNavigationItem {
  id: string;
  label: string;
  detail: string;
  icon: string;
  group: ShellNavigationGroup;
}

export interface AppShellProps {
  session: SessionSummary;
  locale: WorkspaceLocale;
  labels: ShellLabels;
  onLocaleChange: (locale: WorkspaceLocale) => void;
  onLogout: () => Promise<void>;
  children: ReactElement;
}

interface NavigationDefinition extends ShellNavigationItem {
  visible: boolean;
}

export function getVisibleShellNavigation(
  capabilities: readonly string[],
  labels: ShellLabels,
): readonly ShellNavigationItem[] {
  const has = (capability: string): boolean =>
    capabilities.includes(capability);
  const hasAny = (...required: readonly string[]): boolean =>
    required.some((capability) => has(capability));

  const definitions: readonly NavigationDefinition[] = [
    {
      id: "workspace-overview",
      label: labels.dashboard,
      detail: labels.dashboardDetail,
      icon: "D",
      group: "today",
      visible: true,
    },
    {
      id: "workspace-patients",
      label: labels.patients,
      detail: labels.patientsDetail,
      icon: "P",
      group: "front-desk",
      visible: has("patient.read"),
    },
    {
      id: "workspace-appointments",
      label: labels.appointments,
      detail: labels.appointmentsDetail,
      icon: "A",
      group: "front-desk",
      visible: has("appointment.read"),
    },
    {
      id: "workspace-doctors",
      label: labels.doctors,
      detail: labels.doctorsDetail,
      icon: "Dr",
      group: "clinical",
      visible: has("doctor.profile.read"),
    },
    {
      id: "workspace-records",
      label: labels.clinicalRecords,
      detail: labels.clinicalRecordsDetail,
      icon: "CR",
      group: "clinical",
      visible: hasAny(
        "clinical.read",
        "clinical.write",
        "clinical.sign",
        "clinical.approve",
      ),
    },
    {
      id: "workspace-documents",
      label: labels.documents,
      detail: labels.documentsDetail,
      icon: "Dc",
      group: "clinical",
      visible: hasAny("doctor.profile.read", "doctor.document.sensitive-read"),
    },
    {
      id: "workspace-billing",
      label: labels.billing,
      detail: labels.billingDetail,
      icon: "EGP",
      group: "operations",
      visible: has("billing.read"),
    },
    {
      id: "workspace-catalog",
      label: labels.drugCatalog,
      detail: labels.drugCatalogDetail,
      icon: "Rx",
      group: "operations",
      visible: has("module.manage"),
    },
    {
      id: "workspace-reports",
      label: labels.reports,
      detail: labels.reportsDetail,
      icon: "R",
      group: "insights",
      visible: has("reports.read"),
    },
    {
      id: "workspace-sync",
      label: labels.syncDevices,
      detail: labels.syncDevicesDetail,
      icon: "↔",
      group: "system",
      visible: has("device.manage"),
    },
    {
      id: "workspace-settings",
      label: labels.adminSettings,
      detail: labels.adminSettingsDetail,
      icon: "S",
      group: "system",
      visible: has("module.manage"),
    },
  ];

  return definitions
    .filter((item) => item.visible)
    .map(({ id, label, detail, icon, group }) => ({
      id,
      label,
      detail,
      icon,
      group,
    }));
}

function localeDirection(locale: WorkspaceLocale): "ltr" | "rtl" {
  return locale === "ar-EG" ? "rtl" : "ltr";
}

function formatRoleLabel(
  role: SessionSummary["role"],
  locale: WorkspaceLocale,
): string {
  if (locale === "ar-EG") {
    return {
      admin: "مدير",
      doctor: "طبيب",
      nurse: "تمريض",
      receptionist: "استقبال",
    }[role];
  }
  return role;
}

function getGroupLabel(
  group: ShellNavigationGroup,
  labels: ShellLabels,
): string {
  return {
    today: labels.todayGroup,
    "front-desk": labels.frontDeskGroup,
    clinical: labels.clinicalGroup,
    operations: labels.operationsGroup,
    insights: labels.insightsGroup,
    system: labels.systemGroup,
  }[group];
}

const NAVIGATION_GROUPS: readonly ShellNavigationGroup[] = [
  "today",
  "front-desk",
  "clinical",
  "operations",
  "insights",
  "system",
];

export function AppShell({
  session,
  locale,
  labels,
  onLocaleChange,
  onLogout,
  children,
}: AppShellProps): ReactElement {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState("workspace-overview");
  const navigation = useMemo(
    () => getVisibleShellNavigation(session.capabilities, labels),
    [labels, session.capabilities],
  );

  useEffect(() => {
    const syncFromHash = (): void => {
      const section = window.location.hash.slice(1);
      if (section && navigation.some((item) => item.id === section)) {
        setActiveSection(section);
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [navigation]);

  return (
    <div
      className={`app-shell${isCollapsed ? " is-collapsed" : ""}`}
      dir={localeDirection(locale)}
      lang={locale}
    >
      <aside className="app-sidebar" aria-label={labels.primaryNavigationLabel}>
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            E
          </span>
          <span className="brand-copy">
            <strong>{labels.appName}</strong>
            <small>ايليت · Cairo branch</small>
          </span>
        </div>
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={
            isCollapsed ? labels.expandNavigation : labels.collapseNavigation
          }
          aria-expanded={!isCollapsed}
          onClick={() => setIsCollapsed((current) => !current)}
        >
          <span aria-hidden="true">{isCollapsed ? "→" : "←"}</span>
          <span className="visually-hidden">
            {isCollapsed ? labels.expandNavigation : labels.collapseNavigation}
          </span>
        </button>
        <nav className="sidebar-nav">
          <p className="sidebar-label">{labels.workspaceLabel}</p>
          {NAVIGATION_GROUPS.map((group) => {
            const items = navigation.filter((item) => item.group === group);
            if (items.length === 0) return null;
            return (
              <div className="sidebar-group" key={group}>
                <p className="sidebar-group-label">
                  {getGroupLabel(group, labels)}
                </p>
                {items.map((item) => (
                  <a
                    className={`sidebar-link${activeSection === item.id ? " is-active" : ""}`}
                    href={`#${item.id}`}
                    key={item.id}
                    aria-current={
                      activeSection === item.id ? "page" : undefined
                    }
                    onClick={() => setActiveSection(item.id)}
                  >
                    <span className="sidebar-link-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="sidebar-link-copy">
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </a>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="local-status-dot" aria-hidden="true" />
          <span className="sidebar-link-copy">
            <strong>{labels.workingLocally}</strong>
            <small>{labels.encryptedStore}</small>
          </span>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-heading">
            <span className="topbar-kicker">{labels.appName}</span>
            <strong>{labels.clinicWorkspace}</strong>
          </div>
          <div className="topbar-actions">
            <label className="locale-control">
              <span className="visually-hidden">
                {labels.interfaceLanguage}
              </span>
              <select
                aria-label={labels.interfaceLanguage}
                value={locale}
                onChange={(event) =>
                  onLocaleChange(event.target.value as WorkspaceLocale)
                }
              >
                <option value="en-EG">English</option>
                <option value="ar-EG">العربية</option>
              </select>
            </label>
            <span className="topbar-status">
              <span className="local-status-dot" aria-hidden="true" />
              {labels.localFirst}
            </span>
            <span className="role-chip">
              {formatRoleLabel(session.role, locale)}
            </span>
            <button
              className="button ghost small"
              type="button"
              onClick={() => void onLogout()}
            >
              {labels.signOut}
            </button>
          </div>
        </header>
        <main className="app-content" aria-label={labels.clinicWorkspace}>
          {children}
        </main>
      </div>
    </div>
  );
}
