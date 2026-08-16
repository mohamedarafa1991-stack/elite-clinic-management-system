import {
  StrictMode,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { createRoot } from "react-dom/client";
import type {
  AuthStatus,
  EliteSecurityStatus,
  SessionSummary,
} from "../preload/index.js";
import "./styles.css";

interface BootstrapFormState {
  primaryUsername: string;
  primaryPassword: string;
  primaryDisplayName: string;
  backupUsername: string;
  backupPassword: string;
  backupDisplayName: string;
  hubDeviceName: string;
}

const initialBootstrap: BootstrapFormState = {
  primaryUsername: "",
  primaryPassword: "",
  primaryDisplayName: "",
  backupUsername: "",
  backupPassword: "",
  backupDisplayName: "",
  hubDeviceName: "Elite Windows Hub",
};

function ErrorMessage({
  message,
}: {
  message: string | null;
}): ReactElement | null {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}

function BootstrapForm({
  onComplete,
}: {
  onComplete: (status: AuthStatus) => void;
}): ReactElement {
  const [form, setForm] = useState(initialBootstrap);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (key: keyof BootstrapFormState, value: string): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await window.elite.auth.bootstrap({
        admins: [
          {
            username: form.primaryUsername,
            password: form.primaryPassword,
            displayNameEn: form.primaryDisplayName,
          },
          {
            username: form.backupUsername,
            password: form.backupPassword,
            displayNameEn: form.backupDisplayName,
          },
        ],
        hubDevice: {
          friendlyName: form.hubDeviceName,
          appVersion: "0.1.0-dev",
        },
      });
      onComplete({
        configured: true,
        bootstrapRequired: false,
        hubDeviceId: result.hubDeviceId,
      });
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to complete secure Admin setup",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card auth-card" aria-labelledby="bootstrap-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">First-launch setup</p>
          <h2 id="bootstrap-title">Create the two initial Admin accounts</h2>
        </div>
        <span className="status warn">One-time action</span>
      </div>
      <p className="form-help">
        Use two different usernames and strong passwords. Passwords are hashed
        with Argon2id and are never stored in the renderer.
      </p>
      <ErrorMessage message={error} />
      <form className="form" onSubmit={submit}>
        <div className="form-section">
          <h3>Primary Admin</h3>
          <div className="form-grid">
            <label>
              Username
              <input
                required
                minLength={3}
                value={form.primaryUsername}
                onChange={(event) =>
                  update("primaryUsername", event.target.value)
                }
                autoComplete="username"
              />
            </label>
            <label>
              Display name
              <input
                required
                value={form.primaryDisplayName}
                onChange={(event) =>
                  update("primaryDisplayName", event.target.value)
                }
              />
            </label>
            <label>
              Password
              <input
                required
                minLength={12}
                type="password"
                value={form.primaryPassword}
                onChange={(event) =>
                  update("primaryPassword", event.target.value)
                }
                autoComplete="new-password"
              />
            </label>
          </div>
        </div>
        <div className="form-section">
          <h3>Backup Admin</h3>
          <div className="form-grid">
            <label>
              Username
              <input
                required
                minLength={3}
                value={form.backupUsername}
                onChange={(event) =>
                  update("backupUsername", event.target.value)
                }
                autoComplete="username"
              />
            </label>
            <label>
              Display name
              <input
                required
                value={form.backupDisplayName}
                onChange={(event) =>
                  update("backupDisplayName", event.target.value)
                }
              />
            </label>
            <label>
              Password
              <input
                required
                minLength={12}
                type="password"
                value={form.backupPassword}
                onChange={(event) =>
                  update("backupPassword", event.target.value)
                }
                autoComplete="new-password"
              />
            </label>
          </div>
        </div>
        <label>
          Hub device name
          <input
            required
            value={form.hubDeviceName}
            onChange={(event) => update("hubDeviceName", event.target.value)}
          />
        </label>
        <button
          className="button primary"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating secure accounts…" : "Create Admin accounts"}
        </button>
      </form>
    </section>
  );
}

function LoginForm({
  deviceId,
  onLogin,
}: {
  deviceId: string;
  onLogin: (token: string, session: SessionSummary) => void;
}): ReactElement {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await window.elite.auth.login({
        username,
        password,
        deviceId,
      });
      onLogin(result.token, result.session);
      setPassword("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card auth-card" aria-labelledby="login-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Protected access</p>
          <h2 id="login-title">Sign in to Elite</h2>
        </div>
        <span className="status ok">Individual account</span>
      </div>
      <p className="form-help">
        Sessions are held in memory for this renderer and are linked to the
        approved Hub device.
      </p>
      <ErrorMessage message={error} />
      <form className="form" onSubmit={submit}>
        <label>
          Username
          <input
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button
          className="button primary"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}

function DevicePanel({ token }: { token: string }): ReactElement {
  const [devices, setDevices] = useState<
    readonly import("../preload/index.js").DeviceSummary[]
  >([]);
  const [requests, setRequests] = useState<
    readonly import("../preload/index.js").EnrollmentRequestSummary[]
  >([]);
  const [friendlyName, setFriendlyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextDevices, nextRequests] = await Promise.all([
        window.elite.auth.listDevices(token),
        window.elite.auth.listEnrollmentRequests(token),
      ]);
      setDevices(nextDevices);
      setRequests(nextRequests);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load device security data",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const requestDevice = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const request = await window.elite.auth.requestDevice(token, {
        friendlyName,
        platform: "android",
        appVersion: "0.1.0-dev",
        apiLevel: 29,
      });
      setFriendlyName("");
      setNotice(
        `Enrollment request ${request.requestId} created for ${request.deviceId}.`,
      );
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create enrollment request",
      );
    }
  };

  const approve = async (requestId: string): Promise<void> => {
    setError(null);
    try {
      await window.elite.auth.approveDevice(token, requestId);
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to approve device",
      );
    }
  };

  const reject = async (requestId: string): Promise<void> => {
    const reason = window.prompt("Reason for rejecting this device:");
    if (!reason) return;
    setError(null);
    try {
      await window.elite.auth.rejectDevice(token, requestId, reason);
      await refresh();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Unable to reject device",
      );
    }
  };

  const revoke = async (deviceId: string): Promise<void> => {
    const reason = window.prompt("Reason for revoking this device:");
    if (!reason) return;
    setError(null);
    try {
      await window.elite.auth.revokeDevice(token, deviceId, reason);
      await refresh();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Unable to revoke device",
      );
    }
  };

  return (
    <section className="card auth-card" aria-labelledby="devices-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Admin control</p>
          <h2 id="devices-title">Devices and enrollment</h2>
        </div>
        <span className="status warn">Patient data access</span>
      </div>
      <p className="form-help">
        New Android devices remain pending until an Admin approves them.
        Revocation invalidates sessions and schedules a best-effort wipe when
        the device reconnects.
      </p>
      <ErrorMessage message={error} />
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <form
        className="inline-form"
        onSubmit={(event) => void requestDevice(event)}
      >
        <label className="inline-label">
          New Android device name
          <input
            required
            value={friendlyName}
            onChange={(event) => setFriendlyName(event.target.value)}
            placeholder="e.g. Dr Ahmed Phone"
          />
        </label>
        <button className="button primary" type="submit">
          Create pending device
        </button>
      </form>
      <div className="device-section">
        <h3>Pending enrollment requests</h3>
        {isLoading ? (
          <p className="muted">Loading device records…</p>
        ) : requests.filter((request) => request.status === "pending")
            .length === 0 ? (
          <p className="muted">No pending requests.</p>
        ) : (
          <div className="device-list">
            {requests
              .filter((request) => request.status === "pending")
              .map((request) => (
                <div className="device-row" key={request.requestId}>
                  <div>
                    <strong>{request.device.friendlyName}</strong>
                    <span>
                      {request.device.platform} · API{" "}
                      {request.device.apiLevel ?? "unknown"} · requested{" "}
                      {new Date(request.requestedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="row-actions">
                    <button
                      className="button small primary"
                      type="button"
                      onClick={() => void approve(request.requestId)}
                    >
                      Approve
                    </button>
                    <button
                      className="button small secondary"
                      type="button"
                      onClick={() => void reject(request.requestId)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
      <div className="device-section">
        <h3>Registered devices</h3>
        {devices.length === 0 ? (
          <p className="muted">No registered devices.</p>
        ) : (
          <div className="device-list">
            {devices.map((device) => (
              <div className="device-row" key={device.id}>
                <div>
                  <strong>{device.friendlyName}</strong>
                  <span>
                    {device.platform} · {device.status} · {device.appVersion}
                    {device.securityPatchLevel
                      ? ` · patch ${device.securityPatchLevel}`
                      : ""}
                  </span>
                </div>
                {device.status === "active" ? (
                  <button
                    className="button small danger"
                    type="button"
                    onClick={() => void revoke(device.id)}
                  >
                    Revoke
                  </button>
                ) : (
                  <span
                    className={`status ${device.status === "wipe-pending" ? "warn" : "ok"}`}
                  >
                    {device.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AuthenticatedView({
  token,
  session,
  onLogout,
}: {
  token: string;
  session: SessionSummary;
  onLogout: () => void;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const logout = async (): Promise<void> => {
    try {
      await window.elite.auth.logout(token);
      onLogout();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to sign out");
    }
  };

  return (
    <section className="card auth-card" aria-labelledby="session-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Authenticated session</p>
          <h2 id="session-title">Welcome, {session.username}</h2>
        </div>
        <span className="status ok">{session.role}</span>
      </div>
      <ErrorMessage message={error} />
      <dl className="status-grid">
        <div>
          <dt>Device</dt>
          <dd>{session.deviceId}</dd>
        </div>
        <div>
          <dt>Session expires</dt>
          <dd>{new Date(session.expiresAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Capabilities</dt>
          <dd>{session.capabilities.length}</dd>
        </div>
        <div>
          <dt>Clinical approval</dt>
          <dd>
            {session.capabilities.includes("clinical.approve")
              ? "Doctor capability"
              : "Not assigned"}
          </dd>
        </div>
      </dl>
      <div className="capability-list">
        <strong>Active capabilities</strong>
        <span>{session.capabilities.join(" · ")}</span>
      </div>
      {session.role === "admin" &&
      session.capabilities.includes("device.manage") ? (
        <DevicePanel token={token} />
      ) : null}
      <button
        className="button secondary"
        type="button"
        onClick={() => void logout()}
      >
        Sign out
      </button>
    </section>
  );
}

function FoundationStatus(): ReactElement {
  const [security, setSecurity] = useState<EliteSecurityStatus | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      window.elite.app.getSecurityStatus(),
      window.elite.auth.getStatus(),
    ])
      .then(([securityResult, authResult]) => {
        setSecurity(securityResult);
        setAuthStatus(authResult);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to initialize secure services",
        ),
      );
  }, []);

  const handleLogin = (newToken: string, newSession: SessionSummary): void => {
    setToken(newToken);
    setSession(newSession);
  };

  const handleLogout = (): void => {
    setToken(null);
    setSession(null);
  };

  return (
    <main className="shell" aria-labelledby="page-title">
      <header className="header">
        <div>
          <p className="eyebrow">Elite Clinic Management System</p>
          <h1 id="page-title">Secure access foundation</h1>
          <p className="subtitle">
            Authentication, Admin bootstrap, capability enforcement, and device
            enrollment are now connected to the local secure service boundary.
          </p>
        </div>
        <div className="badge">Step 2</div>
      </header>

      <section className="card" aria-labelledby="status-title">
        <div className="card-heading">
          <h2 id="status-title">Foundation status</h2>
          <span
            className={
              security?.secureServicesReady ? "status ok" : "status warn"
            }
          >
            {security?.secureServicesReady
              ? "Secure services ready"
              : "Checking secure services"}
          </span>
        </div>
        <ErrorMessage message={security?.serviceError ?? error} />
        {security ? (
          <dl className="status-grid">
            <div>
              <dt>Electron</dt>
              <dd>{security.electronVersion}</dd>
            </div>
            <div>
              <dt>OS-backed storage</dt>
              <dd>
                {security.safeStorageAvailable ? "Available" : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{security.isPackaged ? "Production" : "Development"}</dd>
            </div>
            <div>
              <dt>Local auth</dt>
              <dd>
                {authStatus?.configured ? "Configured" : "Bootstrap required"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Checking the secure main-process boundary…</p>
        )}
      </section>

      {authStatus?.bootstrapRequired ? (
        <BootstrapForm onComplete={setAuthStatus} />
      ) : null}
      {!authStatus?.bootstrapRequired && !session && authStatus?.hubDeviceId ? (
        <LoginForm deviceId={authStatus.hubDeviceId} onLogin={handleLogin} />
      ) : null}
      {token && session ? (
        <AuthenticatedView
          token={token}
          session={session}
          onLogout={handleLogout}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FoundationStatus />
  </StrictMode>,
);
