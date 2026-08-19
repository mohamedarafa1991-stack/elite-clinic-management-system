import type { SessionSummary } from "../preload/index.js";
import { useState, type ReactElement } from "react";
import type { WorkspaceLocale } from "./workspace-model.js";

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
  overview: string;
  overviewDetail: string;
  patients: string;
  patientsDetail: string;
  careSchedule: string;
  careScheduleDetail: string;
  billing: string;
  billingDetail: string;
  doctors: string;
  doctorsDetail: string;
  governance: string;
  governanceDetail: string;
}

export interface ShellNavigationItem {
  id: string;
  label: string;
  detail: string;
}

export interface AppShellProps {
  session: SessionSummary;
  locale: WorkspaceLocale;
  labels: ShellLabels;
  onLocaleChange: (locale: WorkspaceLocale) => void;
  onLogout: () => Promise<void>;
  children: ReactElement;
}

export function getVisibleShellNavigation(
  capabilities: readonly string[],
  labels: ShellLabels,
): readonly ShellNavigationItem[] {
  const has = (capability: string): boolean =>
    capabilities.includes(capability);
  return [
    {
      id: "workspace-overview",
      label: labels.overview,
      detail: labels.overviewDetail,
      visible: true,
    },
    {
      id: "workspace-patients",
      label: labels.patients,
      detail: labels.patientsDetail,
      visible: has("patient.read"),
    },
    {
      id: "workspace-care",
      label: labels.careSchedule,
      detail: labels.careScheduleDetail,
      visible: has("appointment.read"),
    },
    {
      id: "workspace-billing",
      label: labels.billing,
      detail: labels.billingDetail,
      visible: has("billing.read"),
    },
    {
      id: "workspace-doctors",
      label: labels.doctors,
      detail: labels.doctorsDetail,
      visible: has("doctor.profile.read"),
    },
    {
      id: "workspace-governance",
      label: labels.governance,
      detail: labels.governanceDetail,
      visible: has("export.manage") || has("device.manage"),
    },
  ]
    .filter((item) => item.visible)
    .map(({ id, label, detail }) => ({ id, label, detail }));
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
  const navigation = getVisibleShellNavigation(session.capabilities, labels);

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
          {navigation.map((item) => (
            <a
              className={`sidebar-link${activeSection === item.id ? " is-active" : ""}`}
              href={`#${item.id}`}
              key={item.id}
              aria-current={activeSection === item.id ? "page" : undefined}
              onClick={() => setActiveSection(item.id)}
            >
              <span className="sidebar-link-icon" aria-hidden="true">
                {item.label.slice(0, 1)}
              </span>
              <span className="sidebar-link-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
            </a>
          ))}
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
