import {
  AuthService,
  ClinicalWorkflowService,
  EncounterService,
  MedicalHistoryService,
  PatientIdentityService,
} from "@elite/auth";
import { openDatabase, type EliteDatabase } from "@elite/database";
import { app, BrowserWindow, ipcMain, safeStorage, session } from "electron";
import { dirname, join } from "node:path";
import { ElectronSafeStorageKeyProvider } from "./key-provider.js";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);
let mainWindow: BrowserWindow | undefined;
let database: EliteDatabase | undefined;
let authService: AuthService | undefined;
let patientService: PatientIdentityService | undefined;
let medicalHistoryService: MedicalHistoryService | undefined;
let encounterService: EncounterService | undefined;
let clinicalService: ClinicalWorkflowService | undefined;
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

function registerIpc(): void {
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
  mainWindow = undefined;
  database?.close();
  database = undefined;
  patientService = undefined;
  medicalHistoryService = undefined;
  encounterService = undefined;
  clinicalService = undefined;
});
