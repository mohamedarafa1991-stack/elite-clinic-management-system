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
import type {
  DuplicateCandidate,
  Patient,
  PatientRegistrationInput,
  PatientUpdateInput,
} from "@elite/contracts";
import type { RelatedPersonSummary } from "@elite/auth";
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

function PatientWorkspace({
  token,
  session,
}: {
  token: string;
  session: SessionSummary;
}): ReactElement {
  const [patients, setPatients] = useState<readonly Patient[]>([]);
  const [query, setQuery] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState<
    "female" | "male" | "intersex" | "unknown" | ""
  >("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [registrationMode, setRegistrationMode] = useState<"quick" | "full">(
    "quick",
  );
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [relatedPersons, setRelatedPersons] = useState<
    readonly RelatedPersonSummary[]
  >([]);
  const [duplicates, setDuplicates] = useState<readonly DuplicateCandidate[]>(
    [],
  );
  const [pendingInput, setPendingInput] =
    useState<PatientRegistrationInput | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{
    patientId: string;
    input: PatientUpdateInput;
    expectedVersion: number;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      setPatients(
        await window.elite.patients.search(token, { query, limit: 50 }),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load patients",
      );
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const buildInput = (): PatientRegistrationInput => ({
    registrationMode,
    nameEn,
    ...(nameAr.trim() ? { nameAr: nameAr.trim() } : {}),
    ...(dob ? { dob } : {}),
    ...(sex ? { sex } : {}),
    phone,
    ...(nationalId.trim() ? { nationalId: nationalId.trim() } : {}),
    relatedPersons: [],
  });

  const buildUpdateInput = (): PatientUpdateInput => ({
    registrationMode,
    nameEn,
    ...(nameAr.trim() ? { nameAr: nameAr.trim() } : {}),
    ...(dob ? { dob } : {}),
    ...(sex ? { sex } : {}),
    phone,
    ...(nationalId.trim() ? { nationalId: nationalId.trim() } : {}),
    relatedPersons: undefined,
  });

  const createPatient = async (
    input: PatientRegistrationInput,
    reason?: string,
  ): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.patients.create(token, input, reason);
      setSelectedPatient(null);
      setNameEn("");
      setNameAr("");
      setDob("");
      setSex("");
      setPhone("");
      setNationalId("");
      setRegistrationMode("quick");
      setRelatedPersons([]);
      setDuplicates([]);
      setPendingInput(null);
      setPendingEdit(null);
      setDecisionReason("");
      await refresh();
    } catch (reasonValue: unknown) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "Unable to register patient",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const input = buildInput();
    setIsBusy(true);
    setError(null);
    try {
      const candidates = await window.elite.patients.findDuplicates(
        token,
        input,
      );
      if (candidates.length > 0) {
        setDuplicates(candidates);
        setPendingInput(input);
        return;
      }
      await createPatient(input);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to check duplicate patients",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const selectPatient = async (patient: Patient): Promise<void> => {
    setSelectedPatient(patient);
    setNameEn(patient.nameEn);
    setNameAr(patient.nameAr ?? "");
    setDob(patient.dob ?? "");
    setSex(patient.sex ?? "");
    setPhone(patient.phone);
    setNationalId(patient.nationalId ?? "");
    setRegistrationMode(patient.registrationMode);
    setError(null);
    try {
      setRelatedPersons(
        await window.elite.relatedPersons.list(token, patient.patientId),
      );
    } catch (reason: unknown) {
      setRelatedPersons([]);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load related persons",
      );
    }
  };

  const saveProfile = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedPatient) return;
    const input = buildUpdateInput();
    setIsBusy(true);
    setError(null);
    try {
      const candidates = await window.elite.patients.findDuplicates(
        token,
        input,
        selectedPatient.patientId,
      );
      if (candidates.length > 0) {
        setDuplicates(candidates);
        setPendingEdit({
          patientId: selectedPatient.patientId,
          input,
          expectedVersion: selectedPatient.version,
        });
        return;
      }
      const updated = await window.elite.patients.update(
        token,
        selectedPatient.patientId,
        input,
        selectedPatient.version,
      );
      setSelectedPatient(updated);
      setDuplicates([]);
      setPendingEdit(null);
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save patient profile",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const confirmProfileDuplicate = async (): Promise<void> => {
    if (!pendingEdit) return;
    setIsBusy(true);
    setError(null);
    try {
      const updated = await window.elite.patients.update(
        token,
        pendingEdit.patientId,
        pendingEdit.input,
        pendingEdit.expectedVersion,
        decisionReason,
      );
      setSelectedPatient(updated);
      setDuplicates([]);
      setPendingEdit(null);
      setDecisionReason("");
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save duplicate-reviewed profile",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const archive = async (patient: Patient): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.patients.archive(
        token,
        patient.patientId,
        "Archived from Step 4 patient workspace",
      );
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to archive patient",
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="patients-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Step 4</p>
          <h2 id="patients-title">Patient identity workspace</h2>
        </div>
        <span className="status ok">Local-first</span>
      </div>
      <p className="form-help">
        Patient IDs are sequential and phones are not unique. Duplicate matches
        are warnings, never silent merges.
      </p>
      <ErrorMessage message={error} />
      <div className="patient-toolbar">
        <input
          aria-label="Search patients"
          placeholder="Search patient ID, name, or phone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void refresh();
          }}
        />
        <button
          className="button secondary"
          type="button"
          onClick={() => void refresh()}
          disabled={isBusy}
        >
          Search
        </button>
      </div>
      <form
        className="form patient-registration"
        onSubmit={(event) => {
          if (selectedPatient) void saveProfile(event);
          else void submit(event);
        }}
      >
        <div className="form-heading-row">
          <h3>
            {selectedPatient
              ? `Edit ${selectedPatient.patientId}`
              : "Patient registration"}
          </h3>
          {selectedPatient ? (
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setSelectedPatient(null);
                setRelatedPersons([]);
                setNameEn("");
                setNameAr("");
                setDob("");
                setSex("");
                setPhone("");
                setNationalId("");
                setRegistrationMode("quick");
              }}
            >
              New patient
            </button>
          ) : null}
        </div>
        <div className="form-grid">
          <label>
            Registration mode
            <select
              value={registrationMode}
              onChange={(event) =>
                setRegistrationMode(event.target.value as "quick" | "full")
              }
            >
              <option value="quick">Quick</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label>
            Full English name
            <input
              required
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
            />
          </label>
          <label>
            Phone
            <input
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>
        {registrationMode === "full" ? (
          <div className="form-grid full-registration-fields">
            <label>
              Arabic name
              <input
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
              />
            </label>
            <label>
              Date of birth
              <input
                type="date"
                value={dob}
                onChange={(event) => setDob(event.target.value)}
              />
            </label>
            <label>
              Sex
              <select
                value={sex}
                onChange={(event) => setSex(event.target.value as typeof sex)}
              >
                <option value="">Not recorded</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="intersex">Intersex</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label>
              National ID (optional)
              <input
                value={nationalId}
                onChange={(event) => setNationalId(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <button className="button primary" type="submit" disabled={isBusy}>
          {selectedPatient ? "Check and save profile" : "Check and register"}
        </button>
      </form>
      {pendingInput || pendingEdit ? (
        <div className="duplicate-panel" role="alert">
          <h3>Possible duplicate patients</h3>
          <p>
            Review the matched signals. You may cancel or explicitly{" "}
            {pendingEdit ? "save this profile" : "create another patient"} with
            a reason.
          </p>
          {duplicates.map((candidate) => (
            <div className="duplicate-row" key={candidate.patient.id}>
              <strong>
                {candidate.patient.patientId} — {candidate.patient.nameEn}
              </strong>
              <span>
                Score {candidate.score} · {candidate.severity}
              </span>
              <span>
                {candidate.signals.map((signal) => signal.code).join(", ")}
              </span>
            </div>
          ))}
          <label>
            Reason to create another patient
            <input
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              minLength={3}
            />
          </label>
          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setPendingInput(null);
                setPendingEdit(null);
                setDuplicates([]);
              }}
            >
              Cancel
            </button>
            <button
              className="button primary"
              type="button"
              disabled={decisionReason.trim().length < 3 || isBusy}
              onClick={() => {
                if (pendingEdit) void confirmProfileDuplicate();
                else if (pendingInput)
                  void createPatient(pendingInput, decisionReason);
              }}
            >
              {pendingEdit
                ? "Save profile after review"
                : "Create another patient"}
            </button>
          </div>
        </div>
      ) : null}
      <div className="patient-list" aria-live="polite">
        {patients.length === 0 ? (
          <p className="muted">No active patients match this search.</p>
        ) : null}
        {patients.map((patient) => (
          <article className="patient-row" key={patient.id}>
            <div>
              <strong>{patient.patientId}</strong>
              <span>{patient.nameEn}</span>
              <small>
                {patient.phone} · {patient.completenessStatus} ·{" "}
                {patient.status}
              </small>
            </div>
            <button
              className="button secondary"
              type="button"
              disabled={isBusy}
              onClick={() => void selectPatient(patient)}
            >
              Open profile
            </button>
            {session.capabilities.includes("patient.archive") &&
            patient.status === "active" ? (
              <button
                className="button danger"
                type="button"
                disabled={isBusy}
                onClick={() => void archive(patient)}
              >
                Archive
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {selectedPatient ? (
        <div className="profile-summary">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Patient profile</p>
              <h3>
                {selectedPatient.patientId} · {selectedPatient.nameEn}
              </h3>
            </div>
            <span
              className={`status ${selectedPatient.status === "active" ? "ok" : "warn"}`}
            >
              {selectedPatient.status}
            </span>
          </div>
          <dl className="status-grid profile-grid">
            <div>
              <dt>English name</dt>
              <dd>{selectedPatient.nameEn}</dd>
            </div>
            <div>
              <dt>Arabic name</dt>
              <dd>{selectedPatient.nameAr ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Date of birth</dt>
              <dd>{selectedPatient.dob ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>National ID</dt>
              <dd>
                {selectedPatient.nationalId ? "Recorded" : "Not recorded"}
              </dd>
            </div>
          </dl>
          <h4>Related persons and guardians</h4>
          {relatedPersons.length === 0 ? (
            <p className="muted">No related persons linked.</p>
          ) : (
            <div className="related-person-list">
              {relatedPersons.map((person) => (
                <div className="related-person-row" key={person.id}>
                  <strong>{person.displayNameEn}</strong>
                  <span>
                    {person.relationship} · {person.phoneNumbers.join(", ")}
                  </span>
                  <small>
                    {person.isGuardian ? "Guardian" : "Related person"} ·{" "}
                    {person.isAuthorizedToConsent
                      ? "Consent authorized"
                      : "No consent authority"}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
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
      {session.capabilities.includes("patient.read") ? (
        <PatientWorkspace token={token} session={session} />
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
            Authentication, encrypted local storage, patient identity, guardian
            links, duplicate review, and controlled archive workflows are
            connected to the local secure service boundary.
          </p>
        </div>
        <div className="badge">Step 4</div>
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
              <dt>Database key provider</dt>
              <dd>{security.databaseKeyProvider}</dd>
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
