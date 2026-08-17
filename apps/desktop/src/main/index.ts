import {
  AuthService,
  ClinicalWorkflowService,
  ExportGovernanceService,
  EncounterService,
  MedicalHistoryService,
  PatientExportService,
  PatientIdentityService,
  SynchronizationService,
  AndroidEnrollmentService,
  LanSessionService,
  LanSyncFrameRouter,
  exportSigningData,
  hashExportPayload,
  verifyExportPackage,
} from "@elite/auth";
import { openDatabase, type EliteDatabase } from "@elite/database";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
} from "electron";
import { dirname, join } from "node:path";
import { ElectronSafeStorageKeyProvider } from "./key-provider.js";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { LanSyncHttpServer } from "./lan-sync-server.js";
import {
  exportPackageSchema,
  patientExportInputSchema,
  signedExportManifestSchema,
  type ExportPackage,
  type PatientExportInput,
} from "@elite/contracts";
import { ElectronExportSigner } from "./export-signer.js";
import { renderPatientExportPdf } from "./export-pdf.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);
let mainWindow: BrowserWindow | undefined;
let database: EliteDatabase | undefined;
let authService: AuthService | undefined;
let patientService: PatientIdentityService | undefined;
let medicalHistoryService: MedicalHistoryService | undefined;
let encounterService: EncounterService | undefined;
let clinicalService: ClinicalWorkflowService | undefined;
let patientExportService: PatientExportService | undefined;
let exportGovernanceService: ExportGovernanceService | undefined;
let synchronizationService: SynchronizationService | undefined;
let androidEnrollmentService: AndroidEnrollmentService | undefined;
let lanSessionService: LanSessionService | undefined;
let lanSyncServer: LanSyncHttpServer | undefined;
let exportSigner: ElectronExportSigner | undefined;
let serviceError: string | undefined;

function initializeServices(): void {
  try {
    const filename = app.isPackaged
      ? join(app.getPath("userData"), "elite-clinic.db")
      : ":memory:";
    const options = app.isPackaged
      ? {
          filename,
          mode: "production" as const,
          keyProvider: new ElectronSafeStorageKeyProvider(
            safeStorage,
            join(app.getPath("userData"), "elite-clinic.db.key"),
          ),
        }
      : {
          filename,
          mode: "test" as const,
        };
    database = openDatabase(options);
    authService = new AuthService(database);
    patientService = new PatientIdentityService(database);
    medicalHistoryService = new MedicalHistoryService(database);
    encounterService = new EncounterService(database);
    clinicalService = new ClinicalWorkflowService(database);
    patientExportService = new PatientExportService(database);
    exportSigner = new ElectronExportSigner(
      safeStorage,
      join(app.getPath("userData"), "elite-export-signing-key.json"),
    );
    patientExportService.setSignaturePort(exportSigner);
    exportGovernanceService = new ExportGovernanceService(
      database,
      exportSigner,
    );
    synchronizationService = new SynchronizationService(database, exportSigner);
    androidEnrollmentService = new AndroidEnrollmentService(
      database,
      exportSigner,
    );
    lanSessionService = new LanSessionService(database, exportSigner);
  } catch {
    // Never expose database paths, encryption keys, or native-driver details.
    serviceError = app.isPackaged
      ? "Secure encrypted storage could not be initialized for this production build."
      : "Secure local services could not be initialized.";
  }
}

function registerContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDevelopment = !app.isPackaged;
    const connectSources = isDevelopment
      ? "'self' http://localhost:5173 ws://localhost:5173"
      : "'self'";
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      `connect-src ${connectSources}`,
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: "#f7f8fa",
    webPreferences: {
      preload: join(currentDirectory, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    const allowed =
      targetUrl.startsWith("http://localhost:5173") ||
      targetUrl.startsWith("file://");
    if (!allowed) {
      event.preventDefault();
    }
  });

  return window;
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const developmentUrl =
    process.env["ELITE_RENDERER_URL"] ?? "http://localhost:5173";
  if (!app.isPackaged) {
    await window.loadURL(developmentUrl);
    return;
  }
  await window.loadFile(join(currentDirectory, "../renderer/index.html"));
}

function requireAuthService(): AuthService {
  if (!authService) {
    throw new Error(
      "ELITE_AUTH_STORAGE_UNAVAILABLE: secure local services are unavailable",
    );
  }
  return authService;
}

function requirePatientService(): PatientIdentityService {
  if (!patientService) {
    throw new Error(
      "ELITE_PATIENT_STORAGE_UNAVAILABLE: secure patient services are unavailable",
    );
  }
  return patientService;
}

function requirePatientExportService(): PatientExportService {
  if (!patientExportService) {
    throw new Error(
      "ELITE_EXPORT_STORAGE_UNAVAILABLE: secure export services are unavailable",
    );
  }
  return patientExportService;
}

function requireExportGovernanceService(): ExportGovernanceService {
  if (!exportGovernanceService) {
    throw new Error(
      "ELITE_EXPORT_GOVERNANCE_UNAVAILABLE: export governance services are unavailable",
    );
  }
  return exportGovernanceService;
}
function requireSynchronizationService(): SynchronizationService {
  if (!synchronizationService) {
    throw new Error(
      "ELITE_SYNC_STORAGE_UNAVAILABLE: synchronization services are unavailable",
    );
  }
  return synchronizationService;
}
function requireAndroidEnrollmentService(): AndroidEnrollmentService {
  if (!androidEnrollmentService) {
    throw new Error(
      "ELITE_ENROLLMENT_STORAGE_UNAVAILABLE: Android enrollment services are unavailable",
    );
  }
  return androidEnrollmentService;
}
function requireExportSigner(): ElectronExportSigner {
  if (!exportSigner) {
    throw new Error(
      "ELITE_EXPORT_SIGNING_UNAVAILABLE: export signing services are unavailable",
    );
  }
  return exportSigner;
}

function registerIpc(): void {
  ipcMain.handle(
    "enrollment:challenge-create",
    (_event, token: string, input: unknown) =>
      requireAndroidEnrollmentService().createChallenge(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle("enrollment:request-submit", (_event, input: unknown) =>
    requireAndroidEnrollmentService().submitDeviceRequest(input as never),
  );
  ipcMain.handle(
    "enrollment:request-approve",
    (_event, token: string, requestId: string, offlineAccessDays?: number) =>
      requireAndroidEnrollmentService().approveDeviceRequest(
        serviceContext(token),
        requestId,
        offlineAccessDays,
      ),
  );
  ipcMain.handle("enrollment:acknowledge", (_event, input: unknown) =>
    requireAndroidEnrollmentService().acknowledgeEnrollment(input as never),
  );
  ipcMain.handle(
    "enrollment:revoke",
    (_event, token: string, enrollmentId: string, reason: string) =>
      requireAndroidEnrollmentService().revokeEnrollment(
        serviceContext(token),
        enrollmentId,
        reason,
      ),
  );
  ipcMain.handle(
    "enrollment:summary",
    (_event, token: string, enrollmentId: string) => {
      const context = serviceContext(token);
      if (context.role !== "admin") {
        throw new Error(
          "ELITE_ENROLLMENT_ADMIN_REQUIRED: administrator privileges are required",
        );
      }
      return requireAndroidEnrollmentService().getEnrollmentSummary(
        enrollmentId,
      );
    },
  );

  ipcMain.handle(
    "sync:device-register",
    (_event, token: string, input: unknown) =>
      requireSynchronizationService().registerDevice(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle(
    "sync:device-policy",
    (_event, token: string, deviceId: string) =>
      requireSynchronizationService().getDevicePolicy(
        serviceContext(token),
        deviceId,
      ),
  );
  ipcMain.handle("sync:capabilities", (_event, token: string, input: unknown) =>
    requireSynchronizationService().getCapabilities(
      serviceContext(token),
      input as never,
    ),
  );
  ipcMain.handle("sync:delta", (_event, token: string, input: unknown) =>
    requireSynchronizationService().getDelta(
      serviceContext(token),
      input as never,
    ),
  );
  ipcMain.handle("sync:outbox-queue", (_event, token: string, input: unknown) =>
    requireSynchronizationService().queueOutbox(
      serviceContext(token),
      input as never,
    ),
  );
  ipcMain.handle("sync:outbox-ack", (_event, token: string, input: unknown) =>
    requireSynchronizationService().recordOutboxAcknowledgment(
      serviceContext(token),
      input as never,
    ),
  );
  ipcMain.handle(
    "sync:outbox-list",
    (_event, token: string, deviceId: string) =>
      requireSynchronizationService().listPendingOutbox(
        serviceContext(token),
        deviceId,
      ),
  );

  ipcMain.handle("app:security-status", () => ({
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    databaseKeyProvider: app.isPackaged
      ? serviceError
        ? "unavailable"
        : "electron-safe-storage"
      : "test-in-memory",
    isPackaged: app.isPackaged,
    secureServicesReady: !serviceError,
    serviceError,
  }));

  ipcMain.handle("auth:status", () => {
    const service = requireAuthService();
    return service.bootstrapStatus();
  });

  ipcMain.handle("auth:bootstrap", async (_event, input: unknown) => {
    const service = requireAuthService();
    return service.bootstrapInitialAdmins(input as never);
  });

  ipcMain.handle("auth:login", async (_event, input: unknown) => {
    const service = requireAuthService();
    const sessionContext = await service.login(input as never);
    return {
      token: sessionContext.token,
      session: service.sessionSummary(sessionContext.token),
    };
  });

  ipcMain.handle("auth:session", (_event, token: string) => {
    return requireAuthService().sessionSummary(token);
  });

  ipcMain.handle("auth:logout", (_event, token: string) => {
    requireAuthService().logout(token);
  });

  ipcMain.handle("auth:devices", (_event, token: string) => {
    const service = requireAuthService();
    return service.listDevices(service.getSession(token));
  });

  ipcMain.handle("auth:enrollment-requests", (_event, token: string) => {
    const service = requireAuthService();
    return service.listEnrollmentRequests(service.getSession(token));
  });

  ipcMain.handle(
    "auth:device-request",
    (_event, token: string, input: unknown) => {
      const service = requireAuthService();
      return service.requestDeviceEnrollment(
        service.getSession(token),
        input as never,
      );
    },
  );

  ipcMain.handle(
    "auth:device-approve",
    (_event, token: string, requestId: string) => {
      const service = requireAuthService();
      service.approveDevice(service.getSession(token), requestId);
    },
  );

  ipcMain.handle(
    "auth:device-reject",
    (_event, token: string, requestId: string, reason: string) => {
      const service = requireAuthService();
      service.rejectDevice(service.getSession(token), requestId, reason);
    },
  );

  ipcMain.handle(
    "auth:device-revoke",
    (_event, token: string, deviceId: string, reason: string) => {
      const service = requireAuthService();
      service.revokeDevice(service.getSession(token), deviceId, reason);
    },
  );

  ipcMain.handle(
    "patient:search",
    (_event, token: string, filters: unknown) => {
      const service = requirePatientService();
      return service.searchPatients(serviceContext(token), filters as never);
    },
  );
  ipcMain.handle("patient:get", (_event, token: string, patientId: string) => {
    return requirePatientService().getPatient(serviceContext(token), patientId);
  });
  ipcMain.handle(
    "medical-history:list",
    (_event, token: string, patientId: string) =>
      requireMedicalHistoryService().list(serviceContext(token), patientId),
  );
  ipcMain.handle(
    "medical-history:create",
    (_event, token: string, patientId: string, input: unknown) =>
      requireMedicalHistoryService().create(
        serviceContext(token),
        patientId,
        input as never,
      ),
  );
  ipcMain.handle(
    "medical-history:update",
    (
      _event,
      token: string,
      patientId: string,
      entryId: string,
      input: unknown,
      expectedVersion: number,
    ) =>
      requireMedicalHistoryService().update(
        serviceContext(token),
        patientId,
        entryId,
        input as never,
        expectedVersion,
      ),
  );
  ipcMain.handle(
    "medical-history:archive",
    (
      _event,
      token: string,
      patientId: string,
      entryId: string,
      expectedVersion: number,
      reason: string,
    ) =>
      requireMedicalHistoryService().archive(
        serviceContext(token),
        patientId,
        entryId,
        expectedVersion,
        reason,
      ),
  );
  ipcMain.handle(
    "patient:duplicates",
    (_event, token: string, input: unknown, excludePatientId?: string) => {
      return requirePatientService().findDuplicateCandidates(
        serviceContext(token),
        input as never,
        excludePatientId,
      );
    },
  );
  ipcMain.handle(
    "patient:create",
    (_event, token: string, input: unknown, decisionReason?: string) => {
      return requirePatientService().registerPatient(
        serviceContext(token),
        input as never,
        decisionReason,
      );
    },
  );
  ipcMain.handle(
    "related-person:create",
    (_event, token: string, input: unknown) => {
      return requirePatientService().createRelatedPerson(
        serviceContext(token),
        input as never,
      );
    },
  );
  ipcMain.handle(
    "related-person:list",
    (_event, token: string, patientId: string) => {
      return requirePatientService().listRelatedPersons(
        serviceContext(token),
        patientId,
      );
    },
  );
  ipcMain.handle(
    "related-person:update",
    (
      _event,
      token: string,
      relatedPersonId: string,
      input: unknown,
      expectedVersion: number,
    ) => {
      return requirePatientService().updateRelatedPerson(
        serviceContext(token),
        relatedPersonId,
        input as never,
        expectedVersion,
      );
    },
  );
  ipcMain.handle(
    "patient:related-links",
    (_event, token: string, patientId: string) => {
      return requirePatientService().listPatientRelatedLinks(
        serviceContext(token),
        patientId,
      );
    },
  );
  ipcMain.handle(
    "patient:related-link",
    (
      _event,
      token: string,
      patientId: string,
      relatedPersonId: string,
      input: unknown,
    ) => {
      return requirePatientService().linkRelatedPerson(
        serviceContext(token),
        patientId,
        relatedPersonId,
        input as never,
      );
    },
  );
  ipcMain.handle(
    "patient:related-link-update",
    (
      _event,
      token: string,
      patientId: string,
      relatedPersonId: string,
      input: unknown,
    ) => {
      return requirePatientService().updatePatientRelatedLink(
        serviceContext(token),
        patientId,
        relatedPersonId,
        input as never,
      );
    },
  );
  ipcMain.handle(
    "patient:related-link-unlink",
    (
      _event,
      token: string,
      patientId: string,
      relatedPersonId: string,
      reason: string,
    ) => {
      requirePatientService().unlinkRelatedPerson(
        serviceContext(token),
        patientId,
        relatedPersonId,
        reason,
      );
    },
  );
  ipcMain.handle(
    "patient:update",
    (
      _event,
      token: string,
      patientId: string,
      input: unknown,
      expectedVersion: number,
      decisionReason?: string,
    ) => {
      return requirePatientService().updatePatient(
        serviceContext(token),
        patientId,
        input as never,
        expectedVersion,
        decisionReason,
      );
    },
  );
  ipcMain.handle(
    "patient:archive",
    (_event, token: string, patientId: string, reason: string) => {
      requirePatientService().archivePatient(serviceContext(token), {
        patientId,
        reason,
      });
    },
  );
  ipcMain.handle(
    "patient:unarchive",
    (_event, token: string, patientId: string, reason: string) => {
      requirePatientService().unarchivePatient(
        serviceContext(token),
        patientId,
        reason,
      );
    },
  );
  ipcMain.handle(
    "patient:merge-request",
    (_event, token: string, input: unknown) => {
      return requirePatientService().requestMerge(
        serviceContext(token),
        input as never,
      );
    },
  );
  ipcMain.handle("patient:merge-list", (_event, token: string) => {
    return requirePatientService().listMergeCases(serviceContext(token));
  });
  ipcMain.handle(
    "patient:merge-review",
    (
      _event,
      token: string,
      caseId: string,
      decision: "approve" | "reject",
      reason: string,
      fieldDecisions: unknown,
    ) => {
      return requirePatientService().reviewMergeCase(
        serviceContext(token),
        caseId,
        decision,
        reason,
        fieldDecisions,
      );
    },
  );
  ipcMain.handle(
    "patient:merge-execute",
    (_event, token: string, caseId: string) => {
      return requirePatientService().executeMerge(
        serviceContext(token),
        caseId,
      );
    },
  );
  ipcMain.handle("clinical:icd10", (_event, token: string) =>
    requireEncounterService().listIcd10Codes(serviceContext(token)),
  );
  ipcMain.handle(
    "clinical:icd10-create",
    (_event, token: string, input: unknown) =>
      requireEncounterService().createIcd10Code(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle(
    "clinical:encounter-by-appointment",
    (_event, token: string, appointmentId: string) =>
      requireEncounterService().getEncounterForAppointment(
        serviceContext(token),
        appointmentId,
      ),
  );
  ipcMain.handle(
    "clinical:encounter-effective-by-appointment",
    (_event, token: string, appointmentId: string) =>
      requireEncounterService().getEffectiveEncounterForAppointment(
        serviceContext(token),
        appointmentId,
      ),
  );
  ipcMain.handle(
    "clinical:encounter-create",
    (_event, token: string, appointmentId: string, input: unknown) =>
      requireEncounterService().createEncounter(
        serviceContext(token),
        appointmentId,
        input as never,
      ),
  );
  ipcMain.handle(
    "clinical:encounter-update",
    (
      _event,
      token: string,
      encounterId: string,
      input: unknown,
      expectedVersion: number,
    ) =>
      requireEncounterService().updateEncounter(
        serviceContext(token),
        encounterId,
        input as never,
        expectedVersion,
      ),
  );
  ipcMain.handle(
    "clinical:encounter-sign",
    (_event, token: string, encounterId: string, expectedVersion: number) =>
      requireEncounterService().signEncounter(
        serviceContext(token),
        encounterId,
        expectedVersion,
      ),
  );
  ipcMain.handle(
    "clinical:amendment-diffs",
    (_event, token: string, encounterId: string) =>
      requireEncounterService().listAmendmentDiffs(
        serviceContext(token),
        encounterId,
      ),
  );
  ipcMain.handle(
    "clinical:projection-snapshot-create",
    (_event, token: string, encounterId: string, input: unknown) =>
      requireEncounterService().createProjectionSnapshot(
        serviceContext(token),
        encounterId,
        input as never,
      ),
  );
  ipcMain.handle(
    "clinical:projection-snapshots",
    (_event, token: string, encounterId: string) =>
      requireEncounterService().listProjectionSnapshots(
        serviceContext(token),
        encounterId,
      ),
  );
  ipcMain.handle(
    "export:create",
    async (_event, token: string, input: unknown) => {
      const parsed = patientExportInputSchema.parse(
        input,
      ) as PatientExportInput;
      const service = requirePatientExportService();
      const payload = service.buildPayload(serviceContext(token), parsed);
      const payloadBuffer =
        parsed.format === "fhir"
          ? service.buildFhirBundle(serviceContext(token), parsed)
          : await renderPatientExportPdf(payload);
      const payloadHash = hashExportPayload(payloadBuffer);
      const packageId = randomUUID();
      const createdAt = new Date().toISOString();
      const signer = requireExportSigner();
      const activeSignerKey = signer.getActiveKeyMetadata?.();
      const unsignedManifest = signedExportManifestSchema.parse({
        schemaVersion: 1,
        packageId,
        snapshotId: parsed.snapshotId,
        snapshotPayloadHash: payload.snapshotPayloadHash,
        payloadHash,
        signatureAlgorithm: "ed25519",
        signerKeyId: activeSignerKey?.keyId,
        signerKeyVersion: activeSignerKey?.keyVersion,
        publicKeyPem: "placeholder-public-key-".padEnd(64, "-"),
        signatureBase64: "placeholder-signature".padEnd(16, "-"),
        format: parsed.format,
        redactionPolicy: parsed.redactionPolicy,
        exportReason: parsed.exportReason,
        createdAt,
        createdByUserId: serviceContext(token).userId,
      });
      const signature = signer.sign(exportSigningData(unsignedManifest));
      const manifest = signedExportManifestSchema.parse({
        ...unsignedManifest,
        signerKeyId: signature.keyId ?? unsignedManifest.signerKeyId,
        signerKeyVersion:
          signature.keyVersion ?? unsignedManifest.signerKeyVersion,
        publicKeyPem: signature.publicKeyPem,
        signatureBase64: signature.signature.toString("base64"),
      });
      const packageData = exportPackageSchema.parse({
        manifest,
        payloadBase64: payloadBuffer.toString("base64"),
        payloadFileName:
          parsed.format === "fhir"
            ? `elite-patient-${payload.patientId}.fhir.json`
            : `elite-patient-${payload.patientId}.pdf`,
        manifestFileName: `elite-patient-${payload.patientId}.manifest.json`,
        signatureFileName: `elite-patient-${payload.patientId}.sig`,
      });
      if (!mainWindow)
        throw new Error(
          "ELITE_EXPORT_WINDOW_UNAVAILABLE: export window is unavailable",
        );
      const selected = await dialog.showSaveDialog(mainWindow, {
        title: "Save signed patient record export",
        defaultPath: join(
          app.getPath("documents"),
          packageData.payloadFileName,
        ),
        buttonLabel: "Save export package",
      });
      if (selected.canceled || !selected.filePath) {
        throw new Error("ELITE_EXPORT_CANCELLED: export save was cancelled");
      }
      const basePath = selected.filePath.replace(/\.(pdf|json)$/i, "");
      const payloadPath = `${basePath}.${parsed.format === "fhir" ? "fhir.json" : "pdf"}`;
      const manifestPath = `${basePath}.manifest.json`;
      const signaturePath = `${basePath}.sig`;
      const manifestBytes = Buffer.from(
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
      const signatureBytes = Buffer.from(
        `${manifest.signatureBase64}\n`,
        "utf8",
      );
      writeFileSync(payloadPath, payloadBuffer, { mode: 0o600 });
      writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
      writeFileSync(signaturePath, signatureBytes, { mode: 0o600 });
      const registryRecord = service.registerExportPackage(
        serviceContext(token),
        {
          packageId: manifest.packageId,
          packageType: "detached",
          snapshotId: manifest.snapshotId,
          patientId: payload.patientId,
          format: manifest.format,
          redactionPolicy: manifest.redactionPolicy,
          exportReason: manifest.exportReason,
          createdAt: manifest.createdAt,
          createdByUserId: manifest.createdByUserId,
          expiresAt: manifest.expiresAt ?? null,
          packageHash: hashExportPayload(
            Buffer.concat([payloadBuffer, manifestBytes, signatureBytes]),
          ),
          payloadHash: manifest.payloadHash,
          manifestHash: hashExportPayload(manifestBytes),
          signerKeyId:
            manifest.signerKeyId ??
            `esk-${hashExportPayload(Buffer.from(manifest.publicKeyPem)).slice(0, 24)}`,
          signerKeyVersion: manifest.signerKeyVersion ?? 1,
          payloadPath,
          manifestPath,
          signaturePath,
        },
      );
      return {
        package: packageData,
        savedFiles: { payloadPath, manifestPath, signaturePath },
        registryRecord,
      };
    },
  );
  ipcMain.handle("export:verify", (_event, input: unknown) =>
    verifyExportPackage(input as never),
  );
  ipcMain.handle(
    "export:create-zip",
    async (_event, token: string, input: unknown) => {
      const parsed = patientExportInputSchema.parse(
        input,
      ) as PatientExportInput;
      const context = serviceContext(token);
      const service = requirePatientExportService();
      const payload = service.buildPayload(context, parsed);
      const payloadBuffer =
        parsed.format === "fhir"
          ? service.buildFhirBundle(context, parsed)
          : await renderPatientExportPdf(payload);
      const built = service.buildZipPackage(context, parsed, payloadBuffer);
      if (!mainWindow)
        throw new Error(
          "ELITE_EXPORT_WINDOW_UNAVAILABLE: export window is unavailable",
        );
      const selected = await dialog.showSaveDialog(mainWindow, {
        title: "Save signed ZIP patient record export",
        defaultPath: join(
          app.getPath("documents"),
          built.package.archiveFileName,
        ),
        buttonLabel: "Save ZIP export",
        filters: [{ name: "Signed ZIP export", extensions: ["zip"] }],
      });
      if (selected.canceled || !selected.filePath)
        throw new Error("ELITE_EXPORT_CANCELLED: export save was cancelled");
      writeFileSync(selected.filePath, built.archive, { mode: 0o600 });
      const savedPackage = { ...built.package, archivePath: selected.filePath };
      const manifestBytes = Buffer.from(
        `${JSON.stringify(built.package.manifest, null, 2)}\n`,
        "utf8",
      );
      const registryRecord = service.registerExportPackage(context, {
        packageId: built.package.manifest.packageId,
        packageType: "zip",
        snapshotId: built.package.manifest.snapshotId,
        patientId: payload.patientId,
        format: built.package.manifest.format,
        redactionPolicy: built.package.manifest.redactionPolicy,
        exportReason: built.package.manifest.exportReason,
        createdAt: built.package.manifest.createdAt,
        createdByUserId: built.package.manifest.createdByUserId,
        expiresAt: built.package.manifest.expiresAt ?? null,
        packageHash: hashExportPayload(built.archive),
        payloadHash: built.package.manifest.payloadHash,
        manifestHash: hashExportPayload(manifestBytes),
        signerKeyId:
          built.package.manifest.signerKeyId ??
          `esk-${hashExportPayload(Buffer.from(built.package.manifest.publicKeyPem)).slice(0, 24)}`,
        signerKeyVersion: built.package.manifest.signerKeyVersion ?? 1,
        archiveFileName: built.package.archiveFileName,
        archivePath: selected.filePath,
        fhirProfileBundleId: built.package.manifest.fhirProfileBundleId,
      });
      return {
        package: savedPackage,
        savedArchivePath: selected.filePath,
        fhirValidation: built.package.manifest.fhirValidation,
        verification: service.verifyZipPackage(built.archive),
        registryRecord,
      };
    },
  );
  ipcMain.handle("export:verify-zip", (_event, archiveBase64: string) =>
    requirePatientExportService().verifyZipPackage(
      Buffer.from(archiveBase64, "base64"),
    ),
  );
  ipcMain.handle(
    "export:fhir-validate",
    (_event, token: string, input: unknown) => {
      try {
        const parsed = patientExportInputSchema.parse({
          ...(input as Record<string, unknown>),
          format: "fhir",
        }) as PatientExportInput;
        const context = serviceContext(token);
        const payload = requirePatientExportService().buildFhirBundle(
          context,
          parsed,
        );
        return requirePatientExportService().validateFhirBundle(
          JSON.parse(payload.toString("utf8")),
        );
      } catch (error) {
        return {
          valid: false,
          fhirVersion: "R4",
          validatorVersion: "elite-fhir-r4-1",
          profileIds: [],
          issues: [
            {
              severity: "error",
              path: "$",
              code: "validation-failed",
              message:
                error instanceof Error
                  ? error.message
                  : "FHIR validation failed",
            },
          ],
        };
      }
    },
  );
  ipcMain.handle(
    "export:revoke",
    (_event, token: string, packageId: string, reason: string) =>
      requirePatientExportService().revokeExport(
        serviceContext(token),
        packageId,
        reason,
      ),
  );
  ipcMain.handle("export:revocations", (_event, token: string) =>
    requirePatientExportService().listRevocations(serviceContext(token)),
  );
  ipcMain.handle("export:registry", (_event, token: string, input: unknown) =>
    requirePatientExportService().listExportPackages(
      serviceContext(token),
      input as never,
    ),
  );
  ipcMain.handle("export:lifecycle", (_event, token: string, input: unknown) =>
    requirePatientExportService().transitionExportPackage(
      serviceContext(token),
      input as never,
    ),
  );
  ipcMain.handle(
    "export:lifecycle-events",
    (_event, token: string, packageId: string) =>
      requirePatientExportService().listExportPackageLifecycle(
        serviceContext(token),
        packageId,
      ),
  );
  ipcMain.handle("export:key-list", (_event, token: string) =>
    requirePatientExportService().listSigningKeys(serviceContext(token)),
  );
  ipcMain.handle("export:key-rotate", (_event, token: string, reason: string) =>
    requirePatientExportService().rotateSigningKey(
      serviceContext(token),
      reason,
    ),
  );
  ipcMain.handle(
    "export:key-recovery-export",
    (_event, token: string, passphrase: string) =>
      requirePatientExportService().exportSigningKeyRecoveryBundle(
        serviceContext(token),
        passphrase,
      ),
  );
  ipcMain.handle(
    "export:key-recovery-import",
    (_event, token: string, bundle: unknown, passphrase: string) =>
      requirePatientExportService().restoreSigningKeyRecoveryBundle(
        serviceContext(token),
        bundle as never,
        passphrase,
      ),
  );
  ipcMain.handle(
    "export:recipient-create",
    (_event, token: string, input: unknown) =>
      requireExportGovernanceService().createRecipient(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle("export:recipients", (_event, token: string) =>
    requireExportGovernanceService().listRecipients(serviceContext(token)),
  );
  ipcMain.handle(
    "export:recipient-verify",
    (
      _event,
      token: string,
      recipientId: string,
      status: "verified" | "rejected",
      reason: string,
    ) =>
      requireExportGovernanceService().verifyRecipient(
        serviceContext(token),
        recipientId,
        status,
        reason,
      ),
  );
  ipcMain.handle(
    "export:evidence-create",
    (_event, token: string, input: unknown) =>
      requireExportGovernanceService().recordConsentEvidence(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle(
    "export:evidence-list",
    (_event, token: string, patientId?: string) =>
      requireExportGovernanceService().listConsentEvidence(
        serviceContext(token),
        patientId,
      ),
  );
  ipcMain.handle(
    "export:evidence-review",
    (
      _event,
      token: string,
      evidenceId: string,
      decision: "approve" | "reject",
      reason: string,
    ) =>
      requireExportGovernanceService().reviewConsentEvidence(
        serviceContext(token),
        evidenceId,
        decision,
        reason,
      ),
  );
  ipcMain.handle(
    "export:disclosure-request",
    (_event, token: string, input: unknown) =>
      requireExportGovernanceService().requestDisclosure(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle("export:disclosures", (_event, token: string) =>
    requireExportGovernanceService().listDisclosures(serviceContext(token)),
  );
  ipcMain.handle(
    "export:disclosure-decision",
    (_event, token: string, input: unknown) =>
      requireExportGovernanceService().decideDisclosure(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle(
    "export:disclosure-send",
    (_event, token: string, disclosureId: string, reason: string) =>
      requireExportGovernanceService().sendDisclosure(
        serviceContext(token),
        disclosureId,
        reason,
      ),
  );
  ipcMain.handle(
    "export:receipt-issue",
    (_event, token: string, disclosureId: string) =>
      requireExportGovernanceService().issueReceipt(
        serviceContext(token),
        disclosureId,
      ),
  );
  ipcMain.handle(
    "export:receipt-acknowledge",
    (_event, token: string, receiptId: string, reason: string) =>
      requireExportGovernanceService().acknowledgeReceipt(
        serviceContext(token),
        receiptId,
        reason,
      ),
  );
  ipcMain.handle("export:receipts", (_event, token: string) =>
    requireExportGovernanceService().listReceipts(serviceContext(token)),
  );
  ipcMain.handle("settings:org-get", (_event, token: string) =>
    requirePatientExportService().getOrgSettings(serviceContext(token)),
  );
  ipcMain.handle(
    "settings:org-update",
    (_event, token: string, input: unknown) =>
      requirePatientExportService().updateOrgSettings(
        serviceContext(token),
        input as never,
      ),
  );

  ipcMain.handle("settings:fhir-profiles", (_event, token: string) =>
    requirePatientExportService().listFhirProfileBundles(serviceContext(token)),
  );
  ipcMain.handle(
    "settings:fhir-profile-install",
    (_event, token: string, input: unknown) =>
      requirePatientExportService().installFhirProfileBundle(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle(
    "clinical:amendments",
    (_event, token: string, encounterId: string) =>
      requireEncounterService().listAmendments(
        serviceContext(token),
        encounterId,
      ),
  );
  ipcMain.handle(
    "clinical:amendment-create",
    (_event, token: string, encounterId: string, input: unknown) =>
      requireEncounterService().createAmendment(
        serviceContext(token),
        encounterId,
        input as never,
      ),
  );
  ipcMain.handle(
    "clinical:amendment-review",
    (
      _event,
      token: string,
      amendmentId: string,
      decision: "approved" | "rejected",
      reason: string,
      expectedVersion: number,
    ) =>
      requireEncounterService().reviewAmendment(
        serviceContext(token),
        amendmentId,
        decision,
        reason,
        expectedVersion,
      ),
  );
  ipcMain.handle(
    "clinical:amendment-resolve",
    (
      _event,
      token: string,
      amendmentId: string,
      resolution: "rebase" | "reject",
      reason: string,
      expectedVersion: number,
    ) =>
      requireEncounterService().resolveAmendmentConflict(
        serviceContext(token),
        amendmentId,
        resolution,
        reason,
        expectedVersion,
      ),
  );
  ipcMain.handle(
    "clinical:amendment-apply",
    (_event, token: string, amendmentId: string, expectedVersion: number) =>
      requireEncounterService().applyAmendment(
        serviceContext(token),
        amendmentId,
        expectedVersion,
      ),
  );
  ipcMain.handle(
    "clinical:diagnoses",
    (_event, token: string, encounterId: string) =>
      requireEncounterService().listDiagnoses(
        serviceContext(token),
        encounterId,
      ),
  );
  ipcMain.handle(
    "clinical:diagnosis-create",
    (_event, token: string, encounterId: string, input: unknown) =>
      requireEncounterService().createDiagnosis(
        serviceContext(token),
        encounterId,
        input as never,
      ),
  );
  ipcMain.handle(
    "clinical:diagnosis-approve",
    (
      _event,
      token: string,
      diagnosisId: string,
      decision: "approved" | "rejected",
      reason: string,
      expectedVersion: number,
    ) =>
      requireEncounterService().approveDiagnosis(
        serviceContext(token),
        diagnosisId,
        decision,
        reason,
        expectedVersion,
      ),
  );
  ipcMain.handle("clinical:specialties", (_event, token: string) =>
    requireClinicalService().listSpecialties(serviceContext(token)),
  );
  ipcMain.handle(
    "clinical:specialty-create",
    (_event, token: string, input: unknown) =>
      requireClinicalService().createSpecialty(serviceContext(token), input),
  );
  ipcMain.handle(
    "clinical:specialty-archive",
    (_event, token: string, id: string, reason: string) =>
      requireClinicalService().archiveSpecialty(
        serviceContext(token),
        id,
        reason,
      ),
  );
  ipcMain.handle("clinical:departments", (_event, token: string) =>
    requireClinicalService().listDepartments(serviceContext(token)),
  );
  ipcMain.handle(
    "clinical:department-create",
    (_event, token: string, input: unknown) =>
      requireClinicalService().createDepartment(serviceContext(token), input),
  );
  ipcMain.handle("clinical:services", (_event, token: string) =>
    requireClinicalService().listServices(serviceContext(token)),
  );
  ipcMain.handle("clinical:doctors", (_event, token: string) =>
    requireClinicalService().listDoctors(serviceContext(token)),
  );
  ipcMain.handle(
    "clinical:service-create",
    (_event, token: string, input: unknown) =>
      requireClinicalService().createService(serviceContext(token), input),
  );
  ipcMain.handle("clinical:schedules", (_event, token: string) =>
    requireClinicalService().listSchedules(serviceContext(token)),
  );
  ipcMain.handle("clinical:exceptions", (_event, token: string) =>
    requireClinicalService().listScheduleExceptions(serviceContext(token)),
  );
  ipcMain.handle(
    "clinical:schedule-create",
    (_event, token: string, input: unknown) =>
      requireClinicalService().createSchedule(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle(
    "clinical:schedule-delete",
    (_event, token: string, id: string, reason: string) =>
      requireClinicalService().deleteSchedule(
        serviceContext(token),
        id,
        reason,
      ),
  );
  ipcMain.handle(
    "clinical:exception-create",
    (_event, token: string, input: unknown) =>
      requireClinicalService().createScheduleException(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle(
    "clinical:exception-delete",
    (_event, token: string, id: string, reason: string) =>
      requireClinicalService().deleteScheduleException(
        serviceContext(token),
        id,
        reason,
      ),
  );
  ipcMain.handle(
    "clinical:appointments",
    (_event, token: string, from?: string, to?: string, doctorId?: string) =>
      requireClinicalService().listAppointments(
        serviceContext(token),
        from,
        to,
        doctorId,
      ),
  );
  ipcMain.handle(
    "clinical:appointment-create",
    (_event, token: string, input: unknown) =>
      requireClinicalService().createAppointment(
        serviceContext(token),
        input as never,
      ),
  );
  ipcMain.handle(
    "clinical:appointment-status",
    (_event, token: string, id: string, input: unknown) =>
      requireClinicalService().updateAppointmentStatus(
        serviceContext(token),
        id,
        input as never,
      ),
  );
}
function requireMedicalHistoryService(): MedicalHistoryService {
  if (!medicalHistoryService)
    throw new Error("Medical history service unavailable");
  return medicalHistoryService;
}
function requireEncounterService(): EncounterService {
  if (!encounterService) throw new Error("Encounter service unavailable");
  return encounterService;
}
function requireClinicalService(): ClinicalWorkflowService {
  if (!clinicalService)
    throw new Error("Clinical workflow service unavailable");
  return clinicalService;
}
function serviceContext(token: string) {
  return requireAuthService().getSession(token);
}

app.whenReady().then(async () => {
  registerContentSecurityPolicy();
  initializeServices();
  if (synchronizationService) {
    lanSyncServer = new LanSyncHttpServer(
      new LanSyncFrameRouter(synchronizationService),
      lanSessionService,
    );
    void lanSyncServer.start().catch(() => {
      lanSyncServer = undefined;
    });
  }
  registerIpc();
  mainWindow = createWindow();
  await loadRenderer(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      void loadRenderer(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void lanSyncServer?.stop();
  lanSyncServer = undefined;
  mainWindow = undefined;
  database?.close();
  database = undefined;
  patientService = undefined;
  medicalHistoryService = undefined;
  encounterService = undefined;
  clinicalService = undefined;
  patientExportService = undefined;
  exportGovernanceService = undefined;
  synchronizationService = undefined;
  androidEnrollmentService = undefined;
  lanSessionService = undefined;
  exportSigner = undefined;
});
