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
  LanSyncStatus,
  SessionSummary,
} from "../preload/index.js";
import type {
  DuplicateCandidate,
  Patient,
  PatientMergeCase,
  PatientMergeField,
  PatientMergeFieldDecisions,
  PatientRegistrationInput,
  PatientUpdateInput,
  Appointment,
  AppointmentCreateInput,
  BillingInvoice,
  BillingInvoiceCreateInput,
  BillingPackage,
  BillingPayment,
  BillingPaymentInput,
  BillingRefundInput,
  Department,
  DoctorDirectoryEntry,
  MedicalHistoryEntry,
  MedicalHistoryInput,
  Diagnosis,
  DiagnosisInput,
  EncounterAmendmentDiff,
  ProjectionSnapshot,
  EncounterAmendment,
  EncounterAmendmentInput,
  EffectiveEncounter,
  ExportResult,
  ExportVerificationResult,
  ExportRevocation,
  ExportPackageRegistryRecord,
  ExportSigningKeyMetadata,
  ExportSigningKeyRecoveryBundle,
  ExportRecipient,
  ExportConsentEvidence,
  ExportDisclosure,
  ExportReceipt,
  FhirValidationResult,
  FhirProfileBundle,
  FhirProfileBundleRecord,
  OrgSettings,
  OrgSettingsInput,
  Encounter,
  EncounterInput,
  Icd10Code,
  Icd10CodeInput,
  Service,
  Specialty,
  Schedule,
  ScheduleException,
  ScheduleInput,
  ScheduleExceptionInput,
} from "@elite/contracts";
import type {
  PatientRelatedPersonLinkSummary,
  RelatedPersonInput,
  RelatedPersonLinkInput,
  RelatedPersonSummary,
} from "@elite/auth";
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

interface MedicalHistoryFormState extends MedicalHistoryInput {}
interface EncounterFormState extends EncounterInput {}
interface DiagnosisFormState extends DiagnosisInput {}
interface AmendmentFormState extends EncounterAmendmentInput {}

const emptyEncounterForm: EncounterFormState = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  followUp: "",
};

const emptyDiagnosisForm: DiagnosisFormState = {
  icd10CodeId: "",
  diagnosisTextEn: "",
  isPrimary: false,
};

const emptyAmendmentForm: AmendmentFormState = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  followUp: "",
  correctionReason: "",
};

const emptyMedicalHistoryForm: MedicalHistoryFormState = {
  category: "condition",
  title: "",
  details: "",
  onsetDate: "",
  status: "active",
  source: "clinician-recorded",
};

interface RelatedPersonFormState {
  displayNameEn: string;
  displayNameAr: string;
  relationship: string;
  phone: string;
  isGuardian: boolean;
  isAuthorizedToConsent: boolean;
  isAuthorizedToContact: boolean;
  verificationStatus: "unverified" | "verified";
  relationshipRole: string;
  isPrimary: boolean;
  consentAuthority: "none" | "inform" | "consent";
}

const emptyRelatedPersonForm: RelatedPersonFormState = {
  displayNameEn: "",
  displayNameAr: "",
  relationship: "",
  phone: "",
  isGuardian: true,
  isAuthorizedToConsent: true,
  isAuthorizedToContact: true,
  verificationStatus: "unverified",
  relationshipRole: "",
  isPrimary: false,
  consentAuthority: "consent",
};

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
  const [relatedLinks, setRelatedLinks] = useState<
    readonly PatientRelatedPersonLinkSummary[]
  >([]);
  const [medicalHistory, setMedicalHistory] = useState<
    readonly MedicalHistoryEntry[]
  >([]);
  const [medicalHistoryForm, setMedicalHistoryForm] =
    useState<MedicalHistoryFormState | null>(null);
  const [editingMedicalHistory, setEditingMedicalHistory] =
    useState<MedicalHistoryEntry | null>(null);
  const [medicalHistoryArchiveReason, setMedicalHistoryArchiveReason] =
    useState("");
  const [relatedPersonForm, setRelatedPersonForm] =
    useState<RelatedPersonFormState | null>(null);
  const [editingRelatedLink, setEditingRelatedLink] =
    useState<PatientRelatedPersonLinkSummary | null>(null);
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
      setRelatedLinks([]);
      setMedicalHistory([]);
      setMedicalHistoryForm(null);
      setEditingMedicalHistory(null);
      setMedicalHistoryArchiveReason("");
      setRelatedPersonForm(null);
      setEditingRelatedLink(null);
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
    setRelatedPersonForm(null);
    setEditingRelatedLink(null);
    setMedicalHistoryForm(null);
    setEditingMedicalHistory(null);
    setMedicalHistoryArchiveReason("");
    try {
      setRelatedLinks(
        await window.elite.relatedPersons.listLinks(token, patient.patientId),
      );
      setMedicalHistory(
        session.capabilities.includes("clinical.read")
          ? await window.elite.medicalHistory.list(token, patient.patientId)
          : [],
      );
    } catch (reason: unknown) {
      setRelatedLinks([]);
      setMedicalHistory([]);
      setRelatedPersonForm(null);
      setEditingRelatedLink(null);
      setMedicalHistoryForm(null);
      setEditingMedicalHistory(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load patient history",
      );
    }
  };

  const openNewMedicalHistory = (): void => {
    if (!selectedPatient) return;
    setEditingMedicalHistory(null);
    setMedicalHistoryForm({ ...emptyMedicalHistoryForm });
    setError(null);
  };

  const openEditMedicalHistory = (entry: MedicalHistoryEntry): void => {
    setEditingMedicalHistory(entry);
    setMedicalHistoryForm({
      category: entry.category,
      title: entry.title,
      ...(entry.details ? { details: entry.details } : { details: "" }),
      ...(entry.onsetDate ? { onsetDate: entry.onsetDate } : { onsetDate: "" }),
      status: entry.status,
      source: entry.source,
    });
    setError(null);
  };

  const saveMedicalHistory = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedPatient || !medicalHistoryForm) return;
    setIsBusy(true);
    setError(null);
    try {
      if (editingMedicalHistory) {
        await window.elite.medicalHistory.update(
          token,
          selectedPatient.patientId,
          editingMedicalHistory.id,
          medicalHistoryForm,
          editingMedicalHistory.version,
        );
      } else {
        await window.elite.medicalHistory.create(
          token,
          selectedPatient.patientId,
          medicalHistoryForm,
        );
      }
      setMedicalHistory(
        await window.elite.medicalHistory.list(
          token,
          selectedPatient.patientId,
        ),
      );
      setMedicalHistoryForm(null);
      setEditingMedicalHistory(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save medical history",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const archiveMedicalHistory = async (
    entry: MedicalHistoryEntry,
  ): Promise<void> => {
    if (!selectedPatient || medicalHistoryArchiveReason.trim().length < 3) {
      setError("Enter an audit reason before inactivating history");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.medicalHistory.archive(
        token,
        selectedPatient.patientId,
        entry.id,
        entry.version,
        medicalHistoryArchiveReason,
      );
      setMedicalHistory(
        await window.elite.medicalHistory.list(
          token,
          selectedPatient.patientId,
        ),
      );
      setMedicalHistoryArchiveReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to inactivate medical history",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openNewRelatedPerson = (): void => {
    if (!selectedPatient) return;
    setEditingRelatedLink(null);
    setRelatedPersonForm({
      ...emptyRelatedPersonForm,
      relationshipRole: "guardian",
    });
    setError(null);
  };

  const openEditRelatedPerson = (
    link: PatientRelatedPersonLinkSummary,
  ): void => {
    setEditingRelatedLink(link);
    setRelatedPersonForm({
      displayNameEn: link.relatedPerson.displayNameEn,
      displayNameAr: link.relatedPerson.displayNameAr ?? "",
      relationship: link.relatedPerson.relationship,
      phone: link.relatedPerson.phoneNumbers[0] ?? "",
      isGuardian: link.relatedPerson.isGuardian,
      isAuthorizedToConsent: link.relatedPerson.isAuthorizedToConsent,
      isAuthorizedToContact: link.relatedPerson.isAuthorizedToContact,
      verificationStatus: link.verificationStatus,
      relationshipRole: link.relationshipRole,
      isPrimary: link.isPrimary,
      consentAuthority: link.consentAuthority,
    });
    setError(null);
  };

  const saveRelatedPerson = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedPatient || !relatedPersonForm) return;
    const form = relatedPersonForm;
    const personInput: RelatedPersonInput = {
      displayNameEn: form.displayNameEn,
      ...(form.displayNameAr.trim()
        ? { displayNameAr: form.displayNameAr.trim() }
        : {}),
      relationship: form.relationship,
      phoneNumbers: [form.phone],
      isGuardian: form.isGuardian,
      isAuthorizedToConsent: form.isAuthorizedToConsent,
      isAuthorizedToContact: form.isAuthorizedToContact,
      verificationStatus: form.verificationStatus,
    };
    const linkInput: RelatedPersonLinkInput = {
      relationshipRole: form.relationshipRole,
      isPrimary: form.isPrimary,
      consentAuthority: form.consentAuthority,
      verificationStatus: form.verificationStatus,
    };
    setIsBusy(true);
    setError(null);
    try {
      if (editingRelatedLink) {
        await window.elite.relatedPersons.update(
          token,
          editingRelatedLink.relatedPersonId,
          personInput,
          editingRelatedLink.relatedPerson.version,
        );
        await window.elite.relatedPersons.updateLink(
          token,
          selectedPatient.patientId,
          editingRelatedLink.relatedPersonId,
          linkInput,
        );
      } else {
        const created = await window.elite.relatedPersons.create(
          token,
          personInput,
        );
        await window.elite.relatedPersons.link(
          token,
          selectedPatient.patientId,
          created.id,
          linkInput,
        );
      }
      setRelatedLinks(
        await window.elite.relatedPersons.listLinks(
          token,
          selectedPatient.patientId,
        ),
      );
      setRelatedPersonForm(null);
      setEditingRelatedLink(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save related person",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const unlinkRelatedPerson = async (
    link: PatientRelatedPersonLinkSummary,
  ): Promise<void> => {
    if (!selectedPatient) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.relatedPersons.unlink(
        token,
        selectedPatient.patientId,
        link.relatedPersonId,
        "Unlinked from patient profile",
      );
      setRelatedLinks(
        await window.elite.relatedPersons.listLinks(
          token,
          selectedPatient.patientId,
        ),
      );
      if (editingRelatedLink?.relatedPersonId === link.relatedPersonId) {
        setRelatedPersonForm(null);
        setEditingRelatedLink(null);
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to unlink related person",
      );
    } finally {
      setIsBusy(false);
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
                setRelatedLinks([]);
                setMedicalHistory([]);
                setMedicalHistoryForm(null);
                setEditingMedicalHistory(null);
                setMedicalHistoryArchiveReason("");
                setRelatedPersonForm(null);
                setEditingRelatedLink(null);
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
          {session.capabilities.includes("clinical.read") ? (
            <section
              className="medical-history-section"
              aria-labelledby="medical-history-title"
            >
              <div className="related-person-heading">
                <div>
                  <h4 id="medical-history-title">Medical history</h4>
                  <p className="form-help">
                    Structured clinical history is versioned and never silently
                    deleted.
                  </p>
                </div>
                {session.capabilities.includes("clinical.write") ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={openNewMedicalHistory}
                  >
                    Add history entry
                  </button>
                ) : null}
              </div>
              {session.capabilities.includes("clinical.write") ? (
                <label className="history-audit-reason">
                  Reason for inactivation
                  <input
                    placeholder="Required when inactivating an entry"
                    value={medicalHistoryArchiveReason}
                    onChange={(event) =>
                      setMedicalHistoryArchiveReason(event.target.value)
                    }
                  />
                </label>
              ) : null}
              {medicalHistory.length === 0 ? (
                <p className="muted">No medical-history entries recorded.</p>
              ) : (
                <div className="medical-history-list">
                  {medicalHistory.map((entry) => (
                    <article className="medical-history-row" key={entry.id}>
                      <div>
                        <strong>{entry.title}</strong>
                        <span>
                          {entry.category} · {entry.status} · {entry.source}
                          {entry.onsetDate ? ` · onset ${entry.onsetDate}` : ""}
                        </span>
                        {entry.details ? <small>{entry.details}</small> : null}
                      </div>
                      {session.capabilities.includes("clinical.write") ? (
                        <div className="button-row">
                          <button
                            className="button secondary"
                            type="button"
                            disabled={isBusy}
                            onClick={() => openEditMedicalHistory(entry)}
                          >
                            Edit
                          </button>
                          {entry.status !== "inactive" ? (
                            <button
                              className="button danger"
                              type="button"
                              disabled={
                                isBusy ||
                                medicalHistoryArchiveReason.trim().length < 3
                              }
                              onClick={() => void archiveMedicalHistory(entry)}
                            >
                              Inactivate
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
              {medicalHistoryForm ? (
                <form
                  className="medical-history-editor"
                  onSubmit={(event) => void saveMedicalHistory(event)}
                >
                  <div className="form-heading-row">
                    <h4>
                      {editingMedicalHistory
                        ? "Edit history entry"
                        : "Add history entry"}
                    </h4>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setMedicalHistoryForm(null);
                        setEditingMedicalHistory(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="form-grid">
                    <label>
                      Category
                      <select
                        required
                        value={medicalHistoryForm.category}
                        onChange={(event) =>
                          setMedicalHistoryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  category: event.target
                                    .value as MedicalHistoryInput["category"],
                                }
                              : current,
                          )
                        }
                      >
                        <option value="condition">Condition</option>
                        <option value="allergy">Allergy</option>
                        <option value="medication">Medication</option>
                        <option value="surgery">Surgery</option>
                        <option value="family-history">Family history</option>
                        <option value="social-history">Social history</option>
                        <option value="immunization">Immunization</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Title
                      <input
                        required
                        value={medicalHistoryForm.title}
                        onChange={(event) =>
                          setMedicalHistoryForm((current) =>
                            current
                              ? { ...current, title: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Onset date
                      <input
                        type="date"
                        value={medicalHistoryForm.onsetDate ?? ""}
                        onChange={(event) =>
                          setMedicalHistoryForm((current) =>
                            current
                              ? { ...current, onsetDate: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={medicalHistoryForm.status}
                        onChange={(event) =>
                          setMedicalHistoryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  status: event.target
                                    .value as MedicalHistoryInput["status"],
                                }
                              : current,
                          )
                        }
                      >
                        <option value="active">Active</option>
                        <option value="resolved">Resolved</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                    <label>
                      Source
                      <select
                        value={medicalHistoryForm.source}
                        onChange={(event) =>
                          setMedicalHistoryForm((current) =>
                            current
                              ? {
                                  ...current,
                                  source: event.target
                                    .value as MedicalHistoryInput["source"],
                                }
                              : current,
                          )
                        }
                      >
                        <option value="clinician-recorded">
                          Clinician recorded
                        </option>
                        <option value="patient-reported">
                          Patient reported
                        </option>
                        <option value="external-record">External record</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Details
                    <textarea
                      rows={4}
                      value={medicalHistoryForm.details ?? ""}
                      onChange={(event) =>
                        setMedicalHistoryForm((current) =>
                          current
                            ? { ...current, details: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={isBusy}
                  >
                    {editingMedicalHistory
                      ? "Save history entry"
                      : "Create history entry"}
                  </button>
                </form>
              ) : null}
            </section>
          ) : null}
          <div className="related-person-heading">
            <h4>Related persons and guardians</h4>
            {session.capabilities.includes("patient.write") ? (
              <button
                className="button secondary"
                type="button"
                disabled={isBusy}
                onClick={openNewRelatedPerson}
              >
                Add related person
              </button>
            ) : null}
          </div>
          {relatedLinks.length === 0 ? (
            <p className="muted">No related persons linked.</p>
          ) : (
            <div className="related-person-list">
              {relatedLinks.map((link) => (
                <div className="related-person-row" key={link.relatedPersonId}>
                  <div>
                    <strong>{link.relatedPerson.displayNameEn}</strong>
                    <span>
                      {link.relationshipRole} ·{" "}
                      {link.relatedPerson.phoneNumbers.join(", ")}
                    </span>
                    <small>
                      {link.relatedPerson.isGuardian
                        ? "Guardian"
                        : "Related person"}{" "}
                      · {link.consentAuthority} consent ·{" "}
                      {link.verificationStatus}
                    </small>
                  </div>
                  {session.capabilities.includes("patient.write") ? (
                    <div className="button-row">
                      <button
                        className="button secondary"
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditRelatedPerson(link)}
                      >
                        Edit
                      </button>
                      <button
                        className="button danger"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void unlinkRelatedPerson(link)}
                      >
                        Unlink
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {relatedPersonForm ? (
            <form
              className="related-person-editor"
              onSubmit={(event) => void saveRelatedPerson(event)}
            >
              <div className="form-heading-row">
                <h4>
                  {editingRelatedLink
                    ? "Edit related person and link"
                    : "Add related person and link"}
                </h4>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setRelatedPersonForm(null);
                    setEditingRelatedLink(null);
                  }}
                >
                  Cancel
                </button>
              </div>
              <div className="form-grid">
                <label>
                  English name
                  <input
                    required
                    value={relatedPersonForm.displayNameEn}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? { ...current, displayNameEn: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Arabic name
                  <input
                    value={relatedPersonForm.displayNameAr}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? { ...current, displayNameAr: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    required
                    value={relatedPersonForm.phone}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? { ...current, phone: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Person relationship
                  <input
                    required
                    value={relatedPersonForm.relationship}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? { ...current, relationship: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Patient link role
                  <input
                    required
                    value={relatedPersonForm.relationshipRole}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? { ...current, relationshipRole: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Consent authority
                  <select
                    value={relatedPersonForm.consentAuthority}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? {
                              ...current,
                              consentAuthority: event.target
                                .value as RelatedPersonFormState["consentAuthority"],
                            }
                          : current,
                      )
                    }
                  >
                    <option value="none">None</option>
                    <option value="inform">Inform</option>
                    <option value="consent">Consent</option>
                  </select>
                </label>
              </div>
              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={relatedPersonForm.isGuardian}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? { ...current, isGuardian: event.target.checked }
                          : current,
                      )
                    }
                  />{" "}
                  Guardian
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={relatedPersonForm.isAuthorizedToConsent}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? {
                              ...current,
                              isAuthorizedToConsent: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />{" "}
                  Authorized to consent
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={relatedPersonForm.isAuthorizedToContact}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? {
                              ...current,
                              isAuthorizedToContact: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />{" "}
                  Authorized to contact
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={relatedPersonForm.isPrimary}
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? { ...current, isPrimary: event.target.checked }
                          : current,
                      )
                    }
                  />{" "}
                  Primary link
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={
                      relatedPersonForm.verificationStatus === "verified"
                    }
                    onChange={(event) =>
                      setRelatedPersonForm((current) =>
                        current
                          ? {
                              ...current,
                              verificationStatus: event.target.checked
                                ? "verified"
                                : "unverified",
                            }
                          : current,
                      )
                    }
                  />{" "}
                  Verified identity/link
                </label>
              </div>
              <button
                className="button primary"
                type="submit"
                disabled={isBusy}
              >
                {editingRelatedLink
                  ? "Save related person and link"
                  : "Create and link related person"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type CalendarView = "month" | "week" | "day";

const CALENDAR_DAY_NAMES = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function addCalendarDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfClinicWeek(date: Date): Date {
  const daysSinceSaturday = (date.getDay() + 1) % 7;
  return addCalendarDays(date, -daysSinceSaturday);
}

function getCalendarRange(
  view: CalendarView,
  selectedDate: string,
): { from: string; to: string } {
  const date = parseLocalDate(selectedDate);
  let fromDate: Date;
  let toDate: Date;
  if (view === "month") {
    fromDate = new Date(date.getFullYear(), date.getMonth(), 1);
    toDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  } else if (view === "week") {
    fromDate = startOfClinicWeek(date);
    toDate = addCalendarDays(fromDate, 7);
  } else {
    fromDate = date;
    toDate = addCalendarDays(date, 1);
  }
  return {
    from: new Date(fromDate).toISOString(),
    to: new Date(toDate).toISOString(),
  };
}

function getMonthGridDays(selectedDate: string): readonly Date[] {
  const date = parseLocalDate(selectedDate);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const gridStart = startOfClinicWeek(first);
  return Array.from({ length: 42 }, (_, index) =>
    addCalendarDays(gridStart, index),
  );
}

function formatCalendarHeading(
  view: CalendarView,
  selectedDate: string,
): string {
  const date = parseLocalDate(selectedDate);
  if (view === "day") {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "week") {
    const start = startOfClinicWeek(date);
    const end = addCalendarDays(start, 6);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function ClinicalWorkflowWorkspace({
  token,
  canManage,
  canWriteClinical,
  canSignClinical,
  canApproveClinical,
  canRecordDiagnosis,
  canExport,
  canSensitiveExport,
  canRevoke,
}: {
  token: string;
  canManage: boolean;
  canWriteClinical: boolean;
  canSignClinical: boolean;
  canApproveClinical: boolean;
  canRecordDiagnosis: boolean;
  canExport: boolean;
  canSensitiveExport: boolean;
  canRevoke: boolean;
}): ReactElement {
  const [specialties, setSpecialties] = useState<readonly Specialty[]>([]);
  const [departments, setDepartments] = useState<readonly Department[]>([]);
  const [services, setServices] = useState<readonly Service[]>([]);
  const [schedules, setSchedules] = useState<readonly Schedule[]>([]);
  const [exceptions, setExceptions] = useState<readonly ScheduleException[]>(
    [],
  );
  const [appointments, setAppointments] = useState<readonly Appointment[]>([]);
  const [icd10Codes, setIcd10Codes] = useState<readonly Icd10Code[]>([]);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [selectedEncounter, setSelectedEncounter] = useState<Encounter | null>(
    null,
  );
  const [selectedEffectiveEncounter, setSelectedEffectiveEncounter] =
    useState<EffectiveEncounter | null>(null);
  const [amendments, setAmendments] = useState<readonly EncounterAmendment[]>(
    [],
  );
  const [amendmentDiffs, setAmendmentDiffs] = useState<
    readonly EncounterAmendmentDiff[]
  >([]);
  const [projectionSnapshots, setProjectionSnapshots] = useState<
    readonly ProjectionSnapshot[]
  >([]);
  const [snapshotExportReason, setSnapshotExportReason] = useState("");
  const [exportFormat, setExportFormat] = useState<"pdf" | "fhir">("pdf");
  const [exportRedactionPolicy, setExportRedactionPolicy] = useState<
    "minimal" | "clinical" | "full"
  >("clinical");
  const [exportReason, setExportReason] = useState("");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportVerification, setExportVerification] =
    useState<ExportVerificationResult | null>(null);
  const [zipExportResult, setZipExportResult] = useState<{
    package: {
      packageId: string;
      archivePath: string;
      manifest: {
        expiresAt?: string | null | undefined;
        fhirValidation?: FhirValidationResult | undefined;
      };
    };
    savedArchivePath: string;
    fhirValidation?: FhirValidationResult;
    verification: ExportVerificationResult;
  } | null>(null);
  const [fhirValidation, setFhirValidation] =
    useState<FhirValidationResult | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [orgSettingsForm, setOrgSettingsForm] = useState<OrgSettingsInput>({
    clinicNameEn: "Elite Clinic Management System",
    countryCode: "EG",
    oid: "1.3.6.1.4.1.99999.1",
    fhirSystemUrl: "https://fhir.elite-clinic.local",
    exportExpirationDays: 30,
    fhirProfileBundleId: "elite-clinic-r4",
  });
  const [revocations, setRevocations] = useState<readonly ExportRevocation[]>(
    [],
  );
  const [revocationReason, setRevocationReason] = useState("");
  const [exportRegistry, setExportRegistry] = useState<
    readonly ExportPackageRegistryRecord[]
  >([]);
  const [selectedRegistryPackageId, setSelectedRegistryPackageId] =
    useState("");
  const [registryTransitionReason, setRegistryTransitionReason] = useState("");
  const [signingKeys, setSigningKeys] = useState<
    readonly ExportSigningKeyMetadata[]
  >([]);
  const [keyRotationReason, setKeyRotationReason] = useState("");
  const [recoveryPassphrase, setRecoveryPassphrase] = useState("");
  const [recoveryBundleJson, setRecoveryBundleJson] = useState("");
  const [governanceRecipients, setGovernanceRecipients] = useState<
    readonly ExportRecipient[]
  >([]);
  const [governanceEvidence, setGovernanceEvidence] = useState<
    readonly ExportConsentEvidence[]
  >([]);
  const [governanceDisclosures, setGovernanceDisclosures] = useState<
    readonly ExportDisclosure[]
  >([]);
  const [governanceReceipts, setGovernanceReceipts] = useState<
    readonly ExportReceipt[]
  >([]);
  const [recipientDisplayName, setRecipientDisplayName] = useState("");
  const [recipientOrganizationName, setRecipientOrganizationName] =
    useState("");
  const [recipientCategory, setRecipientCategory] =
    useState<ExportRecipient["category"]>("referral-provider");
  const [recipientContactChannel, setRecipientContactChannel] = useState("");
  const [governanceEvidenceReference, setGovernanceEvidenceReference] =
    useState("");
  const [governanceReason, setGovernanceReason] = useState("");
  const [fhirProfiles, setFhirProfiles] = useState<
    readonly FhirProfileBundleRecord[]
  >([]);
  const [fhirProfileBundleJson, setFhirProfileBundleJson] = useState("");
  const [amendmentForm, setAmendmentForm] = useState<AmendmentFormState | null>(
    null,
  );
  const [amendmentReviewReason, setAmendmentReviewReason] = useState("");
  const [diagnoses, setDiagnoses] = useState<readonly Diagnosis[]>([]);
  const [encounterForm, setEncounterForm] = useState<EncounterFormState | null>(
    null,
  );
  const [diagnosisForm, setDiagnosisForm] = useState<DiagnosisFormState | null>(
    null,
  );
  const [diagnosisReviewReason, setDiagnosisReviewReason] = useState("");
  const [icd10Code, setIcd10Code] = useState("");
  const [icd10Title, setIcd10Title] = useState("");
  const [icd10Release, setIcd10Release] = useState("");
  const [doctors, setDoctors] = useState<readonly DoctorDirectoryEntry[]>([]);
  const [appointmentDoctorId, setAppointmentDoctorId] = useState("");
  const [calendarDoctorId, setCalendarDoctorId] = useState("");
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [selectedDate, setSelectedDate] = useState(() =>
    formatLocalDate(new Date()),
  );
  const [doctorId, setDoctorId] = useState("");
  const [scheduleDepartmentId, setScheduleDepartmentId] = useState("");
  const [scheduleDay, setScheduleDay] = useState("6");
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState("15");
  const [exceptionDoctorId, setExceptionDoctorId] = useState("");
  const [exceptionDepartmentId, setExceptionDepartmentId] = useState("");
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionKind, setExceptionKind] = useState<"closed" | "open">(
    "closed",
  );
  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [patientId, setPatientId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [visitType, setVisitType] = useState("consultation");
  const [scheduledStart, setScheduledStart] = useState("");
  const [specialtyCode, setSpecialtyCode] = useState("");
  const [specialtyName, setSpecialtyName] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = async (): Promise<void> => {
    try {
      const [
        specialtyRows,
        departmentRows,
        serviceRows,
        scheduleRows,
        exceptionRows,
        icd10Rows,
        doctorRows,
        appointmentRows,
      ] = await Promise.all([
        window.elite.clinical.listSpecialties(token),
        window.elite.clinical.listDepartments(token),
        window.elite.clinical.listServices(token),
        window.elite.clinical.listSchedules(token),
        window.elite.clinical.listExceptions(token),
        window.elite.clinical.listIcd10Codes(token),
        window.elite.clinical.listDoctors(token),
        window.elite.clinical.listAppointments(
          token,
          getCalendarRange(calendarView, selectedDate).from,
          getCalendarRange(calendarView, selectedDate).to,
          calendarDoctorId || undefined,
        ),
      ]);
      setSpecialties(specialtyRows);
      setDepartments(departmentRows);
      setServices(serviceRows);
      setSchedules(scheduleRows);
      setExceptions(exceptionRows);
      setIcd10Codes(icd10Rows);
      setDoctors(doctorRows);
      setAppointments(appointmentRows);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load clinical workflow data",
      );
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, calendarView, selectedDate, calendarDoctorId]);

  const createAppointment = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      const input: AppointmentCreateInput = {
        patientId,
        departmentId,
        ...(appointmentDoctorId ? { doctorId: appointmentDoctorId } : {}),
        ...(serviceId ? { serviceId } : {}),
        scheduledStart: new Date(scheduledStart).toISOString(),
        visitType,
        isWalkIn: false,
      };
      await window.elite.clinical.createAppointment(token, input);
      setPatientId("");
      setScheduledStart("");
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create appointment",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const updateStatus = async (
    appointment: Appointment,
    status: "arrived" | "in-consultation" | "completed" | "cancelled",
  ): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.updateAppointmentStatus(
        token,
        appointment.id,
        { status, reason: "Updated from clinical workflow workspace" },
      );
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update appointment status",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openEncounter = async (appointment: Appointment): Promise<void> => {
    setSelectedAppointment(appointment);
    setError(null);
    try {
      const encounter = await window.elite.clinical.getEncounterForAppointment(
        token,
        appointment.id,
      );
      const [effectiveEncounter, amendmentRows, diffRows, snapshotRows] =
        encounter
          ? await Promise.all([
              window.elite.clinical.getEffectiveEncounterForAppointment(
                token,
                appointment.id,
              ),
              window.elite.clinical.listAmendments(token, encounter.id),
              window.elite.clinical.listAmendmentDiffs(token, encounter.id),
              window.elite.clinical.listProjectionSnapshots(
                token,
                encounter.id,
              ),
            ])
          : [
              null,
              [] as readonly EncounterAmendment[],
              [] as readonly EncounterAmendmentDiff[],
              [] as readonly ProjectionSnapshot[],
            ];
      setSelectedEncounter(encounter);
      setSelectedEffectiveEncounter(effectiveEncounter);
      setAmendments(amendmentRows);
      setAmendmentDiffs(diffRows);
      setProjectionSnapshots(snapshotRows);
      setSnapshotExportReason("");
      setAmendmentForm(null);
      setAmendmentReviewReason("");
      setEncounterForm(
        canWriteClinical
          ? encounter
            ? {
                subjective: encounter.subjective ?? "",
                objective: encounter.objective ?? "",
                assessment: encounter.assessment ?? "",
                plan: encounter.plan ?? "",
                followUp: encounter.followUp ?? "",
              }
            : { ...emptyEncounterForm }
          : null,
      );
      setDiagnosisForm(null);
      setDiagnoses(
        encounter
          ? await window.elite.clinical.listDiagnoses(token, encounter.id)
          : [],
      );
    } catch (reason: unknown) {
      setSelectedEncounter(null);
      setSelectedEffectiveEncounter(null);
      setAmendments([]);
      setAmendmentDiffs([]);
      setProjectionSnapshots([]);
      setSnapshotExportReason("");
      setAmendmentForm(null);
      setAmendmentReviewReason("");
      setEncounterForm(null);
      setDiagnoses([]);
      setError(
        reason instanceof Error ? reason.message : "Unable to load encounter",
      );
    }
  };

  const refreshProjectionArtifacts = async (): Promise<void> => {
    if (!selectedEncounter || !selectedAppointment) return;
    const [effective, amendmentRows, diffRows, snapshotRows] =
      await Promise.all([
        window.elite.clinical.getEffectiveEncounterForAppointment(
          token,
          selectedAppointment.id,
        ),
        window.elite.clinical.listAmendments(token, selectedEncounter.id),
        window.elite.clinical.listAmendmentDiffs(token, selectedEncounter.id),
        window.elite.clinical.listProjectionSnapshots(
          token,
          selectedEncounter.id,
        ),
      ]);
    setSelectedEffectiveEncounter(effective);
    setAmendments(amendmentRows);
    setAmendmentDiffs(diffRows);
    setProjectionSnapshots(snapshotRows);
  };

  const createProjectionSnapshot = async (): Promise<void> => {
    if (!selectedEncounter || snapshotExportReason.trim().length < 3) {
      setError("Enter an export reason before creating a projection snapshot");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.createProjectionSnapshot(
        token,
        selectedEncounter.id,
        { exportReason: snapshotExportReason },
      );
      setSnapshotExportReason("");
      await refreshProjectionArtifacts();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create projection snapshot",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const exportPatientRecord = async (): Promise<void> => {
    if (!canExport) {
      setError("Your role is not authorized to export patient records");
      return;
    }
    const latestSnapshot = projectionSnapshots[0];
    if (!latestSnapshot) {
      setError("Create an immutable projection snapshot before exporting");
      return;
    }
    if (exportReason.trim().length < 3) {
      setError("Enter an export reason before creating a signed export");
      return;
    }
    if (exportRedactionPolicy === "full" && !canSensitiveExport) {
      setError("Full export requires the sensitive-export permission");
      return;
    }
    setIsBusy(true);
    setError(null);
    setExportVerification(null);
    try {
      const created = await window.elite.export.createExport(token, {
        snapshotId: latestSnapshot.id,
        format: exportFormat,
        redactionPolicy: exportRedactionPolicy,
        exportReason,
      });
      setExportResult(created);
      setExportReason("");
      setExportVerification(
        await window.elite.export.verifyExport({
          manifestJson: JSON.stringify(created.package.manifest),
          payloadBase64: created.package.payloadBase64,
        }),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create signed export",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const validateFhirExport = async (): Promise<void> => {
    const latestSnapshot = projectionSnapshots[0];
    if (!latestSnapshot || exportReason.trim().length < 3) {
      setError(
        "Create a projection snapshot and enter an export reason before FHIR validation",
      );
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const result = await window.elite.export.validateFhir(token, {
        snapshotId: latestSnapshot.id,
        format: "fhir",
        redactionPolicy: exportRedactionPolicy,
        exportReason,
      });
      setFhirValidation(result);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to validate FHIR export",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createZipPatientRecord = async (): Promise<void> => {
    if (!canExport) {
      setError("Your role is not authorized to export patient records");
      return;
    }
    const latestSnapshot = projectionSnapshots[0];
    if (!latestSnapshot || exportReason.trim().length < 3) {
      setError(
        "Create a projection snapshot and enter an export reason before creating a ZIP export",
      );
      return;
    }
    if (exportRedactionPolicy === "full" && !canSensitiveExport) {
      setError("Full export requires the sensitive-export permission");
      return;
    }
    setIsBusy(true);
    setError(null);
    setFhirValidation(null);
    try {
      const created = await window.elite.export.createZipExport(token, {
        snapshotId: latestSnapshot.id,
        format: exportFormat,
        redactionPolicy: exportRedactionPolicy,
        exportReason,
      });
      setZipExportResult(created);
      setFhirValidation(created.fhirValidation ?? null);
      setExportReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create signed ZIP export",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const loadExportRegistry = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const records = await window.elite.export.listRegistry(token, {
        limit: 100,
      });
      setExportRegistry(records);
      if (!selectedRegistryPackageId && records[0])
        setSelectedRegistryPackageId(records[0].packageId);
      setSigningKeys(await window.elite.export.listSigningKeys(token));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load export registry",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const transitionRegistryPackage = async (): Promise<void> => {
    if (
      !selectedRegistryPackageId ||
      registryTransitionReason.trim().length < 3
    )
      return;
    setIsBusy(true);
    setError(null);
    try {
      const current = exportRegistry.find(
        (record) => record.packageId === selectedRegistryPackageId,
      );
      if (!current) throw new Error("Export package is not selected");
      const nextStatus =
        current.status === "stored"
          ? "downloaded"
          : current.status === "downloaded"
            ? "archived"
            : "destroyed";
      const updated = await window.elite.export.transitionRegistry(token, {
        packageId: current.packageId,
        toStatus: nextStatus,
        reason: registryTransitionReason,
      });
      setExportRegistry(
        exportRegistry.map((record) =>
          record.packageId === updated.packageId ? updated : record,
        ),
      );
      setRegistryTransitionReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to transition export package",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const rotateSigningKey = async (): Promise<void> => {
    if (keyRotationReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      const rotated = await window.elite.export.rotateSigningKey(
        token,
        keyRotationReason,
      );
      setSigningKeys([
        rotated,
        ...signingKeys.filter((key) => key.keyId !== rotated.keyId),
      ]);
      setKeyRotationReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to rotate export signing key",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const exportSigningKeyRecovery = async (): Promise<void> => {
    if (recoveryPassphrase.length < 12) return;
    setIsBusy(true);
    setError(null);
    try {
      const bundle = await window.elite.export.exportSigningKeyRecovery(
        token,
        recoveryPassphrase,
      );
      setRecoveryBundleJson(JSON.stringify(bundle, null, 2));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to export signing-key recovery bundle",
      );
    } finally {
      setRecoveryPassphrase("");
      setIsBusy(false);
    }
  };

  const restoreSigningKeyRecovery = async (): Promise<void> => {
    if (recoveryPassphrase.length < 12 || recoveryBundleJson.trim().length < 2)
      return;
    setIsBusy(true);
    setError(null);
    try {
      const restored = await window.elite.export.restoreSigningKeyRecovery(
        token,
        JSON.parse(recoveryBundleJson) as ExportSigningKeyRecoveryBundle,
        recoveryPassphrase,
      );
      setSigningKeys(await window.elite.export.listSigningKeys(token));
      setRecoveryBundleJson("");
      setError(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to restore signing-key recovery bundle",
      );
    } finally {
      setRecoveryPassphrase("");
      setIsBusy(false);
    }
  };

  const loadGovernance = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const [recipients, evidence, disclosures, receipts] = await Promise.all([
        window.elite.export.listRecipients(token),
        window.elite.export.listConsentEvidence(token, patientId || undefined),
        window.elite.export.listDisclosures(token),
        window.elite.export.listReceipts(token),
      ]);
      setGovernanceRecipients(recipients);
      setGovernanceEvidence(evidence);
      setGovernanceDisclosures(disclosures);
      setGovernanceReceipts(receipts);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load export governance data",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const createGovernanceRecipient = async (): Promise<void> => {
    if (recipientDisplayName.trim().length < 1) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.createRecipient(token, {
        displayName: recipientDisplayName,
        organizationName: recipientOrganizationName || undefined,
        category: recipientCategory,
        contactChannel: recipientContactChannel || undefined,
      });
      setRecipientDisplayName("");
      setRecipientOrganizationName("");
      setRecipientContactChannel("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create recipient",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const verifyFirstRecipient = async (): Promise<void> => {
    const recipient = governanceRecipients.find(
      (candidate) => candidate.verificationStatus === "unverified",
    );
    if (!recipient || governanceReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.verifyRecipient(
        token,
        recipient.id,
        "verified",
        governanceReason,
      );
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to verify recipient",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const createGovernanceEvidence = async (): Promise<void> => {
    if (
      patientId.trim().length < 3 ||
      governanceEvidenceReference.trim().length < 1
    )
      return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.createConsentEvidence(token, {
        patientId,
        evidenceType: "patient-consent",
        sourceReference: governanceEvidenceReference,
      });
      setGovernanceEvidenceReference("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to record consent evidence",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const approveFirstEvidence = async (): Promise<void> => {
    const evidence = governanceEvidence.find(
      (candidate) => candidate.status === "pending",
    );
    if (!evidence || governanceReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.reviewConsentEvidence(
        token,
        evidence.id,
        "approve",
        governanceReason,
      );
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to approve consent evidence",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const requestFirstDisclosure = async (): Promise<void> => {
    const packageId = selectedRegistryPackageId;
    const recipient = governanceRecipients.find(
      (candidate) => candidate.verificationStatus === "verified",
    );
    const evidence = governanceEvidence.find(
      (candidate) => candidate.status === "approved",
    );
    if (
      !packageId ||
      !recipient ||
      !evidence ||
      governanceReason.trim().length < 3
    )
      return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.requestDisclosure(token, {
        packageId,
        recipientId: recipient.id,
        purposeOfUse: "referral",
        deliveryMethod: "usb",
        consentEvidenceId: evidence.id,
        reason: governanceReason,
      });
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to request disclosure",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const advanceFirstDisclosure = async (): Promise<void> => {
    const disclosure = governanceDisclosures.find(
      (candidate) =>
        candidate.status === "requested" || candidate.status === "approved",
    );
    if (!disclosure || governanceReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      if (disclosure.status === "requested") {
        await window.elite.export.decideDisclosure(token, {
          disclosureId: disclosure.id,
          decision: "approve",
          reason: governanceReason,
        });
      } else {
        await window.elite.export.sendDisclosure(
          token,
          disclosure.id,
          governanceReason,
        );
      }
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to advance disclosure",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const issueFirstReceipt = async (): Promise<void> => {
    const disclosure = governanceDisclosures.find(
      (candidate) => candidate.status === "sent",
    );
    if (!disclosure) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.issueReceipt(token, disclosure.id);
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to issue export receipt",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const acknowledgeFirstReceipt = async (): Promise<void> => {
    const receipt = governanceReceipts.find(
      (candidate) => !candidate.acknowledgedAt,
    );
    if (!receipt || governanceReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.export.acknowledgeReceipt(
        token,
        receipt.id,
        governanceReason,
      );
      setGovernanceReason("");
      await loadGovernance();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to acknowledge receipt",
      );
    } finally {
      setIsBusy(false);
    }
  };
  const loadOrganizationSettings = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const settings = await window.elite.settings.getOrgSettings(token);
      setOrgSettings(settings);
      setOrgSettingsForm({
        clinicNameEn: settings.clinicNameEn,
        countryCode: settings.countryCode,
        oid: settings.oid,
        fhirSystemUrl: settings.fhirSystemUrl,
        exportExpirationDays: settings.exportExpirationDays,
        fhirProfileBundleId: settings.fhirProfileBundleId,
      });
      setFhirProfiles(
        await window.elite.settings.listFhirProfileBundles(token),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load organization settings",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const installFhirProfileBundle = async (): Promise<void> => {
    if (fhirProfileBundleJson.trim().length < 2) {
      setError("Paste a FHIR profile bundle JSON document before installing");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const bundle = JSON.parse(fhirProfileBundleJson) as FhirProfileBundle;
      const installed = await window.elite.settings.installFhirProfileBundle(
        token,
        bundle,
      );
      setFhirProfiles([
        installed,
        ...fhirProfiles.filter((profile) => profile.id !== installed.id),
      ]);
      setOrgSettingsForm({
        ...orgSettingsForm,
        fhirProfileBundleId: installed.id,
      });
      setFhirProfileBundleJson("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to install FHIR profile bundle",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const saveOrganizationSettings = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const settings = await window.elite.settings.updateOrgSettings(
        token,
        orgSettingsForm,
      );
      setOrgSettings(settings);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update organization settings",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const revokeLatestZipExport = async (): Promise<void> => {
    if (!zipExportResult || revocationReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      const revocation = await window.elite.export.revokeExport(
        token,
        zipExportResult.package.packageId,
        revocationReason,
      );
      setRevocations([revocation, ...revocations]);
      setZipExportResult({
        ...zipExportResult,
        verification: {
          ...zipExportResult.verification,
          verified: false,
          revoked: true,
          reason: "ZIP package has been revoked.",
        },
      });
      setRevocationReason("");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to revoke export package",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const openAmendmentForm = (): void => {
    if (!selectedEncounter || selectedEncounter.status !== "signed") return;
    setAmendmentForm({
      subjective: selectedEncounter.subjective ?? "",
      objective: selectedEncounter.objective ?? "",
      assessment: selectedEncounter.assessment ?? "",
      plan: selectedEncounter.plan ?? "",
      followUp: selectedEncounter.followUp ?? "",
      correctionReason: "",
    });
    setError(null);
  };

  const saveAmendment = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedEncounter || !amendmentForm) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.createAmendment(
        token,
        selectedEncounter.id,
        amendmentForm,
      );
      setAmendments(
        await window.elite.clinical.listAmendments(token, selectedEncounter.id),
      );
      setAmendmentForm(null);
      await refreshProjectionArtifacts();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to request amendment",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const reviewAmendment = async (
    amendment: EncounterAmendment,
    decision: "approved" | "rejected",
  ): Promise<void> => {
    if (amendmentReviewReason.trim().length < 3) {
      setError("Enter a reason before reviewing the amendment");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.reviewAmendment(
        token,
        amendment.id,
        decision,
        amendmentReviewReason,
        amendment.version,
      );
      setAmendmentReviewReason("");
      if (selectedEncounter) {
        setAmendments(
          await window.elite.clinical.listAmendments(
            token,
            selectedEncounter.id,
          ),
        );
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to review amendment",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const resolveAmendmentConflict = async (
    amendment: EncounterAmendment,
    resolution: "rebase" | "reject",
  ): Promise<void> => {
    if (amendmentReviewReason.trim().length < 3) {
      setError("Enter a reason before resolving the amendment conflict");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.resolveAmendmentConflict(
        token,
        amendment.id,
        resolution,
        amendmentReviewReason,
        amendment.version,
      );
      setAmendmentReviewReason("");
      if (selectedEncounter) {
        setAmendments(
          await window.elite.clinical.listAmendments(
            token,
            selectedEncounter.id,
          ),
        );
      }
      await refreshProjectionArtifacts();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to resolve amendment conflict",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const applyAmendment = async (
    amendment: EncounterAmendment,
  ): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.applyAmendment(
        token,
        amendment.id,
        amendment.version,
      );
      if (selectedEncounter) {
        setAmendments(
          await window.elite.clinical.listAmendments(
            token,
            selectedEncounter.id,
          ),
        );
        setSelectedEffectiveEncounter(
          await window.elite.clinical.getEffectiveEncounterForAppointment(
            token,
            selectedAppointment?.id ?? "",
          ),
        );
      }
      await refreshProjectionArtifacts();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to apply amendment",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const saveEncounter = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedAppointment || !encounterForm) return;
    setIsBusy(true);
    setError(null);
    try {
      const saved = selectedEncounter
        ? await window.elite.clinical.updateEncounter(
            token,
            selectedEncounter.id,
            encounterForm,
            selectedEncounter.version,
          )
        : await window.elite.clinical.createEncounter(
            token,
            selectedAppointment.id,
            encounterForm,
          );
      setSelectedEncounter(saved);
      setSelectedEffectiveEncounter(
        await window.elite.clinical.getEffectiveEncounterForAppointment(
          token,
          selectedAppointment.id,
        ),
      );
      setEncounterForm({
        subjective: saved.subjective ?? "",
        objective: saved.objective ?? "",
        assessment: saved.assessment ?? "",
        plan: saved.plan ?? "",
        followUp: saved.followUp ?? "",
      });
      setDiagnoses(await window.elite.clinical.listDiagnoses(token, saved.id));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save encounter",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const signSelectedEncounter = async (): Promise<void> => {
    if (!selectedEncounter) return;
    setIsBusy(true);
    setError(null);
    try {
      const signed = await window.elite.clinical.signEncounter(
        token,
        selectedEncounter.id,
        selectedEncounter.version,
      );
      setSelectedEncounter(signed);
      setSelectedEffectiveEncounter(
        await window.elite.clinical.getEffectiveEncounterForAppointment(
          token,
          selectedAppointment?.id ?? "",
        ),
      );
      setEncounterForm(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to sign encounter",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const saveDiagnosis = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedEncounter || !diagnosisForm) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.createDiagnosis(
        token,
        selectedEncounter.id,
        diagnosisForm,
      );
      setDiagnoses(
        await window.elite.clinical.listDiagnoses(token, selectedEncounter.id),
      );
      setDiagnosisForm(null);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to record diagnosis",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const reviewDiagnosis = async (
    diagnosis: Diagnosis,
    decision: "approved" | "rejected",
  ): Promise<void> => {
    if (diagnosisReviewReason.trim().length < 3) {
      setError("Enter a reason before reviewing the diagnosis");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await window.elite.clinical.approveDiagnosis(
        token,
        diagnosis.id,
        decision,
        diagnosisReviewReason,
        diagnosis.version,
      );
      setDiagnosisReviewReason("");
      if (selectedEncounter) {
        setDiagnoses(
          await window.elite.clinical.listDiagnoses(
            token,
            selectedEncounter.id,
          ),
        );
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to review diagnosis",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createIcd10Code = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const input: Icd10CodeInput = {
      code: icd10Code,
      titleEn: icd10Title,
      releaseVersion: icd10Release,
    };
    await manage(async () => {
      await window.elite.clinical.createIcd10Code(token, input);
      setIcd10Code("");
      setIcd10Title("");
      setIcd10Release("");
    });
  };

  const navigateCalendar = (direction: -1 | 1): void => {
    const date = parseLocalDate(selectedDate);
    const amount = calendarView === "month" ? 1 : 7;
    setSelectedDate(formatLocalDate(addCalendarDays(date, direction * amount)));
  };

  const goToToday = (): void => setSelectedDate(formatLocalDate(new Date()));

  const doctorLabel = (id: string): string =>
    doctors.find((doctor) => doctor.id === id)?.displayNameEn ?? id;

  const createSchedule = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const input: ScheduleInput = {
      doctorId,
      departmentId: scheduleDepartmentId,
      dayOfWeek: Number(scheduleDay),
      startTime: scheduleStart,
      endTime: scheduleEnd,
      slotDurationMinutes: Number(slotDuration),
    };
    await manage(() => window.elite.clinical.createSchedule(token, input));
  };

  const createException = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const input: ScheduleExceptionInput = {
      ...(exceptionDoctorId.trim()
        ? { doctorId: exceptionDoctorId.trim() }
        : {}),
      ...(exceptionDepartmentId ? { departmentId: exceptionDepartmentId } : {}),
      exceptionDate,
      kind: exceptionKind,
      ...(exceptionKind === "open" && exceptionStart
        ? { startTime: exceptionStart }
        : {}),
      ...(exceptionKind === "open" && exceptionEnd
        ? { endTime: exceptionEnd }
        : {}),
      reason: exceptionReason,
    };
    await manage(() => window.elite.clinical.createException(token, input));
  };

  const deleteSchedule = async (id: string): Promise<void> => {
    await manage(() =>
      window.elite.clinical.deleteSchedule(
        token,
        id,
        "Removed from Admin schedule controls",
      ),
    );
  };

  const deleteException = async (id: string): Promise<void> => {
    await manage(() =>
      window.elite.clinical.deleteException(
        token,
        id,
        "Removed from Admin exception controls",
      ),
    );
  };

  const manage = async (action: () => Promise<unknown>): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update clinical configuration",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const appointmentsForDate = (dateKey: string): readonly Appointment[] =>
    appointments.filter(
      (appointment) =>
        formatLocalDate(new Date(appointment.scheduledStart)) === dateKey,
    );
  const monthGridDays = getMonthGridDays(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addCalendarDays(startOfClinicWeek(parseLocalDate(selectedDate)), index),
  );
  const selectedMonth = parseLocalDate(selectedDate).getMonth();
  const displayedEncounter = selectedEffectiveEncounter ?? selectedEncounter;

  return (
    <section
      className="card clinical-workflow-card"
      aria-labelledby="clinical-workflow-title"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">Step 5</p>
          <h2 id="clinical-workflow-title">Clinical workflow</h2>
        </div>
        <span className="status ok">Offline-ready</span>
      </div>
      <ErrorMessage message={error} />
      <form
        className="appointment-form"
        onSubmit={(event) => void createAppointment(event)}
      >
        <h3>Reserve appointment</h3>
        <div className="form-grid">
          <label>
            Patient ID
            <input
              required
              placeholder="EL-00001"
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
            />
          </label>
          <label>
            Department
            <select
              required
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">Select department</option>
              {departments
                .filter((item) => item.status === "active")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nameEn}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Doctor
            <select
              value={appointmentDoctorId}
              onChange={(event) => setAppointmentDoctorId(event.target.value)}
            >
              <option value="">Any available doctor</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.displayNameEn}
                  {doctor.isClinicalApprover ? " · Approver" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service
            <select
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
            >
              <option value="">Default 15-minute slot</option>
              {services
                .filter((item) => item.status === "active")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nameEn} · {item.durationMinutes} min · EGP{" "}
                    {item.priceEgp}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Visit type
            <input
              required
              value={visitType}
              onChange={(event) => setVisitType(event.target.value)}
            />
          </label>
          <label>
            Start time
            <input
              required
              type="datetime-local"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
            />
          </label>
        </div>
        <button className="button primary" type="submit" disabled={isBusy}>
          Reserve appointment
        </button>
      </form>
      {canManage ? (
        <>
          <div className="clinical-config-grid">
            <form
              className="clinical-config-form"
              onSubmit={(event) => {
                event.preventDefault();
                void manage(() =>
                  window.elite.clinical.createSpecialty(token, {
                    code: specialtyCode,
                    nameEn: specialtyName,
                  }),
                );
              }}
            >
              <h3>Specialty</h3>
              <input
                required
                placeholder="Code"
                value={specialtyCode}
                onChange={(event) => setSpecialtyCode(event.target.value)}
              />
              <input
                required
                placeholder="English name"
                value={specialtyName}
                onChange={(event) => setSpecialtyName(event.target.value)}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add specialty
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => {
                event.preventDefault();
                void manage(() =>
                  window.elite.clinical.createDepartment(token, {
                    specialtyId: specialties[0]?.id ?? "",
                    code: departmentCode,
                    nameEn: departmentName,
                  }),
                );
              }}
            >
              <h3>Department</h3>
              <select
                required
                value={specialties[0]?.id ?? ""}
                onChange={() => undefined}
              >
                {specialties
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn}
                    </option>
                  ))}
              </select>
              <input
                required
                placeholder="Code"
                value={departmentCode}
                onChange={(event) => setDepartmentCode(event.target.value)}
              />
              <input
                required
                placeholder="English name"
                value={departmentName}
                onChange={(event) => setDepartmentName(event.target.value)}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add department
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => {
                event.preventDefault();
                void manage(() =>
                  window.elite.clinical.createService(token, {
                    departmentId: departments[0]?.id ?? "",
                    code: serviceCode,
                    nameEn: serviceName,
                    durationMinutes: 15,
                    priceEgp: 0,
                  }),
                );
              }}
            >
              <h3>Service catalog</h3>
              <select
                required
                value={departments[0]?.id ?? ""}
                onChange={() => undefined}
              >
                {departments
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn}
                    </option>
                  ))}
              </select>
              <input
                required
                placeholder="Code"
                value={serviceCode}
                onChange={(event) => setServiceCode(event.target.value)}
              />
              <input
                required
                placeholder="English name"
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add service
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => void createIcd10Code(event)}
            >
              <h3>ICD-10 catalog</h3>
              <input
                required
                placeholder="ICD-10 code, e.g. J06.9"
                value={icd10Code}
                onChange={(event) => setIcd10Code(event.target.value)}
              />
              <input
                required
                placeholder="English diagnosis title"
                value={icd10Title}
                onChange={(event) => setIcd10Title(event.target.value)}
              />
              <input
                required
                placeholder="Release version"
                value={icd10Release}
                onChange={(event) => setIcd10Release(event.target.value)}
              />
              <small className="muted">
                {icd10Codes.length} active catalog codes available locally.
              </small>
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add ICD-10 code
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => void createSchedule(event)}
            >
              <h3>Doctor recurring schedule</h3>
              <select
                required
                value={doctorId}
                onChange={(event) => setDoctorId(event.target.value)}
              >
                <option value="">Select doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.displayNameEn}
                  </option>
                ))}
              </select>
              <select
                required
                value={scheduleDepartmentId}
                onChange={(event) =>
                  setScheduleDepartmentId(event.target.value)
                }
              >
                <option value="">Department</option>
                {departments
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn}
                    </option>
                  ))}
              </select>
              <select
                value={scheduleDay}
                onChange={(event) => setScheduleDay(event.target.value)}
              >
                <option value="6">Saturday</option>
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
              </select>
              <div className="inline-fields">
                <input
                  required
                  type="time"
                  value={scheduleStart}
                  onChange={(event) => setScheduleStart(event.target.value)}
                />
                <input
                  required
                  type="time"
                  value={scheduleEnd}
                  onChange={(event) => setScheduleEnd(event.target.value)}
                />
                <input
                  required
                  type="number"
                  min="5"
                  max="480"
                  value={slotDuration}
                  onChange={(event) => setSlotDuration(event.target.value)}
                />
              </div>
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add recurring schedule
              </button>
            </form>
            <form
              className="clinical-config-form"
              onSubmit={(event) => void createException(event)}
            >
              <h3>Holiday / leave / closure exception</h3>
              <input
                type="date"
                required
                value={exceptionDate}
                onChange={(event) => setExceptionDate(event.target.value)}
              />
              <select
                value={exceptionDoctorId}
                onChange={(event) => setExceptionDoctorId(event.target.value)}
              >
                <option value="">Doctor scope (optional)</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.displayNameEn}
                  </option>
                ))}
              </select>
              <select
                value={exceptionDepartmentId}
                onChange={(event) =>
                  setExceptionDepartmentId(event.target.value)
                }
              >
                <option value="">Department scope (optional)</option>
                {departments
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameEn}
                    </option>
                  ))}
              </select>
              <select
                value={exceptionKind}
                onChange={(event) =>
                  setExceptionKind(event.target.value as "closed" | "open")
                }
              >
                <option value="closed">Closed</option>
                <option value="open">Open override</option>
              </select>
              {exceptionKind === "open" ? (
                <div className="inline-fields">
                  <input
                    required
                    type="time"
                    value={exceptionStart}
                    onChange={(event) => setExceptionStart(event.target.value)}
                  />
                  <input
                    required
                    type="time"
                    value={exceptionEnd}
                    onChange={(event) => setExceptionEnd(event.target.value)}
                  />
                </div>
              ) : null}
              <input
                required
                placeholder="Reason"
                value={exceptionReason}
                onChange={(event) => setExceptionReason(event.target.value)}
              />
              <button
                className="button secondary"
                type="submit"
                disabled={isBusy}
              >
                Add exception
              </button>
            </form>
          </div>
          <div className="schedule-management-list">
            <h3>Configured recurring schedules</h3>
            {schedules.length === 0 ? (
              <p className="muted">No recurring schedules configured.</p>
            ) : (
              schedules.map((schedule) => (
                <article className="schedule-row" key={schedule.id}>
                  <div>
                    <strong>{schedule.doctorId}</strong>
                    <span>
                      {schedule.startTime}–{schedule.endTime} · day{" "}
                      {schedule.dayOfWeek} · {schedule.slotDurationMinutes} min
                    </span>
                    <small>{schedule.departmentId}</small>
                  </div>
                  <button
                    className="button danger"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void deleteSchedule(schedule.id)}
                  >
                    Remove
                  </button>
                </article>
              ))
            )}
            <h3>Configured exceptions</h3>
            {exceptions.length === 0 ? (
              <p className="muted">No schedule exceptions configured.</p>
            ) : (
              exceptions.map((exception) => (
                <article className="schedule-row" key={exception.id}>
                  <div>
                    <strong>
                      {exception.exceptionDate} · {exception.kind}
                    </strong>
                    <span>
                      {exception.doctorId ?? "Department scope"} ·{" "}
                      {exception.reason}
                    </span>
                  </div>
                  <button
                    className="button danger"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void deleteException(exception.id)}
                  >
                    Remove
                  </button>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}
      <section className="calendar-panel" aria-labelledby="calendar-title">
        <div className="calendar-toolbar">
          <div>
            <p className="eyebrow">Schedule calendar</p>
            <h3 id="calendar-title">
              {formatCalendarHeading(calendarView, selectedDate)}
            </h3>
          </div>
          <div className="calendar-actions">
            <button
              className="button secondary"
              type="button"
              disabled={isBusy}
              onClick={() => navigateCalendar(-1)}
            >
              Previous
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={isBusy}
              onClick={goToToday}
            >
              Today
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={isBusy}
              onClick={() => navigateCalendar(1)}
            >
              Next
            </button>
          </div>
        </div>
        <div className="calendar-filters">
          <label>
            View
            <select
              value={calendarView}
              onChange={(event) =>
                setCalendarView(event.target.value as CalendarView)
              }
            >
              <option value="month">Month</option>
              <option value="week">Week</option>
              <option value="day">Day</option>
            </select>
          </label>
          <label>
            Focus date
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
          <label>
            Doctor
            <select
              value={calendarDoctorId}
              onChange={(event) => setCalendarDoctorId(event.target.value)}
            >
              <option value="">All doctors</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.displayNameEn}
                </option>
              ))}
            </select>
          </label>
        </div>
        {calendarView === "month" ? (
          <div className="calendar-month-grid">
            {CALENDAR_DAY_NAMES.map((dayName) => (
              <div className="calendar-weekday" key={dayName}>
                {dayName.slice(0, 3)}
              </div>
            ))}
            {monthGridDays.map((day) => {
              const dayKey = formatLocalDate(day);
              const dayAppointments = appointmentsForDate(dayKey);
              return (
                <button
                  className={`calendar-day${day.getMonth() !== selectedMonth ? " outside-month" : ""}${dayKey === selectedDate ? " selected-day" : ""}`}
                  key={dayKey}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dayKey);
                    setCalendarView("day");
                  }}
                >
                  <strong>{day.getDate()}</strong>
                  <span className="calendar-day-count">
                    {dayAppointments.length} appointment
                    {dayAppointments.length === 1 ? "" : "s"}
                  </span>
                  {dayAppointments.slice(0, 3).map((appointment) => (
                    <span
                      className="calendar-appointment-chip"
                      key={appointment.id}
                    >
                      {new Date(appointment.scheduledStart).toLocaleTimeString(
                        undefined,
                        { hour: "2-digit", minute: "2-digit" },
                      )}{" "}
                      · {appointment.patientId}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        ) : calendarView === "week" ? (
          <div className="calendar-week-grid">
            {weekDays.map((day) => {
              const dayKey = formatLocalDate(day);
              return (
                <div className="calendar-week-column" key={dayKey}>
                  <button
                    className={`calendar-column-heading${dayKey === selectedDate ? " selected-day" : ""}`}
                    type="button"
                    onClick={() => {
                      setSelectedDate(dayKey);
                      setCalendarView("day");
                    }}
                  >
                    <strong>
                      {day.toLocaleDateString(undefined, { weekday: "short" })}
                    </strong>
                    <span>
                      {day.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </button>
                  <div className="calendar-column-appointments">
                    {appointmentsForDate(dayKey).length === 0 ? (
                      <span className="muted">No visits</span>
                    ) : (
                      appointmentsForDate(dayKey).map((appointment) => (
                        <article
                          className="calendar-appointment-card"
                          key={appointment.id}
                        >
                          <strong>
                            {new Date(
                              appointment.scheduledStart,
                            ).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </strong>
                          <span>{appointment.patientId}</span>
                          <small>
                            {appointment.status} · {appointment.durationMinutes}{" "}
                            min
                          </small>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="calendar-day-view">
            {appointmentsForDate(selectedDate).length === 0 ? (
              <p className="muted">No appointments for this day.</p>
            ) : (
              appointmentsForDate(selectedDate).map((appointment) => (
                <article
                  className="calendar-day-appointment"
                  key={appointment.id}
                >
                  <div>
                    <strong>
                      {new Date(appointment.scheduledStart).toLocaleTimeString(
                        undefined,
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </strong>
                    <span>
                      {appointment.patientId} · {appointment.visitType}
                    </span>
                    <small>
                      {appointment.status} · {appointment.durationMinutes} min ·{" "}
                      {appointment.doctorId
                        ? doctorLabel(appointment.doctorId)
                        : "Unassigned"}
                    </small>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </section>
      <div className="appointment-list">
        <h3>Appointments in selected calendar range</h3>
        {appointments.length === 0 ? (
          <p className="muted">No appointments found.</p>
        ) : (
          appointments.map((appointment) => (
            <article className="appointment-row" key={appointment.id}>
              <div>
                <strong>{appointment.patientId}</strong>
                <span>
                  {new Date(appointment.scheduledStart).toLocaleString()} ·{" "}
                  {appointment.visitType}
                </span>
                <small>
                  {appointment.status} · {appointment.durationMinutes} min
                </small>
              </div>
              <button
                className="button secondary"
                type="button"
                disabled={isBusy}
                onClick={() => void openEncounter(appointment)}
              >
                Open encounter
              </button>
              {appointment.status === "scheduled" ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void updateStatus(appointment, "arrived")}
                >
                  Check in
                </button>
              ) : appointment.status === "arrived" ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void updateStatus(appointment, "in-consultation")
                  }
                >
                  Start
                </button>
              ) : appointment.status === "in-consultation" ? (
                <button
                  className="button primary"
                  type="button"
                  disabled={isBusy}
                  onClick={() => void updateStatus(appointment, "completed")}
                >
                  Complete
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>
      {selectedAppointment ? (
        <section className="encounter-panel" aria-labelledby="encounter-title">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Clinical record</p>
              <h3 id="encounter-title">
                Encounter note · {selectedAppointment.patientId}
              </h3>
              <p className="form-help">
                {new Date(selectedAppointment.scheduledStart).toLocaleString()}{" "}
                · {selectedAppointment.visitType}
              </p>
            </div>
            <span
              className={`status ${selectedEncounter?.status === "signed" ? "ok" : "warn"}`}
            >
              {selectedEncounter?.status ?? "not started"}
            </span>
          </div>
          {!selectedEncounter && !encounterForm ? (
            <p className="muted">
              No encounter note exists for this appointment.
            </p>
          ) : null}
          {encounterForm ? (
            <form
              className="encounter-editor"
              onSubmit={(event) => void saveEncounter(event)}
            >
              <div className="form-grid">
                <label>
                  Subjective
                  <textarea
                    rows={5}
                    value={encounterForm.subjective ?? ""}
                    onChange={(event) =>
                      setEncounterForm((current) =>
                        current
                          ? { ...current, subjective: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Objective
                  <textarea
                    rows={5}
                    value={encounterForm.objective ?? ""}
                    onChange={(event) =>
                      setEncounterForm((current) =>
                        current
                          ? { ...current, objective: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Assessment
                  <textarea
                    rows={5}
                    value={encounterForm.assessment ?? ""}
                    onChange={(event) =>
                      setEncounterForm((current) =>
                        current
                          ? { ...current, assessment: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Plan
                  <textarea
                    rows={5}
                    value={encounterForm.plan ?? ""}
                    onChange={(event) =>
                      setEncounterForm((current) =>
                        current
                          ? { ...current, plan: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
              </div>
              <label>
                Follow-up
                <textarea
                  rows={3}
                  value={encounterForm.followUp ?? ""}
                  onChange={(event) =>
                    setEncounterForm((current) =>
                      current
                        ? { ...current, followUp: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
              <div className="button-row">
                <button
                  className="button primary"
                  type="submit"
                  disabled={isBusy}
                >
                  {selectedEncounter ? "Save draft note" : "Create draft note"}
                </button>
                {selectedEncounter && canSignClinical ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy || selectedEncounter.status !== "draft"}
                    onClick={() => void signSelectedEncounter()}
                  >
                    Sign encounter
                  </button>
                ) : null}
              </div>
            </form>
          ) : selectedEncounter ? (
            <div className="encounter-readonly">
              <dl className="encounter-note-grid">
                <div>
                  <dt>Subjective</dt>
                  <dd>{displayedEncounter?.subjective ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Objective</dt>
                  <dd>{displayedEncounter?.objective ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Assessment</dt>
                  <dd>{displayedEncounter?.assessment ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>{displayedEncounter?.plan ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Follow-up</dt>
                  <dd>{displayedEncounter?.followUp ?? "Not recorded"}</dd>
                </div>
              </dl>
              {selectedEncounter.status === "signed" ? (
                <p className="status ok">
                  Signed original is immutable. Effective projection includes{" "}
                  {selectedEffectiveEncounter?.appliedAmendmentCount ?? 0}{" "}
                  applied amendment(s).
                </p>
              ) : null}
            </div>
          ) : null}
          {selectedEncounter?.status === "signed" ? (
            <div className="amendment-section">
              <div className="related-person-heading">
                <div>
                  <h4>Encounter amendments</h4>
                  <p className="form-help">
                    Corrections preserve the signed original and require a
                    separate Doctor review.
                  </p>
                </div>
                {canRecordDiagnosis ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={openAmendmentForm}
                  >
                    Request amendment
                  </button>
                ) : null}
              </div>
              <div className="projection-snapshot-controls">
                <label>
                  Export snapshot reason
                  <input
                    value={snapshotExportReason}
                    onChange={(event) =>
                      setSnapshotExportReason(event.target.value)
                    }
                    placeholder="Required for patient-record export snapshot"
                  />
                </label>
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy || snapshotExportReason.trim().length < 3}
                  onClick={() => void createProjectionSnapshot()}
                >
                  Create immutable export snapshot
                </button>
              </div>
              {projectionSnapshots.length > 0 ? (
                <div className="projection-snapshot-list">
                  <strong>Export snapshots</strong>
                  {projectionSnapshots.map((snapshot) => (
                    <small key={snapshot.id}>
                      {new Date(snapshot.createdAt).toLocaleString()} ·
                      effective v{snapshot.effectiveVersion} ·{" "}
                      {snapshot.appliedAmendmentCount} amendment(s) · hash{" "}
                      {snapshot.payloadHash.slice(0, 16)}… ·{" "}
                      {snapshot.exportReason}
                    </small>
                  ))}
                </div>
              ) : null}
              {canExport && projectionSnapshots.length > 0 ? (
                <div className="signed-export-controls">
                  <div className="inline-fields">
                    <label>
                      Export format
                      <select
                        value={exportFormat}
                        onChange={(event) =>
                          setExportFormat(event.target.value as "pdf" | "fhir")
                        }
                      >
                        <option value="pdf">Signed PDF</option>
                        <option value="fhir">FHIR JSON Bundle</option>
                      </select>
                    </label>
                    <label>
                      Redaction policy
                      <select
                        value={exportRedactionPolicy}
                        onChange={(event) =>
                          setExportRedactionPolicy(
                            event.target.value as
                              "minimal" | "clinical" | "full",
                          )
                        }
                      >
                        <option value="minimal">
                          Minimal — ID and clinical note
                        </option>
                        <option value="clinical">
                          Clinical — no phone or national ID
                        </option>
                        <option value="full" disabled={!canSensitiveExport}>
                          Full — sensitive identity fields
                        </option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Signed export reason
                    <input
                      value={exportReason}
                      onChange={(event) => setExportReason(event.target.value)}
                      placeholder="Required for the export audit trail"
                    />
                  </label>
                  <button
                    className="button primary"
                    type="button"
                    disabled={isBusy || exportReason.trim().length < 3}
                    onClick={() => void exportPatientRecord()}
                  >
                    Create and save signed export
                  </button>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy ||
                        exportReason.trim().length < 3 ||
                        exportFormat !== "fhir"
                      }
                      onClick={() => void validateFhirExport()}
                    >
                      Validate FHIR R4
                    </button>
                    <button
                      className="button primary"
                      type="button"
                      disabled={isBusy || exportReason.trim().length < 3}
                      onClick={() => void createZipPatientRecord()}
                    >
                      Create signed ZIP export
                    </button>
                  </div>
                  {fhirValidation ? (
                    <div className="export-validation">
                      <strong
                        className={
                          fhirValidation.valid ? "status ok" : "status error"
                        }
                      >
                        {fhirValidation.valid
                          ? "FHIR R4 validation passed"
                          : "FHIR R4 validation failed"}
                      </strong>
                      {fhirValidation.issues.map((issue) => (
                        <small key={`${issue.path}-${issue.code}`}>
                          {issue.severity.toUpperCase()} · {issue.path} ·{" "}
                          {issue.message}
                        </small>
                      ))}
                    </div>
                  ) : null}
                  {exportResult ? (
                    <div className="export-result">
                      <small>
                        Payload: {exportResult.savedFiles.payloadPath}
                      </small>
                      <small>
                        Manifest: {exportResult.savedFiles.manifestPath}
                      </small>
                      <small>
                        Signature: {exportResult.savedFiles.signaturePath}
                      </small>
                      {exportVerification ? (
                        <strong
                          className={
                            exportVerification.verified
                              ? "status ok"
                              : "status error"
                          }
                        >
                          {exportVerification.verified
                            ? "Verified: payload hash, signature, and snapshot hash reference are valid."
                            : exportVerification.reason}
                        </strong>
                      ) : null}
                    </div>
                  ) : null}
                  {zipExportResult ? (
                    <div className="export-result">
                      <small>
                        ZIP archive: {zipExportResult.savedArchivePath}
                      </small>
                      <small>
                        Package ID: {zipExportResult.package.packageId}
                      </small>
                      <small>
                        Expires:{" "}
                        {zipExportResult.package.manifest.expiresAt ?? "Never"}
                      </small>
                      <strong
                        className={
                          zipExportResult.verification.verified
                            ? "status ok"
                            : "status error"
                        }
                      >
                        {zipExportResult.verification.verified
                          ? "ZIP verified and currently valid"
                          : zipExportResult.verification.reason}
                      </strong>
                      {canRevoke && !zipExportResult.verification.revoked ? (
                        <div className="button-row">
                          <input
                            value={revocationReason}
                            onChange={(event) =>
                              setRevocationReason(event.target.value)
                            }
                            placeholder="Reason to revoke this package"
                          />
                          <button
                            className="button danger"
                            type="button"
                            disabled={
                              isBusy || revocationReason.trim().length < 3
                            }
                            onClick={() => void revokeLatestZipExport()}
                          >
                            Revoke package
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {canManage ? (
                <div className="org-settings-panel">
                  <div className="section-heading">
                    <h4>Export registry and signing-key security</h4>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void loadExportRegistry()}
                    >
                      Load export registry
                    </button>
                  </div>
                  {exportRegistry.length > 0 ? (
                    <div className="export-registry-list">
                      <label>
                        Package
                        <select
                          value={selectedRegistryPackageId}
                          onChange={(event) =>
                            setSelectedRegistryPackageId(event.target.value)
                          }
                        >
                          {exportRegistry.map((record) => (
                            <option
                              key={record.packageId}
                              value={record.packageId}
                            >
                              {record.packageId} · {record.status} ·{" "}
                              {record.format.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <input
                        value={registryTransitionReason}
                        onChange={(event) =>
                          setRegistryTransitionReason(event.target.value)
                        }
                        placeholder="Lifecycle transition reason"
                      />
                      <button
                        className="button secondary"
                        type="button"
                        disabled={
                          isBusy || registryTransitionReason.trim().length < 3
                        }
                        onClick={() => void transitionRegistryPackage()}
                      >
                        Advance lifecycle
                      </button>
                    </div>
                  ) : (
                    <small>No registered exports loaded.</small>
                  )}
                  {signingKeys.length > 0 ? (
                    <div className="export-registry-list">
                      <small>
                        Active key:{" "}
                        {signingKeys.find((key) => key.status === "active")
                          ?.keyId ?? "none"}
                      </small>
                      <small>
                        Known key versions:{" "}
                        {signingKeys
                          .map((key) => `${key.keyVersion}:${key.status}`)
                          .join(", ")}
                      </small>
                    </div>
                  ) : null}
                  <div className="button-row">
                    <input
                      value={keyRotationReason}
                      onChange={(event) =>
                        setKeyRotationReason(event.target.value)
                      }
                      placeholder="Reason for key rotation"
                    />
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || keyRotationReason.trim().length < 3}
                      onClick={() => void rotateSigningKey()}
                    >
                      Rotate signing key
                    </button>
                  </div>
                  <div className="button-row">
                    <input
                      type="password"
                      value={recoveryPassphrase}
                      onChange={(event) =>
                        setRecoveryPassphrase(event.target.value)
                      }
                      placeholder="Recovery passphrase (12+ characters)"
                    />
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || recoveryPassphrase.length < 12}
                      onClick={() => void exportSigningKeyRecovery()}
                    >
                      Create recovery bundle
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy ||
                        recoveryPassphrase.length < 12 ||
                        recoveryBundleJson.trim().length < 2
                      }
                      onClick={() => void restoreSigningKeyRecovery()}
                    >
                      Restore recovery bundle
                    </button>
                  </div>
                  <textarea
                    value={recoveryBundleJson}
                    onChange={(event) =>
                      setRecoveryBundleJson(event.target.value)
                    }
                    placeholder="Encrypted signing-key recovery bundle JSON"
                    rows={4}
                  />
                </div>
              ) : null}
              {canManage ? (
                <div className="org-settings-panel export-governance-panel">
                  <div className="section-heading">
                    <div>
                      <h4>Export governance and disclosure receipts</h4>
                      <small>
                        Review recipients, consent evidence, disclosures, and
                        signed receipts without exposing recovery material.
                      </small>
                    </div>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void loadGovernance()}
                    >
                      Load governance data
                    </button>
                  </div>
                  <div className="inline-fields">
                    <label>
                      Recipient name
                      <input
                        value={recipientDisplayName}
                        onChange={(event) =>
                          setRecipientDisplayName(event.target.value)
                        }
                        placeholder="Referral recipient"
                      />
                    </label>
                    <label>
                      Organization
                      <input
                        value={recipientOrganizationName}
                        onChange={(event) =>
                          setRecipientOrganizationName(event.target.value)
                        }
                        placeholder="Recipient organization"
                      />
                    </label>
                    <label>
                      Category
                      <select
                        value={recipientCategory}
                        onChange={(event) =>
                          setRecipientCategory(
                            event.target.value as ExportRecipient["category"],
                          )
                        }
                      >
                        <option value="referral-provider">
                          Referral provider
                        </option>
                        <option value="treating-provider">
                          Treating provider
                        </option>
                        <option value="patient">Patient</option>
                        <option value="guardian">Guardian</option>
                        <option value="legal-authority">Legal authority</option>
                        <option value="administrative-authority">
                          Administrative authority
                        </option>
                        <option value="internal-clinic">Internal clinic</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Contact/delivery note
                      <input
                        value={recipientContactChannel}
                        onChange={(event) =>
                          setRecipientContactChannel(event.target.value)
                        }
                        placeholder="USB handoff or verified channel"
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy || recipientDisplayName.trim().length < 1
                      }
                      onClick={() => void createGovernanceRecipient()}
                    >
                      Create recipient
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || governanceReason.trim().length < 3}
                      onClick={() => void verifyFirstRecipient()}
                    >
                      Verify first pending recipient
                    </button>
                  </div>
                  <div className="inline-fields">
                    <label>
                      Evidence patient ID
                      <input
                        value={patientId}
                        onChange={(event) => setPatientId(event.target.value)}
                        placeholder="EL-00001"
                      />
                    </label>
                    <label>
                      Evidence reference
                      <input
                        value={governanceEvidenceReference}
                        onChange={(event) =>
                          setGovernanceEvidenceReference(event.target.value)
                        }
                        placeholder="Consent record or policy reference"
                      />
                    </label>
                    <label>
                      Governance reason
                      <input
                        value={governanceReason}
                        onChange={(event) =>
                          setGovernanceReason(event.target.value)
                        }
                        placeholder="Reason for review or delivery"
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy ||
                        patientId.trim().length < 3 ||
                        governanceEvidenceReference.trim().length < 1
                      }
                      onClick={() => void createGovernanceEvidence()}
                    >
                      Record patient-consent evidence
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || governanceReason.trim().length < 3}
                      onClick={() => void approveFirstEvidence()}
                    >
                      Approve first pending evidence
                    </button>
                  </div>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        isBusy ||
                        governanceReason.trim().length < 3 ||
                        !selectedRegistryPackageId
                      }
                      onClick={() => void requestFirstDisclosure()}
                    >
                      Request referral disclosure for selected package
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || governanceReason.trim().length < 3}
                      onClick={() => void advanceFirstDisclosure()}
                    >
                      Approve/send next disclosure
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void issueFirstReceipt()}
                    >
                      Issue signed receipt
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy || governanceReason.trim().length < 3}
                      onClick={() => void acknowledgeFirstReceipt()}
                    >
                      Acknowledge receipt
                    </button>
                  </div>
                  <div className="export-registry-list">
                    <small>Recipients: {governanceRecipients.length}</small>
                    <small>Consent evidence: {governanceEvidence.length}</small>
                    <small>Disclosures: {governanceDisclosures.length}</small>
                    <small>Receipts: {governanceReceipts.length}</small>
                    {governanceDisclosures[0] ? (
                      <small>
                        Latest disclosure: {governanceDisclosures[0].status} ·{" "}
                        {governanceDisclosures[0].packageId}
                      </small>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {canManage ? (
                <div className="org-settings-panel">
                  <div className="section-heading">
                    <h4>Organization identifiers and export expiration</h4>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isBusy}
                      onClick={() => void loadOrganizationSettings()}
                    >
                      Load settings
                    </button>
                  </div>
                  <div className="inline-fields">
                    <label>
                      Clinic name
                      <input
                        value={orgSettingsForm.clinicNameEn}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            clinicNameEn: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Country code
                      <input
                        value={orgSettingsForm.countryCode}
                        maxLength={2}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            countryCode: event.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label>
                      OID
                      <input
                        value={orgSettingsForm.oid}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            oid: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      FHIR system URL
                      <input
                        value={orgSettingsForm.fhirSystemUrl}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            fhirSystemUrl: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Expiration days
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={orgSettingsForm.exportExpirationDays}
                        onChange={(event) =>
                          setOrgSettingsForm({
                            ...orgSettingsForm,
                            exportExpirationDays: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void saveOrganizationSettings()}
                  >
                    Save organization settings
                  </button>
                  {orgSettings ? (
                    <small className="muted">
                      Last updated{" "}
                      {new Date(orgSettings.updatedAt).toLocaleString()} by{" "}
                      {orgSettings.updatedByUserId}
                    </small>
                  ) : null}
                </div>
              ) : null}
              {amendments.length === 0 ? (
                <p className="muted">
                  No amendment requests for this signed note.
                </p>
              ) : (
                <div className="amendment-list">
                  {amendments.map((amendment) => (
                    <article className="amendment-row" key={amendment.id}>
                      <div>
                        <strong>{amendment.status} amendment</strong>
                        <span>{amendment.correctionReason}</span>
                        <small>
                          Requested by {amendment.requestedByUserId} · base
                          version {amendment.baseEncounterVersion}
                          {amendment.baseAmendmentId
                            ? ` · after ${amendment.baseAmendmentId}`
                            : " · original signed record"}
                          {amendment.appliedSequence
                            ? ` · sequence ${amendment.appliedSequence}`
                            : ""}
                        </small>
                        {amendment.reviewReason ? (
                          <small>Review: {amendment.reviewReason}</small>
                        ) : null}
                        {amendment.conflictReason ? (
                          <small>Conflict: {amendment.conflictReason}</small>
                        ) : null}
                        {amendmentDiffs
                          .find((diff) => diff.amendmentId === amendment.id)
                          ?.fields.map((fieldDiff) => (
                            <small key={`${amendment.id}-${fieldDiff.field}`}>
                              {fieldDiff.field}:{" "}
                              {fieldDiff.before ?? "Not recorded"} →{" "}
                              {fieldDiff.after ?? "Not recorded"}
                            </small>
                          ))}
                      </div>
                      {canApproveClinical && amendment.status === "pending" ? (
                        <div className="button-row">
                          <button
                            className="button primary"
                            type="button"
                            disabled={
                              isBusy || amendmentReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void reviewAmendment(amendment, "approved")
                            }
                          >
                            Approve
                          </button>
                          <button
                            className="button danger"
                            type="button"
                            disabled={
                              isBusy || amendmentReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void reviewAmendment(amendment, "rejected")
                            }
                          >
                            Reject
                          </button>
                        </div>
                      ) : amendment.status === "approved" &&
                        canApproveClinical ? (
                        <button
                          className="button primary"
                          type="button"
                          disabled={isBusy}
                          onClick={() => void applyAmendment(amendment)}
                        >
                          Apply amendment
                        </button>
                      ) : amendment.status === "conflict" &&
                        canApproveClinical ? (
                        <div className="button-row">
                          <button
                            className="button primary"
                            type="button"
                            disabled={
                              isBusy || amendmentReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void resolveAmendmentConflict(amendment, "rebase")
                            }
                          >
                            Rebase and approve
                          </button>
                          <button
                            className="button danger"
                            type="button"
                            disabled={
                              isBusy || amendmentReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void resolveAmendmentConflict(amendment, "reject")
                            }
                          >
                            Reject conflict
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
              {canApproveClinical &&
              amendments.some(
                (amendment) =>
                  amendment.status === "pending" ||
                  amendment.status === "conflict",
              ) ? (
                <label className="history-audit-reason">
                  Amendment review or conflict-resolution reason
                  <input
                    value={amendmentReviewReason}
                    onChange={(event) =>
                      setAmendmentReviewReason(event.target.value)
                    }
                    placeholder="Required for review, rebase, or rejection"
                  />
                </label>
              ) : null}
              {amendmentForm ? (
                <form
                  className="amendment-editor"
                  onSubmit={(event) => void saveAmendment(event)}
                >
                  <h4>Proposed correction</h4>
                  <div className="form-grid">
                    <label>
                      Subjective
                      <textarea
                        rows={5}
                        value={amendmentForm.subjective ?? ""}
                        onChange={(event) =>
                          setAmendmentForm((current) =>
                            current
                              ? { ...current, subjective: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Objective
                      <textarea
                        rows={5}
                        value={amendmentForm.objective ?? ""}
                        onChange={(event) =>
                          setAmendmentForm((current) =>
                            current
                              ? { ...current, objective: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Assessment
                      <textarea
                        rows={5}
                        value={amendmentForm.assessment ?? ""}
                        onChange={(event) =>
                          setAmendmentForm((current) =>
                            current
                              ? { ...current, assessment: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      Plan
                      <textarea
                        rows={5}
                        value={amendmentForm.plan ?? ""}
                        onChange={(event) =>
                          setAmendmentForm((current) =>
                            current
                              ? { ...current, plan: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Follow-up
                    <textarea
                      rows={3}
                      value={amendmentForm.followUp ?? ""}
                      onChange={(event) =>
                        setAmendmentForm((current) =>
                          current
                            ? { ...current, followUp: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    Correction reason
                    <textarea
                      required
                      rows={3}
                      value={amendmentForm.correctionReason}
                      onChange={(event) =>
                        setAmendmentForm((current) =>
                          current
                            ? {
                                ...current,
                                correctionReason: event.target.value,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="button primary"
                      type="submit"
                      disabled={isBusy}
                    >
                      Submit amendment request
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setAmendmentForm(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
          {selectedEncounter ? (
            <div className="diagnosis-section">
              <div className="related-person-heading">
                <div>
                  <h4>ICD-10 diagnoses</h4>
                  <p className="form-help">
                    Diagnosis text is recorded in English and linked to a local
                    ICD-10 release.
                  </p>
                </div>
                {canRecordDiagnosis && selectedEncounter.status === "draft" ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBusy}
                    onClick={() => setDiagnosisForm({ ...emptyDiagnosisForm })}
                  >
                    Add diagnosis
                  </button>
                ) : null}
              </div>
              {diagnoses.length === 0 ? (
                <p className="muted">
                  No diagnoses recorded for this encounter.
                </p>
              ) : (
                <div className="diagnosis-list">
                  {diagnoses.map((diagnosis) => (
                    <article className="diagnosis-row" key={diagnosis.id}>
                      <div>
                        <strong>
                          {diagnosis.icd10Code} · {diagnosis.diagnosisTextEn}
                        </strong>
                        <span>
                          {diagnosis.icd10TitleEn} ·{" "}
                          {diagnosis.isPrimary ? "Primary" : "Additional"}
                        </span>
                        <small>
                          Approval: {diagnosis.approvalStatus} · recorded by{" "}
                          {diagnosis.recordedByUserId}
                        </small>
                      </div>
                      {canApproveClinical &&
                      diagnosis.approvalStatus === "pending" ? (
                        <div className="button-row">
                          <button
                            className="button primary"
                            type="button"
                            disabled={
                              isBusy || diagnosisReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void reviewDiagnosis(diagnosis, "approved")
                            }
                          >
                            Approve
                          </button>
                          <button
                            className="button danger"
                            type="button"
                            disabled={
                              isBusy || diagnosisReviewReason.trim().length < 3
                            }
                            onClick={() =>
                              void reviewDiagnosis(diagnosis, "rejected")
                            }
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
              {canApproveClinical &&
              diagnoses.some(
                (diagnosis) => diagnosis.approvalStatus === "pending",
              ) ? (
                <label className="history-audit-reason">
                  Diagnosis review reason
                  <input
                    value={diagnosisReviewReason}
                    onChange={(event) =>
                      setDiagnosisReviewReason(event.target.value)
                    }
                    placeholder="Required for approval or rejection"
                  />
                </label>
              ) : null}
              {diagnosisForm ? (
                <form
                  className="diagnosis-editor"
                  onSubmit={(event) => void saveDiagnosis(event)}
                >
                  <div className="form-grid">
                    <label>
                      ICD-10 code
                      <select
                        required
                        value={diagnosisForm.icd10CodeId}
                        onChange={(event) =>
                          setDiagnosisForm((current) =>
                            current
                              ? { ...current, icd10CodeId: event.target.value }
                              : current,
                          )
                        }
                      >
                        <option value="">Select code</option>
                        {icd10Codes.map((code) => (
                          <option key={code.id} value={code.id}>
                            {code.code} · {code.titleEn} · {code.releaseVersion}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Diagnosis in English
                      <input
                        required
                        value={diagnosisForm.diagnosisTextEn}
                        onChange={(event) =>
                          setDiagnosisForm((current) =>
                            current
                              ? {
                                  ...current,
                                  diagnosisTextEn: event.target.value,
                                }
                              : current,
                          )
                        }
                      />
                    </label>
                  </div>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={diagnosisForm.isPrimary}
                      onChange={(event) =>
                        setDiagnosisForm((current) =>
                          current
                            ? { ...current, isPrimary: event.target.checked }
                            : current,
                        )
                      }
                    />
                    Primary diagnosis
                  </label>
                  <div className="button-row">
                    <button
                      className="button primary"
                      type="submit"
                      disabled={isBusy}
                    >
                      Record diagnosis
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setDiagnosisForm(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

const MERGE_FIELDS: readonly PatientMergeField[] = [
  "nameEn",
  "nameAr",
  "dob",
  "sex",
  "phone",
  "nationalId",
  "primaryDepartmentId",
];

const MERGE_FIELD_LABELS: Record<PatientMergeField, string> = {
  nameEn: "English name",
  nameAr: "Arabic name",
  dob: "Date of birth",
  sex: "Sex",
  phone: "Phone",
  nationalId: "National ID",
  primaryDepartmentId: "Primary department",
};

function defaultMergeDecisions(): PatientMergeFieldDecisions {
  return {
    nameEn: "target",
    nameAr: "target",
    dob: "target",
    sex: "target",
    phone: "target",
    nationalId: "target",
    primaryDepartmentId: "target",
  };
}

function mergePatientValue(
  patient: Patient | null,
  field: PatientMergeField,
): string {
  if (!patient) return "Loading…";
  const values: Record<PatientMergeField, string | undefined> = {
    nameEn: patient.nameEn,
    nameAr: patient.nameAr,
    dob: patient.dob,
    sex: patient.sex,
    phone: patient.phone,
    nationalId: patient.nationalId,
    primaryDepartmentId: patient.primaryDepartmentId,
  };
  return values[field] ?? "Not recorded";
}

function MergeReviewQueue({ token }: { token: string }): ReactElement {
  const [cases, setCases] = useState<readonly PatientMergeCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<PatientMergeCase | null>(
    null,
  );
  const [sourcePatient, setSourcePatient] = useState<Patient | null>(null);
  const [targetPatient, setTargetPatient] = useState<Patient | null>(null);
  const [fieldDecisions, setFieldDecisions] =
    useState<PatientMergeFieldDecisions>(defaultMergeDecisions);
  const [reviewReason, setReviewReason] = useState("");
  const [requestSourceId, setRequestSourceId] = useState("");
  const [requestTargetId, setRequestTargetId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestDecisions, setRequestDecisions] =
    useState<PatientMergeFieldDecisions>(defaultMergeDecisions);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = async (): Promise<void> => {
    try {
      setCases(await window.elite.patients.listMergeCases(token));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load merge cases",
      );
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const selectCase = async (mergeCase: PatientMergeCase): Promise<void> => {
    setSelectedCase(mergeCase);
    setFieldDecisions({
      ...defaultMergeDecisions(),
      ...mergeCase.fieldDecisions,
    });
    setReviewReason(mergeCase.reviewReason ?? "");
    setError(null);
    try {
      const [source, target] = await Promise.all([
        window.elite.patients.get(token, mergeCase.sourcePatientId),
        window.elite.patients.get(token, mergeCase.targetPatientId),
      ]);
      setSourcePatient(source);
      setTargetPatient(target);
    } catch (reason: unknown) {
      setSourcePatient(null);
      setTargetPatient(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load merge patients",
      );
    }
  };

  const reviewCase = async (decision: "approve" | "reject"): Promise<void> => {
    if (!selectedCase || reviewReason.trim().length < 3) return;
    setIsBusy(true);
    setError(null);
    try {
      const reviewed = await window.elite.patients.reviewMerge(
        token,
        selectedCase.id,
        decision,
        reviewReason,
        fieldDecisions,
      );
      setSelectedCase(reviewed);
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to review merge case",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const executeCase = async (): Promise<void> => {
    if (!selectedCase || selectedCase.status !== "approved") return;
    setIsBusy(true);
    setError(null);
    try {
      const executed = await window.elite.patients.executeMerge(
        token,
        selectedCase.id,
      );
      setSelectedCase(executed);
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to execute merge case",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const requestMerge = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (requestSourceId.trim() === requestTargetId.trim()) {
      setError("Source and target patients must be different");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const created = await window.elite.patients.requestMerge(token, {
        sourcePatientId: requestSourceId.trim(),
        targetPatientId: requestTargetId.trim(),
        reason: requestReason,
        fieldDecisions: requestDecisions,
      });
      setRequestSourceId("");
      setRequestTargetId("");
      setRequestReason("");
      setRequestDecisions(defaultMergeDecisions());
      await refresh();
      await selectCase(created);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create merge request",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const decisionFields = (
    decisions: PatientMergeFieldDecisions,
    setDecisions: React.Dispatch<
      React.SetStateAction<PatientMergeFieldDecisions>
    >,
    source: Patient | null,
    target: Patient | null,
  ): ReactElement => (
    <div className="merge-field-list">
      {MERGE_FIELDS.map((field) => (
        <div className="merge-field-row" key={field}>
          <div>
            <strong>{MERGE_FIELD_LABELS[field]}</strong>
            <small>
              Source: {mergePatientValue(source, field)} · Target:{" "}
              {mergePatientValue(target, field)}
            </small>
          </div>
          <select
            value={decisions[field] ?? "target"}
            onChange={(event) =>
              setDecisions((current) => ({
                ...current,
                [field]: event.target.value as "source" | "target",
              }))
            }
          >
            <option value="target">Keep target</option>
            <option value="source">Use source</option>
          </select>
        </div>
      ))}
    </div>
  );

  const pendingCount = cases.filter(
    (mergeCase) => mergeCase.status === "pending",
  ).length;

  return (
    <section
      className="card merge-review-card"
      aria-labelledby="merge-review-title"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">Admin control</p>
          <h2 id="merge-review-title">Patient merge review queue</h2>
        </div>
        <span className={`status ${pendingCount > 0 ? "warn" : "ok"}`}>
          {pendingCount} pending
        </span>
      </div>
      <ErrorMessage message={error} />
      <form
        className="merge-request-form"
        onSubmit={(event) => void requestMerge(event)}
      >
        <h3>Request a controlled merge</h3>
        <div className="form-grid">
          <label>
            Source patient ID
            <input
              required
              placeholder="EL-00001"
              value={requestSourceId}
              onChange={(event) => setRequestSourceId(event.target.value)}
            />
          </label>
          <label>
            Target patient ID
            <input
              required
              placeholder="EL-00002"
              value={requestTargetId}
              onChange={(event) => setRequestTargetId(event.target.value)}
            />
          </label>
        </div>
        <label>
          Reason
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={requestReason}
            onChange={(event) => setRequestReason(event.target.value)}
          />
        </label>
        {decisionFields(requestDecisions, setRequestDecisions, null, null)}
        <button className="button primary" type="submit" disabled={isBusy}>
          Create merge request
        </button>
      </form>
      <div className="merge-queue-list">
        {cases.length === 0 ? (
          <p className="muted">No merge cases have been requested.</p>
        ) : null}
        {cases.map((mergeCase) => (
          <button
            className={`merge-case-row ${selectedCase?.id === mergeCase.id ? "selected" : ""}`}
            type="button"
            key={mergeCase.id}
            onClick={() => void selectCase(mergeCase)}
            disabled={isBusy}
          >
            <strong>
              {mergeCase.sourcePatientId} → {mergeCase.targetPatientId}
            </strong>
            <span>
              {mergeCase.status} · requested{" "}
              {new Date(mergeCase.requestedAt).toLocaleString()}
            </span>
            <small>Correlation {mergeCase.correlationId}</small>
          </button>
        ))}
      </div>
      {selectedCase ? (
        <div className="merge-case-detail">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Selected case</p>
              <h3>
                {selectedCase.sourcePatientId} → {selectedCase.targetPatientId}
              </h3>
            </div>
            <span
              className={`status ${selectedCase.status === "pending" ? "warn" : selectedCase.status === "executed" ? "ok" : "info"}`}
            >
              {selectedCase.status}
            </span>
          </div>
          <p className="form-help">
            Correlation ID: <strong>{selectedCase.correlationId}</strong>
          </p>
          {decisionFields(
            fieldDecisions,
            setFieldDecisions,
            sourcePatient,
            targetPatient,
          )}
          <label>
            Review reason
            <textarea
              minLength={3}
              maxLength={500}
              value={reviewReason}
              onChange={(event) => setReviewReason(event.target.value)}
            />
          </label>
          {selectedCase.status === "pending" ? (
            <div className="button-row">
              <button
                className="button primary"
                type="button"
                disabled={isBusy || reviewReason.trim().length < 3}
                onClick={() => void reviewCase("approve")}
              >
                Approve case
              </button>
              <button
                className="button danger"
                type="button"
                disabled={isBusy || reviewReason.trim().length < 3}
                onClick={() => void reviewCase("reject")}
              >
                Reject case
              </button>
            </div>
          ) : null}
          {selectedCase.status === "approved" ? (
            <button
              className="button primary"
              type="button"
              disabled={isBusy}
              onClick={() => void executeCase()}
            >
              Execute approved merge
            </button>
          ) : null}
          {selectedCase.status === "executed" ? (
            <p className="status ok">
              Merge executed transactionally. The source patient remains as a
              merged redirect record.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatEgp(amount: number): string {
  return `${amount.toLocaleString("en-EG")} EGP`;
}

function BillingWorkspace({
  token,
  session,
}: {
  token: string;
  session: SessionSummary;
}): ReactElement {
  const [packages, setPackages] = useState<readonly BillingPackage[]>([]);
  const [services, setServices] = useState<readonly Service[]>([]);
  const [invoices, setInvoices] = useState<readonly BillingInvoice[]>([]);
  const [patientId, setPatientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [discountEgp, setDiscountEgp] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<BillingPaymentInput["method"]>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [refundPaymentId, setRefundPaymentId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [packageCode, setPackageCode] = useState("");
  const [packageName, setPackageName] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const canManageCatalog = session.capabilities.includes("module.manage");
  const canWriteBilling = session.capabilities.includes("billing.write");
  const canRefund = session.capabilities.includes("billing.refund");

  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      const [nextPackages, nextServices, nextInvoices] = await Promise.all([
        window.elite.billing.listPackages(token),
        window.elite.clinical.listServices(token),
        window.elite.billing.listInvoices(token),
      ]);
      setPackages(nextPackages);
      setServices(
        nextServices.filter((service) => service.status === "active"),
      );
      setInvoices(nextInvoices);
      if (!selectedInvoiceId && nextInvoices[0]) {
        setSelectedInvoiceId(nextInvoices[0].id);
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load billing data",
      );
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const createPackage = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!serviceId) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      await window.elite.billing.createPackage(token, {
        code: packageCode,
        nameEn: packageName,
        priceEgp: Number(packagePrice),
        items: [{ serviceId, quantity: 1 }],
      });
      setPackageCode("");
      setPackageName("");
      setPackagePrice("");
      setNotice("Service package created.");
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create package",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createInvoice = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!patientId || (!serviceId && !packageId)) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const line = serviceId
        ? { serviceId, quantity: Number(quantity) }
        : { packageId, quantity: Number(quantity) };
      const input: BillingInvoiceCreateInput = {
        patientId,
        lines: [line],
        discountEgp: Number(discountEgp),
        ...(discountReason.trim()
          ? { discountReason: discountReason.trim() }
          : {}),
      };
      const invoice = await window.elite.billing.createInvoice(token, input);
      setSelectedInvoiceId(invoice.id);
      setInvoices((current) => [
        invoice,
        ...current.filter((item) => item.id !== invoice.id),
      ]);
      setNotice(`Invoice ${invoice.invoiceNumber} created.`);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to create invoice",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const postPayment = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedInvoiceId) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: BillingPaymentInput = {
        invoiceId: selectedInvoiceId,
        amountEgp: Number(paymentAmount),
        method: paymentMethod,
        ...(paymentReference.trim()
          ? { reference: paymentReference.trim() }
          : {}),
      };
      const result = await window.elite.billing.postPayment(token, input);
      const payment = result.payment as BillingPayment;
      setRefundPaymentId(payment.id);
      setPaymentAmount("");
      setPaymentReference("");
      setNotice(`Receipt ${result.receipt.receiptNumber} issued.`);
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to post payment",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const postRefund = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: BillingRefundInput = {
        paymentId: refundPaymentId,
        amountEgp: Number(refundAmount),
        reason: refundReason,
      };
      await window.elite.billing.postRefund(token, input);
      setRefundAmount("");
      setRefundReason("");
      setNotice("Refund recorded and the invoice was reconciled.");
      await refresh();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Unable to record refund",
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="billing-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Step 29 · Finance</p>
          <h2 id="billing-title">Service billing and receipts</h2>
        </div>
        <span className="status ok">EGP · local-first</span>
      </div>
      <p className="form-help">
        Prices are captured on the invoice at creation time. Payments, receipts,
        partial payments, and refunds are recorded as audited ledger events.
      </p>
      <ErrorMessage message={error} />
      {notice ? <p className="status ok">{notice}</p> : null}
      {canManageCatalog ? (
        <form
          className="form-section"
          onSubmit={(event) => void createPackage(event)}
        >
          <h3>Admin service package</h3>
          <div className="form-grid">
            <label>
              Code
              <input
                required
                value={packageCode}
                onChange={(event) => setPackageCode(event.target.value)}
              />
            </label>
            <label>
              Name
              <input
                required
                value={packageName}
                onChange={(event) => setPackageName(event.target.value)}
              />
            </label>
            <label>
              Price (EGP)
              <input
                required
                min="0"
                type="number"
                value={packagePrice}
                onChange={(event) => setPackagePrice(event.target.value)}
              />
            </label>
            <label>
              Included service
              <select
                required
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">Select service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.nameEn} · {formatEgp(service.priceEgp)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="button secondary" type="submit" disabled={isBusy}>
            Create package
          </button>
        </form>
      ) : null}
      <div className="form-section">
        <h3>Available catalog</h3>
        <div className="patient-list">
          {services.map((service) => (
            <div className="patient-row" key={service.id}>
              <span>
                <strong>{service.nameEn}</strong>
                <small>
                  {service.code} · {formatEgp(service.priceEgp)}
                </small>
              </span>
              <span className="status ok">Active</span>
            </div>
          ))}
          {packages.map((pkg) => (
            <div className="patient-row" key={pkg.id}>
              <span>
                <strong>{pkg.nameEn}</strong>
                <small>
                  {pkg.code} · {formatEgp(pkg.priceEgp)}
                </small>
              </span>
              <span className="status ok">{pkg.status}</span>
            </div>
          ))}
        </div>
      </div>
      {canWriteBilling ? (
        <form
          className="form-section"
          onSubmit={(event) => void createInvoice(event)}
        >
          <h3>Create invoice</h3>
          <div className="form-grid">
            <label>
              Patient ID
              <input
                required
                placeholder="EL-00001"
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
              />
            </label>
            <label>
              Service
              <select
                value={serviceId}
                onChange={(event) => {
                  setServiceId(event.target.value);
                  setPackageId("");
                }}
              >
                <option value="">No service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.nameEn} · {formatEgp(service.priceEgp)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Package
              <select
                value={packageId}
                onChange={(event) => {
                  setPackageId(event.target.value);
                  setServiceId("");
                }}
              >
                <option value="">No package</option>
                {packages
                  .filter((pkg) => pkg.status === "active")
                  .map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.nameEn} · {formatEgp(pkg.priceEgp)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                required
                min="1"
                type="number"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label>
              Discount (EGP)
              <input
                min="0"
                type="number"
                value={discountEgp}
                onChange={(event) => setDiscountEgp(event.target.value)}
              />
            </label>
            <label>
              Discount reason
              <input
                value={discountReason}
                onChange={(event) => setDiscountReason(event.target.value)}
              />
            </label>
          </div>
          <button
            className="button primary"
            type="submit"
            disabled={isBusy || (!serviceId && !packageId)}
          >
            Create invoice
          </button>
        </form>
      ) : null}
      <div className="form-section">
        <h3>Invoices</h3>
        <div className="patient-list">
          {invoices.map((invoice) => (
            <button
              className="patient-row"
              type="button"
              key={invoice.id}
              onClick={() => setSelectedInvoiceId(invoice.id)}
            >
              <span>
                <strong>{invoice.invoiceNumber}</strong>
                <small>
                  {invoice.patientId} · {invoice.status}
                </small>
              </span>
              <span>
                <strong>{formatEgp(invoice.totalEgp)}</strong>
                <small>
                  Paid {formatEgp(invoice.paidEgp)} · Balance{" "}
                  {formatEgp(invoice.balanceEgp)}
                </small>
              </span>
            </button>
          ))}
          {invoices.length === 0 ? (
            <p className="muted">No invoices recorded yet.</p>
          ) : null}
        </div>
      </div>
      {selectedInvoiceId && canWriteBilling ? (
        <form
          className="form-section"
          onSubmit={(event) => void postPayment(event)}
        >
          <h3>Post payment and issue receipt</h3>
          <div className="form-grid">
            <label>
              Invoice
              <select
                value={selectedInvoiceId}
                onChange={(event) => setSelectedInvoiceId(event.target.value)}
              >
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNumber} · Balance{" "}
                    {formatEgp(invoice.balanceEgp)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount (EGP)
              <input
                required
                min="1"
                type="number"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </label>
            <label>
              Method
              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(
                    event.target.value as BillingPaymentInput["method"],
                  )
                }
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank-transfer">Bank transfer</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Reference
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </label>
          </div>
          <button className="button primary" type="submit" disabled={isBusy}>
            Post payment
          </button>
        </form>
      ) : null}
      {selectedInvoiceId && canRefund ? (
        <form
          className="form-section"
          onSubmit={(event) => void postRefund(event)}
        >
          <h3>Refund payment</h3>
          <div className="form-grid">
            <label>
              Payment ID
              <input
                required
                value={refundPaymentId}
                onChange={(event) => setRefundPaymentId(event.target.value)}
              />
            </label>
            <label>
              Refund amount (EGP)
              <input
                required
                min="1"
                type="number"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
            </label>
            <label>
              Reason
              <input
                required
                minLength={3}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
              />
            </label>
          </div>
          <button className="button danger" type="submit" disabled={isBusy}>
            Record refund
          </button>
        </form>
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
      {session.capabilities.includes("billing.read") ? (
        <BillingWorkspace token={token} session={session} />
      ) : null}
      {session.capabilities.includes("appointment.read") ? (
        <ClinicalWorkflowWorkspace
          token={token}
          canManage={session.capabilities.includes("module.manage")}
          canWriteClinical={session.capabilities.includes("clinical.write")}
          canSignClinical={session.capabilities.includes("clinical.sign")}
          canApproveClinical={session.capabilities.includes("clinical.approve")}
          canRecordDiagnosis={
            session.role === "doctor" &&
            session.capabilities.includes("clinical.write")
          }
          canExport={session.capabilities.includes("export.manage")}
          canSensitiveExport={session.capabilities.includes("export.sensitive")}
          canRevoke={session.capabilities.includes("export.revoke")}
        />
      ) : null}
      {session.role === "admin" &&
      session.capabilities.includes("patient.merge") ? (
        <MergeReviewQueue token={token} />
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

function LanSyncRecoveryNotice({
  status,
  token,
  session,
  onStatusChange,
}: {
  status: LanSyncStatus;
  token: string | null;
  session: SessionSummary | null;
  onStatusChange: (status: LanSyncStatus) => void;
}): ReactElement | null {
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRecover =
    session?.role === "admin" &&
    session.capabilities.includes("device.manage") &&
    Boolean(token);

  if (status.state === "ready") return null;

  const retry = async (): Promise<void> => {
    if (!token || !canRecover) return;
    setIsRetrying(true);
    setError(null);
    try {
      onStatusChange(await window.elite.app.restartLanSync(token));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to retry secure LAN synchronization",
      );
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <section
      className="card tls-recovery-card"
      aria-labelledby="lan-sync-title"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">Administrator attention</p>
          <h2 id="lan-sync-title">LAN synchronization unavailable</h2>
        </div>
        <span
          className={`status ${status.state === "starting" ? "warn" : "error"}`}
        >
          {status.state === "starting" ? "Starting" : "Action required"}
        </span>
      </div>
      <p className="form-help">
        Android devices cannot synchronize until the Hub’s secure TLS transport
        is available. Patient data remains local and protected while this is
        unresolved.
      </p>
      <p className="error" role="alert">
        {status.message}
      </p>
      {status.lastAttemptAt ? (
        <p className="muted">
          Last attempt: {new Date(status.lastAttemptAt).toLocaleString()}
        </p>
      ) : null}
      {canRecover ? (
        <button
          className="button primary"
          type="button"
          onClick={() => void retry()}
          disabled={isRetrying}
        >
          {isRetrying
            ? "Retrying secure LAN startup…"
            : "Retry secure LAN startup"}
        </button>
      ) : (
        <p className="form-help">
          Sign in with an Admin account that has device-management permission to
          retry after correcting the Hub TLS configuration.
        </p>
      )}
      <ErrorMessage message={error} />
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

      {security ? (
        <LanSyncRecoveryNotice
          status={security.lanSync}
          token={token}
          session={session}
          onStatusChange={(nextStatus) =>
            setSecurity((current) =>
              current ? { ...current, lanSync: nextStatus } : current,
            )
          }
        />
      ) : null}

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
