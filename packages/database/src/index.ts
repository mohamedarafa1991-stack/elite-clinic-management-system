import Database from "better-sqlite3-multiple-ciphers";
import { nanoid } from "nanoid";

export type DatabaseMode = "production" | "test";

export interface DatabaseKeyProvider {
  readonly providerName: string;
  readonly storageScheme: "os-wrapped-random-key";
  getOrCreateKey(): Buffer;
}

export interface OpenDatabaseOptions {
  filename: string;
  mode: DatabaseMode;
  keyProvider?: DatabaseKeyProvider;
}

export interface EliteDatabase {
  raw: Database.Database;
  close(): void;
}

const MIGRATIONS: readonly { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT NOT NULL UNIQUE,
        display_name_en TEXT NOT NULL,
        display_name_ar TEXT,
        role TEXT NOT NULL CHECK (role IN ('admin', 'doctor', 'nurse', 'receptionist')),
        capabilities_json TEXT NOT NULL,
        is_clinical_approver INTEGER NOT NULL DEFAULT 0 CHECK (is_clinical_approver IN (0, 1)),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY NOT NULL,
        friendly_name TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('windows', 'android')),
        app_version TEXT NOT NULL,
        api_level INTEGER,
        security_patch_level TEXT,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'revoked', 'wipe-pending')),
        approved_by_user_id TEXT REFERENCES users(id),
        approved_at TEXT,
        last_seen_at TEXT,
        last_sync_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS related_persons (
        id TEXT PRIMARY KEY NOT NULL,
        display_name_en TEXT NOT NULL,
        display_name_ar TEXT,
        relationship TEXT NOT NULL,
        phone_numbers_json TEXT NOT NULL,
        national_id TEXT,
        is_guardian INTEGER NOT NULL DEFAULT 0 CHECK (is_guardian IN (0, 1)),
        is_authorized_to_consent INTEGER NOT NULL DEFAULT 0 CHECK (is_authorized_to_consent IN (0, 1)),
        is_authorized_to_contact INTEGER NOT NULL DEFAULT 0 CHECK (is_authorized_to_contact IN (0, 1)),
        verification_status TEXT NOT NULL CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_ar TEXT,
        dob TEXT,
        sex TEXT CHECK (sex IN ('female', 'male', 'intersex', 'unknown')),
        phone TEXT NOT NULL,
        national_id TEXT,
        primary_department_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'archived', 'merged')),
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL REFERENCES users(id),
        schema_version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS patient_related_persons (
        patient_id TEXT NOT NULL REFERENCES patients(id),
        related_person_id TEXT NOT NULL REFERENCES related_persons(id),
        relationship_role TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
        created_at TEXT NOT NULL,
        PRIMARY KEY (patient_id, related_person_id)
      );

      CREATE TABLE IF NOT EXISTS consent_records (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        consent_type TEXT NOT NULL CHECK (consent_type IN ('treatment', 'data-processing', 'guardian', 'communications', 'media', 'research')),
        status TEXT NOT NULL CHECK (status IN ('requested', 'granted', 'refused', 'withdrawn', 'expired')),
        granted_by_related_person_id TEXT REFERENCES related_persons(id),
        recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
        recorded_at TEXT NOT NULL,
        expires_at TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        department_id TEXT NOT NULL,
        doctor_id TEXT REFERENCES users(id),
        scheduled_start TEXT NOT NULL,
        scheduled_end TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('scheduled', 'arrived', 'in-consultation', 'completed', 'cancelled', 'no-show', 'rescheduled')),
        visit_type TEXT NOT NULL,
        is_walk_in INTEGER NOT NULL DEFAULT 0 CHECK (is_walk_in IN (0, 1)),
        notes TEXT,
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL REFERENCES users(id),
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS outbox_events (
        id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL REFERENCES devices(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        base_version INTEGER NOT NULL,
        new_version INTEGER NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'archive', 'amend', 'merge')),
        payload_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'acknowledged', 'rejected', 'conflict')),
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        left_event_id TEXT NOT NULL REFERENCES outbox_events(id),
        right_event_id TEXT NOT NULL REFERENCES outbox_events(id),
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'rejected')),
        resolution TEXT CHECK (resolution IN ('amendment', 'keep-left', 'keep-right', 'manual-merge')),
        resolved_by_user_id TEXT REFERENCES users(id),
        resolved_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY NOT NULL,
        actor_user_id TEXT REFERENCES users(id),
        device_id TEXT REFERENCES devices(id),
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        patient_id TEXT,
        result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
        metadata_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS migration_history (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name_en, name_ar);
      CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
      CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
      CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(scheduled_start);
      CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
      CREATE INDEX IF NOT EXISTS idx_outbox_state ON outbox_events(state, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_conflicts_status ON sync_conflicts(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_occurred_at ON audit_events(occurred_at);
      CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_events(patient_id, occurred_at);
    `,
  },
  {
    version: 2,
    name: "authentication-and-device-enrollment",
    sql: `
      CREATE TABLE IF NOT EXISTS auth_credentials (
        user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
        password_hash TEXT NOT NULL,
        password_algorithm TEXT NOT NULL CHECK (password_algorithm = 'argon2id'),
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        password_changed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        device_id TEXT NOT NULL REFERENCES devices(id),
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        revoked_at TEXT,
        revoked_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS device_enrollment_requests (
        id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL REFERENCES devices(id),
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        requested_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        reviewed_by_user_id TEXT REFERENCES users(id),
        reviewed_at TEXT,
        rejection_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_auth_credentials_lock ON auth_credentials(locked_until);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, revoked_at, expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id, revoked_at, expires_at);
      CREATE INDEX IF NOT EXISTS idx_enrollment_requests_status ON device_enrollment_requests(status, requested_at);
    `,
  },
  {
    version: 3,
    name: "patient-identity-lifecycle",
    sql: `
      INSERT OR IGNORE INTO app_meta (key, value, updated_at)
      VALUES ('patient_sequence_next', '1', CURRENT_TIMESTAMP);

      ALTER TABLE patients ADD COLUMN registration_mode TEXT NOT NULL DEFAULT 'quick'
        CHECK (registration_mode IN ('quick', 'full'));
      ALTER TABLE patients ADD COLUMN completeness_status TEXT NOT NULL DEFAULT 'minimal'
        CHECK (completeness_status IN ('minimal', 'complete'));
      ALTER TABLE patients ADD COLUMN normalized_name_en TEXT NOT NULL DEFAULT '';
      ALTER TABLE patients ADD COLUMN normalized_name_ar TEXT;
      ALTER TABLE patients ADD COLUMN normalized_phone TEXT NOT NULL DEFAULT '';
      ALTER TABLE patients ADD COLUMN normalized_national_id TEXT;
      ALTER TABLE patients ADD COLUMN archived_at TEXT;
      ALTER TABLE patients ADD COLUMN archived_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE patients ADD COLUMN archive_reason TEXT;
      ALTER TABLE patients ADD COLUMN merged_into_patient_id TEXT REFERENCES patients(id);
      ALTER TABLE patients ADD COLUMN merged_at TEXT;
      ALTER TABLE patients ADD COLUMN merged_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE patients ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

      ALTER TABLE related_persons ADD COLUMN preferred_contact_method TEXT
        CHECK (preferred_contact_method IN ('phone', 'sms', 'whatsapp', 'email', 'none'));
      ALTER TABLE related_persons ADD COLUMN created_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE related_persons ADD COLUMN updated_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE patient_related_persons ADD COLUMN consent_authority TEXT NOT NULL DEFAULT 'none'
        CHECK (consent_authority IN ('none', 'inform', 'consent'));
      ALTER TABLE patient_related_persons ADD COLUMN verified_at TEXT;
      ALTER TABLE patient_related_persons ADD COLUMN verified_by_user_id TEXT REFERENCES users(id);
      ALTER TABLE patient_related_persons ADD COLUMN ended_at TEXT;

      CREATE TABLE IF NOT EXISTS patient_identity_sequence (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        next_number INTEGER NOT NULL CHECK (next_number >= 1),
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO patient_identity_sequence (id, next_number, updated_at)
      SELECT 1,
             COALESCE(MAX(CAST(SUBSTR(patient_id, 4) AS INTEGER)), 0) + 1,
             CURRENT_TIMESTAMP
      FROM patients
      WHERE patient_id GLOB 'EL-[0-9]*';

      UPDATE patients
      SET normalized_name_en = lower(trim(name_en)),
          normalized_name_ar = CASE WHEN name_ar IS NULL THEN NULL ELSE trim(name_ar) END,
          normalized_phone = trim(phone),
          normalized_national_id = CASE WHEN national_id IS NULL THEN NULL ELSE trim(national_id) END,
          completeness_status = CASE WHEN name_en IS NOT NULL AND phone IS NOT NULL THEN 'complete' ELSE 'minimal' END
      WHERE normalized_name_en = '';

      CREATE INDEX IF NOT EXISTS idx_patients_normalized_name ON patients(normalized_name_en, normalized_name_ar);
      CREATE INDEX IF NOT EXISTS idx_patients_normalized_phone ON patients(normalized_phone);
      CREATE INDEX IF NOT EXISTS idx_patients_normalized_national_id ON patients(normalized_national_id);
      CREATE INDEX IF NOT EXISTS idx_patients_merged_into ON patients(merged_into_patient_id);
      CREATE INDEX IF NOT EXISTS idx_patient_related_active ON patient_related_persons(patient_id, ended_at);
    `,
  },
  {
    version: 4,
    name: "patient-duplicate-and-merge-workflows",
    sql: `
      CREATE TABLE IF NOT EXISTS patient_duplicate_reviews (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        candidate_patient_id TEXT NOT NULL REFERENCES patients(id),
        score INTEGER NOT NULL CHECK (score >= 0),
        signals_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'created-another', 'merge-requested', 'dismissed')),
        decision_reason TEXT,
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        requested_at TEXT NOT NULL,
        decided_by_user_id TEXT REFERENCES users(id),
        decided_at TEXT,
        CHECK (patient_id != candidate_patient_id)
      );

      CREATE TABLE IF NOT EXISTS patient_merge_cases (
        id TEXT PRIMARY KEY NOT NULL,
        source_patient_id TEXT NOT NULL REFERENCES patients(id),
        target_patient_id TEXT NOT NULL REFERENCES patients(id),
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'executed')),
        reason TEXT NOT NULL,
        field_decisions_json TEXT NOT NULL,
        correlation_id TEXT NOT NULL UNIQUE,
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        requested_at TEXT NOT NULL,
        reviewed_by_user_id TEXT REFERENCES users(id),
        reviewed_at TEXT,
        review_reason TEXT,
        executed_by_user_id TEXT REFERENCES users(id),
        executed_at TEXT,
        CHECK (source_patient_id != target_patient_id)
      );

      CREATE TABLE IF NOT EXISTS patient_identity_history (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        action TEXT NOT NULL,
        change_summary_json TEXT NOT NULL,
        correlation_id TEXT,
        actor_user_id TEXT REFERENCES users(id),
        device_id TEXT REFERENCES devices(id),
        occurred_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_duplicate_reviews_status ON patient_duplicate_reviews(status, requested_at);
      CREATE INDEX IF NOT EXISTS idx_duplicate_reviews_patient ON patient_duplicate_reviews(patient_id, candidate_patient_id);
      CREATE INDEX IF NOT EXISTS idx_merge_cases_status ON patient_merge_cases(status, requested_at);
      CREATE INDEX IF NOT EXISTS idx_merge_cases_source ON patient_merge_cases(source_patient_id);
      CREATE INDEX IF NOT EXISTS idx_identity_history_patient ON patient_identity_history(patient_id, occurred_at);
    `,
  },
  {
    version: 5,
    name: "related-person-editing-version",
    sql: `
      ALTER TABLE related_persons ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_related_persons_version ON related_persons(id, version);
    `,
  },
  {
    version: 6,
    name: "clinical-workflow-foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS specialties (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_ar TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL REFERENCES users(id),
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY NOT NULL,
        specialty_id TEXT NOT NULL REFERENCES specialties(id),
        code TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_ar TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL REFERENCES users(id),
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY NOT NULL,
        department_id TEXT NOT NULL REFERENCES departments(id),
        code TEXT NOT NULL UNIQUE,
        name_en TEXT NOT NULL,
        name_ar TEXT,
        duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (duration_minutes BETWEEN 5 AND 480),
        price_egp INTEGER NOT NULL DEFAULT 0 CHECK (price_egp >= 0),
        status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL REFERENCES users(id),
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS doctor_schedules (
        id TEXT PRIMARY KEY NOT NULL,
        doctor_id TEXT NOT NULL REFERENCES users(id),
        department_id TEXT NOT NULL REFERENCES departments(id),
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        slot_duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (slot_duration_minutes BETWEEN 5 AND 480),
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL REFERENCES users(id),
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (doctor_id, department_id, day_of_week, start_time, end_time)
      );
      CREATE TABLE IF NOT EXISTS schedule_exceptions (
        id TEXT PRIMARY KEY NOT NULL,
        doctor_id TEXT REFERENCES users(id),
        department_id TEXT REFERENCES departments(id),
        exception_date TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('closed', 'open')),
        start_time TEXT,
        end_time TEXT,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS appointment_history (
        id TEXT PRIMARY KEY NOT NULL,
        appointment_id TEXT NOT NULL REFERENCES appointments(id),
        action TEXT NOT NULL,
        previous_status TEXT,
        new_status TEXT,
        payload_json TEXT NOT NULL,
        actor_user_id TEXT NOT NULL REFERENCES users(id),
        occurred_at TEXT NOT NULL
      );
      ALTER TABLE appointments ADD COLUMN service_id TEXT REFERENCES services(id);
      ALTER TABLE appointments ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 15;
      CREATE INDEX IF NOT EXISTS idx_departments_specialty ON departments(specialty_id, status);
      CREATE INDEX IF NOT EXISTS idx_services_department ON services(department_id, status);
      CREATE INDEX IF NOT EXISTS idx_schedules_doctor_day ON doctor_schedules(doctor_id, day_of_week);
      CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_date ON schedule_exceptions(exception_date);
      CREATE INDEX IF NOT EXISTS idx_appointments_doctor_time ON appointments(doctor_id, scheduled_start, scheduled_end, status);
      CREATE INDEX IF NOT EXISTS idx_appointment_history_appointment ON appointment_history(appointment_id, occurred_at);
    `,
  },
  {
    version: 7,
    name: "patient-medical-history",
    sql: `
      CREATE TABLE IF NOT EXISTS patient_medical_history (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        category TEXT NOT NULL CHECK (category IN ('condition', 'allergy', 'medication', 'surgery', 'family-history', 'social-history', 'immunization', 'other')),
        title TEXT NOT NULL,
        details TEXT,
        onset_date TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'resolved', 'inactive')) DEFAULT 'active',
        source TEXT NOT NULL CHECK (source IN ('patient-reported', 'clinician-recorded', 'external-record')) DEFAULT 'clinician-recorded',
        recorded_at TEXT NOT NULL,
        recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL REFERENCES users(id),
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_patient_medical_history_patient ON patient_medical_history(patient_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_patient_medical_history_category ON patient_medical_history(patient_id, category, status);
    `,
  },
  {
    version: 8,
    name: "encounters-and-icd10-diagnoses",
    sql: `
      CREATE TABLE IF NOT EXISTS icd10_codes (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL UNIQUE,
        title_en TEXT NOT NULL,
        title_ar TEXT,
        release_version TEXT NOT NULL,
        source_url TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS encounters (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id),
        author_user_id TEXT NOT NULL REFERENCES users(id),
        encounter_at TEXT NOT NULL,
        subjective TEXT,
        objective TEXT,
        assessment TEXT,
        plan TEXT,
        follow_up TEXT,
        status TEXT NOT NULL CHECK (status IN ('draft', 'signed')) DEFAULT 'draft',
        signed_at TEXT,
        signed_by_user_id TEXT REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS diagnoses (
        id TEXT PRIMARY KEY NOT NULL,
        encounter_id TEXT NOT NULL REFERENCES encounters(id),
        patient_id TEXT NOT NULL REFERENCES patients(id),
        icd10_code_id TEXT NOT NULL REFERENCES icd10_codes(id),
        diagnosis_text_en TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
        approval_status TEXT NOT NULL CHECK (approval_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
        recorded_at TEXT NOT NULL,
        approved_by_user_id TEXT REFERENCES users(id),
        approved_at TEXT,
        approval_reason TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_icd10_codes_active ON icd10_codes(is_active, code);
      CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id, encounter_at);
      CREATE INDEX IF NOT EXISTS idx_encounters_status ON encounters(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_diagnoses_encounter ON diagnoses(encounter_id, approval_status);
      CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON diagnoses(patient_id, recorded_at);
    `,
  },
  {
    version: 9,
    name: "encounter-amendments",
    sql: `
      CREATE TABLE IF NOT EXISTS encounter_amendments (
        id TEXT PRIMARY KEY NOT NULL,
        encounter_id TEXT NOT NULL REFERENCES encounters(id),
        patient_id TEXT NOT NULL REFERENCES patients(id),
        base_encounter_version INTEGER NOT NULL CHECK (base_encounter_version >= 1),
        subjective TEXT,
        objective TEXT,
        assessment TEXT,
        plan TEXT,
        follow_up TEXT,
        correction_reason TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'applied')) DEFAULT 'pending',
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        requested_at TEXT NOT NULL,
        reviewed_by_user_id TEXT REFERENCES users(id),
        reviewed_at TEXT,
        review_reason TEXT,
        applied_by_user_id TEXT REFERENCES users(id),
        applied_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_encounter_amendments_encounter ON encounter_amendments(encounter_id, requested_at);
      CREATE INDEX IF NOT EXISTS idx_encounter_amendments_status ON encounter_amendments(status, requested_at);
      CREATE INDEX IF NOT EXISTS idx_encounter_amendments_patient ON encounter_amendments(patient_id, requested_at);
    `,
  },
  {
    version: 10,
    name: "encounter-amendment-projection-conflicts",
    sql: `
      DROP INDEX IF EXISTS idx_encounter_amendments_encounter;
      DROP INDEX IF EXISTS idx_encounter_amendments_status;
      DROP INDEX IF EXISTS idx_encounter_amendments_patient;
      ALTER TABLE encounter_amendments RENAME TO encounter_amendments_v9;
      CREATE TABLE encounter_amendments (
        id TEXT PRIMARY KEY NOT NULL,
        encounter_id TEXT NOT NULL REFERENCES encounters(id),
        patient_id TEXT NOT NULL REFERENCES patients(id),
        base_encounter_version INTEGER NOT NULL CHECK (base_encounter_version >= 1),
        base_amendment_id TEXT REFERENCES encounter_amendments(id),
        subjective TEXT,
        objective TEXT,
        assessment TEXT,
        plan TEXT,
        follow_up TEXT,
        correction_reason TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'conflict')) DEFAULT 'pending',
        conflict_reason TEXT,
        conflict_resolved_at TEXT,
        conflict_resolved_by_user_id TEXT REFERENCES users(id),
        conflict_resolution_reason TEXT,
        applied_sequence INTEGER CHECK (applied_sequence IS NULL OR applied_sequence >= 1),
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        requested_at TEXT NOT NULL,
        reviewed_by_user_id TEXT REFERENCES users(id),
        reviewed_at TEXT,
        review_reason TEXT,
        applied_by_user_id TEXT REFERENCES users(id),
        applied_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO encounter_amendments
        (id, encounter_id, patient_id, base_encounter_version, subjective, objective, assessment, plan, follow_up,
         correction_reason, status, requested_by_user_id, requested_at, reviewed_by_user_id, reviewed_at, review_reason,
         applied_by_user_id, applied_at, version)
      SELECT id, encounter_id, patient_id, base_encounter_version, subjective, objective, assessment, plan, follow_up,
             correction_reason, status, requested_by_user_id, requested_at, reviewed_by_user_id, reviewed_at, review_reason,
             applied_by_user_id, applied_at, version
      FROM encounter_amendments_v9;
      DROP TABLE encounter_amendments_v9;
      CREATE INDEX idx_encounter_amendments_encounter ON encounter_amendments(encounter_id, requested_at);
      CREATE INDEX idx_encounter_amendments_status ON encounter_amendments(status, requested_at);
      CREATE INDEX idx_encounter_amendments_patient ON encounter_amendments(patient_id, requested_at);
      CREATE INDEX idx_encounter_amendments_base ON encounter_amendments(encounter_id, base_encounter_version, status);
    `,
  },
];

function now(): string {
  return new Date().toISOString();
}

function checksum(sql: string): string {
  let hash = 2166136261;
  for (let index = 0; index < sql.length; index += 1) {
    hash ^= sql.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function assertProductionEncryption(options: OpenDatabaseOptions): void {
  if (options.mode === "production" && !options.keyProvider) {
    throw new Error(
      "ELITE_DB_ENCRYPTION_REQUIRED: production storage requires the approved OS-backed key provider",
    );
  }
}

function applyDatabaseKey(
  database: Database.Database,
  options: OpenDatabaseOptions,
): void {
  if (options.mode !== "production") {
    return;
  }
  const key = options.keyProvider!.getOrCreateKey();
  if (!Buffer.isBuffer(key) || key.length < 32) {
    throw new Error(
      "ELITE_DB_KEY_INVALID: the database key provider must return at least 256 bits of key material",
    );
  }
  try {
    database.key(Buffer.from(key));
  } finally {
    key.fill(0);
  }
}

export function openDatabase(options: OpenDatabaseOptions): EliteDatabase {
  assertProductionEncryption(options);
  const database = new Database(options.filename);
  try {
    applyDatabaseKey(database, options);
    database.pragma("foreign_keys = ON");

    database.exec(`
    CREATE TABLE IF NOT EXISTS migration_history (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

    const applied = new Map(
      database
        .prepare(
          "SELECT version, checksum FROM migration_history ORDER BY version",
        )
        .all()
        .map((row) => {
          const typedRow = row as { version: number; checksum: string };
          return [Number(typedRow.version), typedRow.checksum] as const;
        }),
    );

    for (const migration of MIGRATIONS) {
      const expectedChecksum = checksum(migration.sql);
      const appliedChecksum = applied.get(migration.version);
      if (appliedChecksum !== undefined) {
        if (appliedChecksum !== expectedChecksum) {
          throw new Error(
            `ELITE_MIGRATION_CHECKSUM_MISMATCH: migration ${migration.version} has changed after application`,
          );
        }
        continue;
      }
      const applyMigration = database.transaction(() => {
        database.exec(migration.sql);
        database
          .prepare(
            "INSERT INTO migration_history (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
          )
          .run(migration.version, migration.name, expectedChecksum, now());
      });
      applyMigration();
    }

    database
      .prepare(
        "INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)",
      )
      .run("installation_id", nanoid(24), now());

    return {
      raw: database,
      close: () => database.close(),
    };
  } catch (error) {
    database.close();
    throw error;
  }
}

export function migrationVersions(): readonly number[] {
  return MIGRATIONS.map((migration) => migration.version);
}
