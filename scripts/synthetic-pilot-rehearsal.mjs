import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../packages/database/dist/index.js";
import { roleCapabilities } from "../packages/contracts/dist/index.js";
import {
  BillingService,
  ClinicalWorkflowService,
  DoctorProfileService,
  EncounterService,
  PatientIdentityService,
} from "../packages/auth/dist/index.js";

const BASE_TIME = "2030-07-18T08:00:00.000Z";
const ORGANIZATION_ID = "elite-clinic-cairo-synthetic";
const ANDROID_SCOPES = [
  "appointments",
  "patient-summary",
  "encounter-summary",
  "clinical-notes",
  "export-governance",
  "billing-summary",
];
const FIXED_IDS = {
  adminPrimary: "pilot-admin-primary",
  adminBackup: "pilot-admin-backup",
  doctorPrimary: "pilot-doctor-primary",
  doctorApprover: "pilot-doctor-approver",
  nurse: "pilot-nurse",
  receptionist: "pilot-receptionist",
  hubDevice: "pilot-hub-device",
  androidDevice: "pilot-android-device",
  syncDevice: "pilot-sync-device",
};

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function makeContext(userId, username, role, deviceId = FIXED_IDS.hubDevice) {
  return {
    sessionId: `pilot-session-${userId}`,
    token: `pilot-token-${userId}`,
    userId,
    username,
    role,
    deviceId,
    capabilities: roleCapabilities[role],
    expiresAt: "2030-07-19T08:00:00.000Z",
  };
}

function insertUser(database, input) {
  database.raw
    .prepare(
      `INSERT INTO users
       (id, username, display_name_en, display_name_ar, role, capabilities_json, is_clinical_approver, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      input.id,
      input.username,
      input.displayNameEn,
      input.displayNameAr ?? null,
      input.role,
      JSON.stringify(roleCapabilities[input.role]),
      input.isClinicalApprover ? 1 : 0,
      BASE_TIME,
      BASE_TIME,
    );
}

function seedUsersAndDevices(database) {
  insertUser(database, {
    id: FIXED_IDS.adminPrimary,
    username: "pilot.admin.primary",
    displayNameEn: "Synthetic Admin Primary",
    displayNameAr: "مدير تجريبي أول",
    role: "admin",
    isClinicalApprover: true,
  });
  insertUser(database, {
    id: FIXED_IDS.adminBackup,
    username: "pilot.admin.backup",
    displayNameEn: "Synthetic Admin Backup",
    displayNameAr: "مدير تجريبي احتياطي",
    role: "admin",
    isClinicalApprover: true,
  });
  insertUser(database, {
    id: FIXED_IDS.doctorPrimary,
    username: "pilot.doctor.primary",
    displayNameEn: "Synthetic Dr. Salma Nabil",
    displayNameAr: "د. سلمى نبيل التجريبية",
    role: "doctor",
    isClinicalApprover: true,
  });
  insertUser(database, {
    id: FIXED_IDS.doctorApprover,
    username: "pilot.doctor.approver",
    displayNameEn: "Synthetic Dr. Omar Adel",
    displayNameAr: "د. عمر عادل التجريبي",
    role: "doctor",
    isClinicalApprover: true,
  });
  insertUser(database, {
    id: FIXED_IDS.nurse,
    username: "pilot.nurse",
    displayNameEn: "Synthetic Nurse Huda",
    displayNameAr: "الممرضة هدى التجريبية",
    role: "nurse",
    isClinicalApprover: false,
  });
  insertUser(database, {
    id: FIXED_IDS.receptionist,
    username: "pilot.receptionist",
    displayNameEn: "Synthetic Receptionist Mona",
    displayNameAr: "موظفة الاستقبال منى التجريبية",
    role: "receptionist",
    isClinicalApprover: false,
  });

  database.raw
    .prepare(
      `INSERT INTO devices
       (id, friendly_name, platform, app_version, api_level, owner_user_id, status, approved_by_user_id, approved_at, created_at, updated_at)
       VALUES (?, ?, 'windows', '0.1.0-pilot', NULL, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(
      FIXED_IDS.hubDevice,
      "Synthetic Cairo Hub",
      FIXED_IDS.adminPrimary,
      FIXED_IDS.adminPrimary,
      BASE_TIME,
      BASE_TIME,
      BASE_TIME,
    );
  database.raw
    .prepare(
      `INSERT INTO devices
       (id, friendly_name, platform, app_version, api_level, owner_user_id, status, approved_by_user_id, approved_at, created_at, updated_at)
       VALUES (?, ?, 'android', '0.1.0-pilot', 35, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(
      FIXED_IDS.androidDevice,
      "Synthetic Android Device",
      FIXED_IDS.adminPrimary,
      FIXED_IDS.adminPrimary,
      BASE_TIME,
      BASE_TIME,
      BASE_TIME,
    );
}

class FileVault {
  constructor(root) {
    this.root = root;
  }

  write(relativePath, content) {
    const path = join(this.root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  read(relativePath) {
    return readFileSync(join(this.root, relativePath));
  }

  remove(relativePath) {
    rmSync(join(this.root, relativePath), { force: true });
  }
}

function countRows(database, table) {
  const row = database.raw
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get();
  return Number(row.count);
}

function insertSyncEvidence(
  database,
  adminContext,
  patientId,
  appointmentId,
  invoiceId,
) {
  const timestamp = "2030-07-18T12:00:00.000Z";
  database.raw
    .prepare(
      `INSERT INTO sync_devices
       (id, device_id, enrollment_id, organization_id, owner_user_id, policy_version, state, allowed_scopes_json, patient_scope_json, last_seen_at, last_sync_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      FIXED_IDS.syncDevice,
      FIXED_IDS.androidDevice,
      "pilot-enrollment-001",
      ORGANIZATION_ID,
      adminContext.userId,
      JSON.stringify(ANDROID_SCOPES),
      JSON.stringify({ patientIds: [patientId] }),
      timestamp,
      timestamp,
      timestamp,
      timestamp,
    );

  const payloads = [
    ["appointments", "appointment", appointmentId, { status: "completed" }],
    ["patient-summary", "patient", patientId, { patientId }],
    ["encounter-summary", "encounter", "pilot-encounter", { status: "signed" }],
    ["clinical-notes", "encounter", "pilot-encounter", { diagnosis: "J06.9" }],
    ["export-governance", "export", "pilot-export", { status: "verified" }],
    ["billing-summary", "invoice", invoiceId, { status: "partially-paid" }],
  ];
  for (const [
    index,
    [scope, resourceType, resourceId, payload],
  ] of payloads.entries()) {
    const payloadJson = JSON.stringify(payload);
    database.raw
      .prepare(
        `INSERT INTO sync_cursors
         (id, sync_device_id, scope, cursor, server_sequence, accepted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `pilot-cursor-${index}`,
        FIXED_IDS.syncDevice,
        scope,
        `cursor-${index + 1}`,
        index + 1,
        timestamp,
      );
    database.raw
      .prepare(
        `INSERT INTO sync_resource_versions
         (id, sync_device_id, scope, resource_type, resource_id, version, payload_hash, last_updated_at, redacted)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0)`,
      )
      .run(
        `pilot-resource-${index}`,
        FIXED_IDS.syncDevice,
        scope,
        resourceType,
        resourceId,
        sha256Text(payloadJson),
        timestamp,
      );
  }

  const auditId = "pilot-audit-sync-billing";
  database.raw
    .prepare(
      `INSERT INTO audit_events
       (id, actor_user_id, device_id, action, entity_type, entity_id, result, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?)`,
    )
    .run(
      auditId,
      adminContext.userId,
      FIXED_IDS.androidDevice,
      "sync.billing-summary",
      "billing",
      invoiceId,
      JSON.stringify({ syntheticOnly: true, changeCount: 1 }),
      timestamp,
    );
  database.raw
    .prepare(
      `INSERT INTO sync_audit_events
       (id, sync_device_id, sync_session_id, user_id, scope, result, change_count, conflict_count, redaction_count, reason_code, occurred_at, audit_event_id)
       VALUES (?, ?, ?, ?, 'billing-summary', 'success', 1, 0, 0, ?, ?, ?)`,
    )
    .run(
      "pilot-sync-audit-billing",
      FIXED_IDS.syncDevice,
      "pilot-sync-session",
      adminContext.userId,
      "SYNTHETIC_PILOT_SYNC",
      timestamp,
      auditId,
    );

  const pendingPayload = JSON.stringify({ appointmentId, action: "arrival" });
  database.raw
    .prepare(
      `INSERT INTO sync_outbox
       (id, operation_id, sync_device_id, user_id, organization_id, scope, operation, resource_type, resource_id, base_version, payload_json, payload_hash, reason, state, attempt_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'appointments', 'appointment-arrival', 'appointment', ?, 1, ?, ?, ?, 'pending', 0, ?, ?)`,
    )
    .run(
      "pilot-outbox-arrival",
      "pilot-operation-arrival",
      FIXED_IDS.syncDevice,
      adminContext.userId,
      ORGANIZATION_ID,
      appointmentId,
      pendingPayload,
      sha256Text(pendingPayload),
      "Synthetic offline arrival queued during LAN outage",
      timestamp,
      timestamp,
    );

  database.raw
    .prepare(
      `INSERT INTO clinical_sync_conflicts
       (id, sync_device_id, operation_id, resource_type, resource_id, client_base_version, server_version, conflict_type, resolution, created_at)
       VALUES (?, ?, ?, 'appointment', ?, 1, 2, 'version-mismatch', 'refresh', ?)`,
    )
    .run(
      "pilot-sync-conflict",
      FIXED_IDS.syncDevice,
      "pilot-operation-arrival",
      appointmentId,
      timestamp,
    );
}

function snapshot(database, ids) {
  const tables = [
    "users",
    "devices",
    "patients",
    "patient_related_persons",
    "appointments",
    "appointment_history",
    "encounters",
    "diagnoses",
    "billing_invoices",
    "billing_payments",
    "billing_refunds",
    "billing_receipts",
    "doctor_profiles",
    "doctor_documents",
    "sync_cursors",
    "sync_resource_versions",
    "sync_outbox",
    "clinical_sync_conflicts",
  ];
  return {
    schemaVersion: Number(
      database.raw
        .prepare("SELECT MAX(version) AS version FROM migration_history")
        .get().version,
    ),
    counts: Object.fromEntries(
      tables.map((table) => [table, countRows(database, table)]),
    ),
    patientIds: database.raw
      .prepare("SELECT patient_id FROM patients ORDER BY patient_id")
      .all()
      .map((row) => row.patient_id),
    invoiceNumbers: database.raw
      .prepare(
        "SELECT invoice_number FROM billing_invoices ORDER BY invoice_number",
      )
      .all()
      .map((row) => row.invoice_number),
    documentIds: ids.documentIds,
    syncScopes: database.raw
      .prepare("SELECT scope FROM sync_cursors ORDER BY scope")
      .all()
      .map((row) => row.scope),
  };
}

function assertCondition(condition, id, detail, results) {
  if (!condition) throw new Error(`${id}: ${detail}`);
  results.push({ id, status: "passed", detail });
}

async function main() {
  const reportPath = process.env["ELITE_PILOT_REPORT"];
  const keepArtifacts = process.argv.includes("--keep-artifacts");
  const workDir = mkdtempSync(join(tmpdir(), "elite-clinic-pilot-"));
  const databasePath = join(workDir, "synthetic-pilot.sqlite3");
  const backupPath = join(workDir, "synthetic-pilot.backup.sqlite3");
  const restorePath = join(workDir, "synthetic-pilot.restore.sqlite3");
  const vaultPath = join(workDir, "vault");
  const backupVaultPath = join(workDir, "vault-backup");
  const restoreVaultPath = join(workDir, "vault-restore");
  const results = [];
  const syntheticKey = Buffer.alloc(32, 0x51);
  const keyProvider = {
    providerName: "synthetic-pilot-key-provider",
    storageScheme: "os-wrapped-random-key",
    getOrCreateKey: () => Buffer.from(syntheticKey),
  };
  let database;
  let documentIds = [];
  let summary;

  try {
    mkdirSync(vaultPath, { recursive: true });
    database = openDatabase({
      filename: databasePath,
      mode: "production",
      keyProvider,
    });
    seedUsersAndDevices(database);

    const admin = makeContext(
      FIXED_IDS.adminPrimary,
      "pilot.admin.primary",
      "admin",
    );
    const adminBackup = makeContext(
      FIXED_IDS.adminBackup,
      "pilot.admin.backup",
      "admin",
    );
    const doctor = makeContext(
      FIXED_IDS.doctorPrimary,
      "pilot.doctor.primary",
      "doctor",
    );
    const approvingDoctor = makeContext(
      FIXED_IDS.doctorApprover,
      "pilot.doctor.approver",
      "doctor",
    );
    const nurse = makeContext(FIXED_IDS.nurse, "pilot.nurse", "nurse");
    const receptionist = makeContext(
      FIXED_IDS.receptionist,
      "pilot.receptionist",
      "receptionist",
    );

    const clinical = new ClinicalWorkflowService(database);
    const patients = new PatientIdentityService(database, {
      now: () => BASE_TIME,
    });
    const encounters = new EncounterService(database, { now: () => BASE_TIME });
    const billing = new BillingService(database);
    const specialty = clinical.createSpecialty(admin, {
      code: "PILOT-GP",
      nameEn: "Synthetic General Practice",
      nameAr: "طب الأسرة التجريبي",
    });
    const department = clinical.createDepartment(admin, {
      specialtyId: specialty.id,
      code: "PILOT-OPD",
      nameEn: "Synthetic Outpatient Department",
      nameAr: "العيادات الخارجية التجريبية",
    });
    const service = clinical.createService(admin, {
      departmentId: department.id,
      code: "PILOT-CONSULT",
      nameEn: "Synthetic Consultation",
      durationMinutes: 30,
      priceEgp: 500,
    });
    clinical.createSchedule(admin, {
      doctorId: FIXED_IDS.doctorPrimary,
      departmentId: department.id,
      dayOfWeek: 4,
      startTime: "09:00",
      endTime: "13:00",
      slotDurationMinutes: 30,
    });

    const guardian = patients.createRelatedPerson(admin, {
      displayNameEn: "Synthetic Parent Guardian",
      displayNameAr: "ولي أمر تجريبي",
      relationship: "parent",
      phoneNumbers: ["+201000000201"],
      isGuardian: true,
      isAuthorizedToConsent: true,
      isAuthorizedToContact: true,
      verificationStatus: "verified",
      preferredContactMethod: "phone",
    });
    const minor = patients.registerPatient(admin, {
      registrationMode: "full",
      nameEn: "Synthetic Child Patient",
      nameAr: "مريض طفل تجريبي",
      dob: "2018-05-01",
      sex: "female",
      phone: "+201000000201",
    });
    patients.linkRelatedPerson(admin, minor.patient.patientId, guardian.id, {
      relationshipRole: "mother",
      isPrimary: true,
      consentAuthority: "consent",
      verificationStatus: "verified",
    });
    const adult = patients.registerPatient(admin, {
      registrationMode: "full",
      nameEn: "Synthetic Adult Patient",
      nameAr: "مريض بالغ تجريبي",
      dob: "1987-11-12",
      sex: "male",
      phone: "+201000000202",
    });

    const firstAppointment = clinical.createAppointment(receptionist, {
      patientId: minor.patient.patientId,
      departmentId: department.id,
      doctorId: FIXED_IDS.doctorPrimary,
      serviceId: service.id,
      scheduledStart: "2030-07-18T09:00:00.000Z",
      visitType: "synthetic follow-up",
      isWalkIn: false,
      notes: "Synthetic guardian-present visit",
    });
    clinical.updateAppointmentStatus(receptionist, firstAppointment.id, {
      status: "arrived",
      reason: "Synthetic patient arrived",
    });
    clinical.updateAppointmentStatus(nurse, firstAppointment.id, {
      status: "in-consultation",
      reason: "Synthetic rooming complete",
    });
    clinical.updateAppointmentStatus(doctor, firstAppointment.id, {
      status: "completed",
      reason: "Synthetic consultation completed",
    });
    const secondAppointment = clinical.createAppointment(receptionist, {
      patientId: adult.patient.patientId,
      departmentId: department.id,
      doctorId: FIXED_IDS.doctorPrimary,
      serviceId: service.id,
      scheduledStart: "2030-07-18T10:00:00.000Z",
      visitType: "synthetic consultation",
      isWalkIn: false,
    });
    clinical.updateAppointmentStatus(receptionist, secondAppointment.id, {
      status: "arrived",
      reason: "Synthetic adult arrived",
    });

    const icd10 = encounters.createIcd10Code(admin, {
      code: "J06.9",
      titleEn: "Acute upper respiratory infection, unspecified",
      titleAr: "عدوى الجهاز التنفسي العلوي الحادة",
      releaseVersion: "synthetic-2026",
    });
    const draft = encounters.createEncounter(doctor, firstAppointment.id, {
      subjective: "Synthetic cough for three days.",
      objective: "Synthetic stable vital signs.",
      assessment: "Synthetic upper respiratory symptoms.",
      plan: "Synthetic supportive care and follow-up.",
    });
    const updated = encounters.updateEncounter(
      doctor,
      draft.id,
      { plan: "Synthetic supportive care, return if symptoms worsen." },
      draft.version,
    );
    const diagnosis = encounters.createDiagnosis(doctor, draft.id, {
      icd10CodeId: icd10.id,
      diagnosisTextEn: "Acute upper respiratory infection",
      isPrimary: true,
    });
    encounters.approveDiagnosis(
      approvingDoctor,
      diagnosis.id,
      "approved",
      "Synthetic second-doctor approval",
      diagnosis.version,
    );
    encounters.signEncounter(doctor, draft.id, updated.version);

    const packageRecord = billing.createPackage(admin, {
      code: "PILOT-PACKAGE",
      nameEn: "Synthetic Two-Visit Package",
      nameAr: "باقة زيارتين تجريبية",
      priceEgp: 900,
      items: [{ serviceId: service.id, quantity: 2 }],
    });
    const invoice = billing.createInvoice(admin, {
      patientId: adult.patient.patientId,
      appointmentId: secondAppointment.id,
      lines: [
        { serviceId: service.id, quantity: 1 },
        { packageId: packageRecord.id, quantity: 1 },
      ],
      discountEgp: 100,
      discountReason: "Synthetic pilot discount",
    });
    const firstPayment = billing.postPayment(receptionist, {
      invoiceId: invoice.id,
      amountEgp: 500,
      method: "cash",
    });
    billing.postPayment(receptionist, {
      invoiceId: invoice.id,
      amountEgp: 800,
      method: "card",
      reference: "SYNTHETIC-CARD-001",
    });
    billing.refundPayment(receptionist, {
      paymentId: firstPayment.payment.id,
      amountEgp: 300,
      reason: "Synthetic pilot refund rehearsal",
    });

    const vault = new FileVault(vaultPath);
    const doctorProfiles = new DoctorProfileService(
      database,
      vault,
      Buffer.alloc(32, 0x42),
      () => BASE_TIME,
    );
    doctorProfiles.updateProfile(admin, {
      doctorId: FIXED_IDS.doctorPrimary,
      displayNameEn: "Synthetic Dr. Salma Nabil",
      professionalRegistrationNumber: "EG-SYNTH-001",
      licenseVerificationStatus: "verified",
      specialtyIds: [specialty.id],
      departmentIds: [department.id],
      qualifications: "Synthetic medical degree",
      biography: "Synthetic pilot profile only",
      languages: ["Arabic", "English"],
      phone: "+201000002001",
      email: "salma.synthetic@example.test",
      clinicRoom: "Synthetic Room 1",
      consultationFeeEgp: 500,
    });
    const document = await doctorProfiles.uploadDocument(doctor, {
      doctorId: FIXED_IDS.doctorPrimary,
      documentType: "professional-license",
      displayName: "Synthetic Professional License",
      fileName: "synthetic-professional-license.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from(
        "SYNTHETIC LICENSE CONTENT ONLY",
        "utf8",
      ).toString("base64"),
    });
    documentIds = [document.documentId];

    insertSyncEvidence(
      database,
      admin,
      minor.patient.patientId,
      firstAppointment.id,
      invoice.id,
    );
    const beforeBackup = snapshot(database, { documentIds });
    assertCondition(
      beforeBackup.schemaVersion === 22,
      "schema-version",
      "Desktop database reached migration 22.",
      results,
    );
    assertCondition(
      beforeBackup.patientIds.join(",") === "EL-00001,EL-00002",
      "patient-sequence",
      "Synthetic patient identifiers are sequential and never reused.",
      results,
    );
    assertCondition(
      beforeBackup.counts.patient_related_persons === 1,
      "guardian-link",
      "A minor has one verified guardian relationship.",
      results,
    );
    assertCondition(
      beforeBackup.counts.appointment_history >= 5,
      "appointment-lifecycle",
      `Arrival, rooming, consultation, and completion history is present (count=${beforeBackup.counts.appointment_history}).`,
      results,
    );
    assertCondition(
      beforeBackup.counts.encounters === 1 &&
        beforeBackup.counts.diagnoses === 1,
      "signed-encounter",
      "One signed encounter and one ICD-10 diagnosis are present.",
      results,
    );
    assertCondition(
      beforeBackup.counts.billing_invoices === 1 &&
        beforeBackup.counts.billing_payments === 2 &&
        beforeBackup.counts.billing_refunds === 1,
      "billing-ledger",
      "Invoice, partial/full payments, receipt creation, and refund evidence are present.",
      results,
    );
    assertCondition(
      beforeBackup.counts.doctor_documents === 1 &&
        readdirSync(join(vaultPath, "doctor-documents")).length === 1,
      "doctor-document-vault",
      "One encrypted synthetic doctor document is stored in the Hub vault.",
      results,
    );
    assertCondition(
      beforeBackup.syncScopes.join(",") ===
        ANDROID_SCOPES.slice().sort().join(","),
      "sync-scope-matrix",
      "All six synchronization scopes, including billing-summary, have cursor evidence.",
      results,
    );
    assertCondition(
      beforeBackup.counts.sync_outbox === 1 &&
        beforeBackup.counts.clinical_sync_conflicts === 1,
      "offline-queue",
      "Offline outbox and a version-conflict recovery record are present.",
      results,
    );

    database.close();
    database = undefined;
    copyFileSync(databasePath, backupPath);
    mkdirSync(backupVaultPath, { recursive: true });
    copyFileSync(
      join(vaultPath, "doctor-documents", `${document.documentId}.bin`),
      join(backupVaultPath, `${document.documentId}.bin`),
    );
    copyFileSync(backupPath, restorePath);
    mkdirSync(restoreVaultPath, { recursive: true });
    copyFileSync(
      join(backupVaultPath, `${document.documentId}.bin`),
      join(restoreVaultPath, `${document.documentId}.bin`),
    );
    database = openDatabase({
      filename: restorePath,
      mode: "production",
      keyProvider,
    });
    const afterRestore = snapshot(database, { documentIds });
    assertCondition(
      afterRestore.schemaVersion === beforeBackup.schemaVersion,
      "restore-schema",
      "Restored encrypted database reopened at the same migration version.",
      results,
    );
    assertCondition(
      JSON.stringify(afterRestore.counts) ===
        JSON.stringify(beforeBackup.counts),
      "restore-counts",
      "Restored database preserved all synthetic table counts.",
      results,
    );
    assertCondition(
      sha256File(backupPath) === sha256File(restorePath),
      "restore-hash",
      "Backup and restored encrypted database bytes match.",
      results,
    );
    assertCondition(
      sha256File(join(backupVaultPath, `${document.documentId}.bin`)) ===
        sha256File(join(restoreVaultPath, `${document.documentId}.bin`)),
      "restore-vault-hash",
      "Backup and restored encrypted doctor-document vault bytes match.",
      results,
    );

    summary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      syntheticOnly: true,
      scenario: "synthetic-clinic-day-v1",
      organizationId: ORGANIZATION_ID,
      database: {
        migrationVersion: afterRestore.schemaVersion,
        counts: afterRestore.counts,
        patientIds: afterRestore.patientIds,
        invoiceNumbers: afterRestore.invoiceNumbers,
        documentIds,
      },
      sync: {
        scopes: afterRestore.syncScopes,
        offlineOutboxCount: afterRestore.counts.sync_outbox,
        conflictCount: afterRestore.counts.clinical_sync_conflicts,
      },
      recovery: {
        backupSha256: sha256File(backupPath),
        restoredDatabaseSha256: sha256File(restorePath),
        vaultFileCount: readdirSync(restoreVaultPath).length,
      },
      results,
      pendingPhysicalGates: [
        "Packaged Windows clean-install and upgrade on Windows 10/11",
        "SQLCipher and migration verification on physical Android devices",
        "LAN sync and TLS recovery with a Windows Hub and Android devices",
        "FLAG_SECURE, process-death, and doctor-document no-persistence checks",
        "Signed APK installation, upgrade, rollback, and device revocation rehearsal",
      ],
    };
    if (reportPath) {
      mkdirSync(dirname(resolve(reportPath)), { recursive: true });
      writeFileSync(
        resolve(reportPath),
        `${JSON.stringify(summary, null, 2)}\n`,
        "utf8",
      );
      console.log(`SYNTHETIC_PILOT_REPORT: ${resolve(reportPath)}`);
    }
    console.log(JSON.stringify(summary, null, 2));
    console.log("SYNTHETIC_PILOT_REHEARSAL_OK");
  } finally {
    if (database) database.close();
    syntheticKey.fill(0);
    if (!keepArtifacts) rmSync(workDir, { recursive: true, force: true });
    else console.log(`SYNTHETIC_PILOT_ARTIFACTS: ${workDir}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Synthetic pilot rehearsal failed",
  );
  process.exitCode = 1;
}
