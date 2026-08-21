import { useMemo, useState, type ReactElement } from "react";
import type { SessionSummary } from "../preload/index.cjs";
import type { WorkspaceLocale, WorkspaceTheme } from "./workspace-model.js";

export type ShellNavigationGroup =
  "today" | "front-desk" | "clinical" | "operations" | "insights" | "system";

export interface ShellLabels {
  appName: string;
  clinicWorkspace: string;
  localFirst: string;
  workingLocally: string;
  encryptedStore: string;
  interfaceLanguage: string;
  visualTheme?: string;
  lightTheme?: string;
  darkTheme?: string;
  highContrastTheme?: string;
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
  more?: string;
  moreDetail?: string;
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
  theme?: WorkspaceTheme;
  onThemeChange?: (theme: WorkspaceTheme) => void;
  onLogout: () => Promise<void>;
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
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

const PRIMARY_NAVIGATION_IDS = new Set([
  "workspace-overview",
  "workspace-patients",
  "workspace-appointments",
  "workspace-doctors",
  "workspace-billing",
]);

export function AppShell({
  session,
  locale,
  labels,
  onLocaleChange,
  theme,
  onThemeChange,
  onLogout,
  activeSection,
  onSectionChange,
  children,
}: AppShellProps): ReactElement {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMoreExpanded, setIsMoreExpanded] = useState(false);
  const navigation = useMemo(
    () => getVisibleShellNavigation(session.capabilities, labels),
    [labels, session.capabilities],
  );
  const primaryNavigation = useMemo(
    () => navigation.filter((item) => PRIMARY_NAVIGATION_IDS.has(item.id)),
    [navigation],
  );
  const secondaryNavigation = useMemo(
    () => navigation.filter((item) => !PRIMARY_NAVIGATION_IDS.has(item.id)),
    [navigation],
  );
  const isMoreActive = secondaryNavigation.some(
    (item) => item.id === activeSection,
  );
  const showMore = isMoreExpanded || isMoreActive;
  const moreLabel = labels.more ?? (locale === "ar-EG" ? "المزيد" : "More");
  const moreDetail =
    labels.moreDetail ??
    (locale === "ar-EG"
      ? "التقارير والإعدادات والأدوات"
      : "Reports, settings, and tools");
  const renderNavigationLink = (item: ShellNavigationItem): ReactElement => (
    <a
      className={`sidebar-link${activeSection === item.id ? " is-active" : ""}`}
      href={`#${item.id}`}
      key={item.id}
      aria-current={activeSection === item.id ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        onSectionChange(item.id);
        if (!PRIMARY_NAVIGATION_IDS.has(item.id)) setIsMoreExpanded(true);
      }}
    >
      <span className="sidebar-link-icon" aria-hidden="true">
        {item.icon}
      </span>
      <span className="sidebar-link-copy">
        <strong>{item.label}</strong>
        <small>{item.detail}</small>
      </span>
    </a>
  );

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
          <div className="sidebar-group sidebar-primary-group">
            {primaryNavigation.map(renderNavigationLink)}
          </div>
          {secondaryNavigation.length > 0 ? (
            <div className="sidebar-group sidebar-more-group">
              <button
                className={`sidebar-more-toggle${showMore ? " is-open" : ""}`}
                type="button"
                aria-expanded={showMore}
                onClick={() => setIsMoreExpanded((current) => !current)}
              >
                <span className="sidebar-link-icon" aria-hidden="true">
                  ⋯
                </span>
                <span className="sidebar-link-copy">
                  <strong>{moreLabel}</strong>
                  <small>{moreDetail}</small>
                </span>
                <span className="sidebar-more-chevron" aria-hidden="true">
                  {showMore ? "⌃" : "⌄"}
                </span>
              </button>
              {showMore ? (
                <div className="sidebar-secondary-nav">
                  {secondaryNavigation.map(renderNavigationLink)}
                </div>
              ) : null}
            </div>
          ) : null}
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
            {theme && onThemeChange ? (
              <label className="theme-control">
                <span className="visually-hidden">
                  {labels.visualTheme ?? "Theme"}
                </span>
                <select
                  aria-label={labels.visualTheme ?? "Theme"}
                  value={theme}
                  onChange={(event) =>
                    onThemeChange(event.target.value as WorkspaceTheme)
                  }
                >
                  <option value="light">{labels.lightTheme ?? "Light"}</option>
                  <option value="dark">{labels.darkTheme ?? "Dark"}</option>
                  <option value="high-contrast">
                    {labels.highContrastTheme ?? "High contrast"}
                  </option>
                </select>
              </label>
            ) : null}
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
