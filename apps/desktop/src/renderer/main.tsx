import { StrictMode, useEffect, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { EliteSecurityStatus } from "../preload/index.js";

function FoundationStatus(): ReactElement {
  const [status, setStatus] = useState<EliteSecurityStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.elite.app
      .getSecurityStatus()
      .then(setStatus)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to read foundation status",
        );
      });
  }, []);

  return (
    <main className="shell" aria-labelledby="page-title">
      <header className="header">
        <div>
          <p className="eyebrow">Elite Clinic Management System</p>
          <h1 id="page-title">Secure foundation initialized</h1>
          <p className="subtitle">
            The application shell is running without direct renderer access to
            files, databases, or operating-system APIs.
          </p>
        </div>
        <div className="badge">Step 1</div>
      </header>

      <section className="card" aria-labelledby="status-title">
        <div className="card-heading">
          <h2 id="status-title">Foundation status</h2>
          <span
            className={
              status?.safeStorageAvailable ? "status ok" : "status warn"
            }
          >
            {status?.safeStorageAvailable
              ? "OS-backed storage available"
              : "Storage check pending"}
          </span>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {status ? (
          <dl className="status-grid">
            <div>
              <dt>Electron</dt>
              <dd>{status.electronVersion}</dd>
            </div>
            <div>
              <dt>Chromium</dt>
              <dd>{status.chromiumVersion}</dd>
            </div>
            <div>
              <dt>Node</dt>
              <dd>{status.nodeVersion}</dd>
            </div>
            <div>
              <dt>Packaged build</dt>
              <dd>{status.isPackaged ? "Yes" : "Development"}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Checking the secure main-process boundary…</p>
        )}
      </section>

      <section className="grid" aria-label="Step 1 work areas">
        <article className="card compact">
          <h2>Database</h2>
          <p>
            Migration history, patient identity, related persons, appointments,
            audit events, and synchronization queues are being established with
            synthetic fixtures only.
          </p>
        </article>
        <article className="card compact">
          <h2>Security</h2>
          <p>
            Context isolation, sandboxing, restrictive CSP, typed preload APIs,
            and a production encryption gate are enabled in the foundation.
          </p>
        </article>
        <article className="card compact">
          <h2>Next</h2>
          <p>
            After verification, the next step is authentication, Admin setup,
            device enrollment, and encrypted local-store integration.
          </p>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FoundationStatus />
  </StrictMode>,
);
