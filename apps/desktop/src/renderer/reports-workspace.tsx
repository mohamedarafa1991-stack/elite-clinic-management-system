import type { ReportsAnalytics } from "@elite/contracts";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { WorkspaceLocale } from "./workspace-model.js";

export interface ReportsWorkspaceLabels {
  title: string;
  detail: string;
  revenueTitle: string;
  patientTrendsTitle: string;
  invoiced: string;
  collected: string;
  refunded: string;
  newPatients: string;
  appointments: string;
  completedVisits: string;
  refresh: string;
  refreshing: string;
  loading: string;
  empty: string;
  unavailable: string;
  month: string;
  localAggregate: string;
}

export interface ReportsWorkspaceProps {
  token: string;
  locale: WorkspaceLocale;
  labels: ReportsWorkspaceLabels;
}

function formatMonth(month: string, locale: WorkspaceLocale): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, monthNumber! - 1, 1)));
}

function formatEgp(value: number, locale: WorkspaceLocale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ReportsWorkspace({
  token,
  locale,
  labels,
}: ReportsWorkspaceProps): ReactElement {
  const [analytics, setAnalytics] = useState<ReportsAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      setAnalytics(await window.elite.reports.getAnalytics(token));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : labels.unavailable);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const totals = useMemo(() => {
    const revenue = analytics?.revenue ?? [];
    const patientTrends = analytics?.patientTrends ?? [];
    return {
      invoicedEgp: revenue.reduce((sum, point) => sum + point.invoicedEgp, 0),
      collectedEgp: revenue.reduce((sum, point) => sum + point.collectedEgp, 0),
      newPatients: patientTrends.reduce(
        (sum, point) => sum + point.newPatients,
        0,
      ),
    };
  }, [analytics]);

  const revenueMax = Math.max(
    1,
    ...(analytics?.revenue.map((point) => point.invoicedEgp) ?? []),
  );
  const patientMax = Math.max(
    1,
    ...(analytics?.patientTrends.map((point) => point.newPatients) ?? []),
  );

  return (
    <section className="card reports-workspace" aria-labelledby="reports-title">
      <div className="card-heading reports-heading">
        <div>
          <p className="eyebrow">{labels.localAggregate}</p>
          <h2 id="reports-title">{labels.title}</h2>
          <p className="form-help">{labels.detail}</p>
        </div>
        <button
          className="button secondary"
          type="button"
          disabled={isLoading}
          onClick={() => void refresh()}
        >
          {isLoading ? labels.refreshing : labels.refresh}
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {isLoading ? (
        <p className="muted">{labels.loading}</p>
      ) : analytics ? (
        <>
          <div className="reports-metric-grid">
            <article className="reports-metric-card">
              <span>{labels.invoiced}</span>
              <strong>{formatEgp(totals.invoicedEgp, locale)}</strong>
              <small>
                {analytics.fromMonth} – {analytics.toMonth}
              </small>
            </article>
            <article className="reports-metric-card metric-accent">
              <span>{labels.collected}</span>
              <strong>{formatEgp(totals.collectedEgp, locale)}</strong>
              <small>{labels.localAggregate}</small>
            </article>
            <article className="reports-metric-card">
              <span>{labels.newPatients}</span>
              <strong>{totals.newPatients}</strong>
              <small>
                {analytics.fromMonth} – {analytics.toMonth}
              </small>
            </article>
          </div>
          <div className="reports-chart-grid">
            <section
              className="reports-panel"
              aria-labelledby="revenue-chart-title"
            >
              <div className="reports-panel-heading">
                <h3 id="revenue-chart-title">{labels.revenueTitle}</h3>
                <span className="status ok">EGP</span>
              </div>
              <div
                className="reports-bar-chart"
                role="img"
                aria-label={labels.revenueTitle}
              >
                {analytics.revenue.map((point) => (
                  <div className="reports-bar-column" key={point.month}>
                    <span className="reports-bar-value">
                      {formatEgp(point.invoicedEgp, locale)}
                    </span>
                    <div className="reports-bar-track">
                      <span
                        className="reports-bar-fill revenue-fill"
                        style={{
                          height: `${Math.max(4, (point.invoicedEgp / revenueMax) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>{formatMonth(point.month, locale)}</small>
                  </div>
                ))}
              </div>
            </section>
            <section
              className="reports-panel"
              aria-labelledby="patient-trends-title"
            >
              <div className="reports-panel-heading">
                <h3 id="patient-trends-title">{labels.patientTrendsTitle}</h3>
                <span className="status info">{labels.newPatients}</span>
              </div>
              <div
                className="reports-bar-chart"
                role="img"
                aria-label={labels.patientTrendsTitle}
              >
                {analytics.patientTrends.map((point) => (
                  <div className="reports-bar-column" key={point.month}>
                    <span className="reports-bar-value">
                      {point.newPatients}
                    </span>
                    <div className="reports-bar-track">
                      <span
                        className="reports-bar-fill patient-fill"
                        style={{
                          height: `${Math.max(4, (point.newPatients / patientMax) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>{formatMonth(point.month, locale)}</small>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>{labels.month}</th>
                  <th>{labels.invoiced}</th>
                  <th>{labels.collected}</th>
                  <th>{labels.refunded}</th>
                  <th>{labels.newPatients}</th>
                  <th>{labels.appointments}</th>
                  <th>{labels.completedVisits}</th>
                </tr>
              </thead>
              <tbody>
                {analytics.revenue.map((point, index) => {
                  const patientPoint = analytics.patientTrends[index];
                  return (
                    <tr key={point.month}>
                      <td>{formatMonth(point.month, locale)}</td>
                      <td>{formatEgp(point.invoicedEgp, locale)}</td>
                      <td>{formatEgp(point.collectedEgp, locale)}</td>
                      <td>{formatEgp(point.refundedEgp, locale)}</td>
                      <td>{patientPoint?.newPatients ?? 0}</td>
                      <td>{patientPoint?.appointments ?? 0}</td>
                      <td>{patientPoint?.completedVisits ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="muted">{labels.empty}</p>
      )}
    </section>
  );
}
