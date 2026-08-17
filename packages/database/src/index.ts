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
  {
    version: 11,
    name: "encounter-projection-snapshots",
    sql: `
      CREATE TABLE IF NOT EXISTS encounter_projection_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        encounter_id TEXT NOT NULL REFERENCES encounters(id),
        patient_id TEXT NOT NULL REFERENCES patients(id),
        signed_encounter_version INTEGER NOT NULL CHECK (signed_encounter_version >= 1),
        effective_version INTEGER NOT NULL CHECK (effective_version >= 1),
        applied_amendment_count INTEGER NOT NULL CHECK (applied_amendment_count >= 0),
        effective_payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
        export_reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        schema_version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_encounter_projection_snapshots_encounter ON encounter_projection_snapshots(encounter_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_encounter_projection_snapshots_patient ON encounter_projection_snapshots(patient_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_encounter_projection_snapshots_hash ON encounter_projection_snapshots(encounter_id, payload_hash);
    `,
  },
  {
    version: 12,
    name: "export-revocations-and-organization-settings",
    sql: `
      CREATE TABLE IF NOT EXISTS export_revocations (
        id TEXT PRIMARY KEY NOT NULL,
        package_id TEXT NOT NULL UNIQUE,
        reason TEXT NOT NULL,
        revoked_at TEXT NOT NULL,
        revoked_by_user_id TEXT NOT NULL REFERENCES users(id),
        audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id)
      );
      CREATE INDEX IF NOT EXISTS idx_export_revocations_revoked_at ON export_revocations(revoked_at);
      CREATE TABLE IF NOT EXISTS org_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_org_settings_updated_at ON org_settings(updated_at);
    `,
  },
  {
    version: 13,
    name: "offline-fhir-profile-bundles",
    sql: `
      CREATE TABLE IF NOT EXISTS fhir_profile_bundles (
        id TEXT PRIMARY KEY NOT NULL,
        bundle_json TEXT NOT NULL,
        bundle_hash TEXT NOT NULL CHECK (length(bundle_hash) = 64),
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
        installed_at TEXT NOT NULL,
        installed_by_user_id TEXT NOT NULL REFERENCES users(id),
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_fhir_profile_bundles_status ON fhir_profile_bundles(status, updated_at);
    `,
  },
  {
    version: 14,
    name: "export-registry-and-signing-key-lifecycle",
    sql: `
      CREATE TABLE IF NOT EXISTS export_signing_keys (
        key_id TEXT PRIMARY KEY NOT NULL,
        key_version INTEGER NOT NULL UNIQUE CHECK (key_version >= 1),
        algorithm TEXT NOT NULL CHECK (algorithm = 'ed25519'),
        public_key_pem TEXT NOT NULL,
        public_key_fingerprint TEXT NOT NULL UNIQUE CHECK (length(public_key_fingerprint) = 64),
        status TEXT NOT NULL CHECK (status IN ('active', 'retired', 'revoked')),
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        retired_at TEXT,
        revoked_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_export_signing_keys_active ON export_signing_keys(status) WHERE status = 'active';
      CREATE TABLE IF NOT EXISTS export_packages (
        package_id TEXT PRIMARY KEY NOT NULL,
        package_type TEXT NOT NULL CHECK (package_type IN ('detached', 'zip')),
        snapshot_id TEXT NOT NULL REFERENCES encounter_projection_snapshots(id),
        patient_id TEXT NOT NULL REFERENCES patients(id),
        format TEXT NOT NULL CHECK (format IN ('pdf', 'fhir')),
        redaction_policy TEXT NOT NULL CHECK (redaction_policy IN ('minimal', 'clinical', 'full')),
        export_reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        expires_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('issued', 'stored', 'downloaded', 'expired', 'revoked', 'superseded', 'archived', 'destroyed')),
        status_changed_at TEXT NOT NULL,
        status_changed_by_user_id TEXT NOT NULL REFERENCES users(id),
        package_hash TEXT NOT NULL CHECK (length(package_hash) = 64),
        payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
        manifest_hash TEXT NOT NULL CHECK (length(manifest_hash) = 64),
        signer_key_id TEXT NOT NULL REFERENCES export_signing_keys(key_id),
        signer_key_version INTEGER NOT NULL CHECK (signer_key_version >= 1),
        archive_file_name TEXT,
        archive_path TEXT,
        payload_path TEXT,
        manifest_path TEXT,
        signature_path TEXT,
        fhir_profile_bundle_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_export_packages_patient_created ON export_packages(patient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_export_packages_status_expiry ON export_packages(status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_export_packages_created_by ON export_packages(created_by_user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS export_package_lifecycle_events (
        id TEXT PRIMARY KEY NOT NULL,
        package_id TEXT NOT NULL REFERENCES export_packages(package_id),
        from_status TEXT CHECK (from_status IS NULL OR from_status IN ('issued', 'stored', 'downloaded', 'expired', 'revoked', 'superseded', 'archived', 'destroyed')),
        to_status TEXT NOT NULL CHECK (to_status IN ('issued', 'stored', 'downloaded', 'expired', 'revoked', 'superseded', 'archived', 'destroyed')),
        reason TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        changed_by_user_id TEXT NOT NULL REFERENCES users(id),
        audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id)
      );
      CREATE INDEX IF NOT EXISTS idx_export_package_lifecycle_events_package ON export_package_lifecycle_events(package_id, changed_at DESC);
      CREATE TABLE IF NOT EXISTS export_signing_key_events (
        id TEXT PRIMARY KEY NOT NULL,
        key_id TEXT NOT NULL REFERENCES export_signing_keys(key_id),
        event_type TEXT NOT NULL CHECK (event_type IN ('created', 'rotated', 'retired', 'revoked', 'recovery-exported', 'recovery-imported')),
        reason TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        occurred_by_user_id TEXT NOT NULL REFERENCES users(id),
        audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id)
      );
      CREATE INDEX IF NOT EXISTS idx_export_signing_key_events_key ON export_signing_key_events(key_id, occurred_at DESC);
    `,
  },
  {
    version: 15,
    name: "export-governance",
    sql: `
      CREATE TABLE IF NOT EXISTS export_recipients (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL,
        organization_name TEXT,
        category TEXT NOT NULL CHECK (category IN ('patient', 'guardian', 'treating-provider', 'referral-provider', 'legal-authority', 'administrative-authority', 'internal-clinic', 'other')),
        contact_channel TEXT,
        verification_status TEXT NOT NULL CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
        created_at TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_export_recipients_status ON export_recipients(verification_status, display_name);
      CREATE TABLE IF NOT EXISTS export_consent_evidence (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        evidence_type TEXT NOT NULL CHECK (evidence_type IN ('patient-consent', 'guardian-consent', 'clinical-treatment', 'legal-request', 'administrative-policy', 'emergency-exception')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
        source_reference TEXT NOT NULL,
        source_hash TEXT CHECK (source_hash IS NULL OR length(source_hash) = 64),
        related_person_id TEXT REFERENCES related_persons(id),
        effective_from TEXT,
        effective_until TEXT,
        recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
        recorded_at TEXT NOT NULL,
        reviewed_by_user_id TEXT REFERENCES users(id),
        reviewed_at TEXT,
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_export_consent_evidence_patient ON export_consent_evidence(patient_id, status, recorded_at DESC);
      CREATE TABLE IF NOT EXISTS export_disclosures (
        id TEXT PRIMARY KEY NOT NULL,
        package_id TEXT NOT NULL UNIQUE REFERENCES export_packages(package_id),
        patient_id TEXT NOT NULL REFERENCES patients(id),
        recipient_id TEXT NOT NULL REFERENCES export_recipients(id),
        purpose_of_use TEXT NOT NULL CHECK (purpose_of_use IN ('treatment', 'referral', 'patient-access', 'legal-request', 'administrative', 'emergency')),
        delivery_method TEXT NOT NULL CHECK (delivery_method IN ('usb', 'lan-share', 'local-copy', 'printed', 'other')),
        status TEXT NOT NULL CHECK (status IN ('requested', 'approved', 'rejected', 'sent', 'acknowledged', 'cancelled')),
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        requested_at TEXT NOT NULL,
        approved_by_user_id TEXT REFERENCES users(id),
        approved_at TEXT,
        decision_reason TEXT,
        sent_at TEXT,
        acknowledged_at TEXT,
        consent_evidence_id TEXT REFERENCES export_consent_evidence(id),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_export_disclosures_patient ON export_disclosures(patient_id, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_export_disclosures_status ON export_disclosures(status, requested_at DESC);
      CREATE TABLE IF NOT EXISTS export_receipts (
        id TEXT PRIMARY KEY NOT NULL,
        disclosure_id TEXT NOT NULL UNIQUE REFERENCES export_disclosures(id),
        package_id TEXT NOT NULL REFERENCES export_packages(package_id),
        recipient_id TEXT NOT NULL REFERENCES export_recipients(id),
        purpose_of_use TEXT NOT NULL CHECK (purpose_of_use IN ('treatment', 'referral', 'patient-access', 'legal-request', 'administrative', 'emergency')),
        package_hash TEXT NOT NULL CHECK (length(package_hash) = 64),
        manifest_hash TEXT NOT NULL CHECK (length(manifest_hash) = 64),
        signer_key_id TEXT NOT NULL REFERENCES export_signing_keys(key_id),
        signer_key_version INTEGER NOT NULL CHECK (signer_key_version >= 1),
        status_at_issuance TEXT NOT NULL CHECK (status_at_issuance IN ('issued', 'stored', 'downloaded', 'expired', 'revoked', 'superseded', 'archived', 'destroyed')),
        issued_at TEXT NOT NULL,
        issued_by_user_id TEXT NOT NULL REFERENCES users(id),
        receipt_hash TEXT NOT NULL CHECK (length(receipt_hash) = 64),
        signature_base64 TEXT NOT NULL,
        acknowledged_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_export_receipts_package ON export_receipts(package_id, issued_at DESC);
      CREATE TABLE IF NOT EXISTS export_governance_events (
        id TEXT PRIMARY KEY NOT NULL,
        disclosure_id TEXT REFERENCES export_disclosures(id),
        evidence_id TEXT REFERENCES export_consent_evidence(id),
        receipt_id TEXT REFERENCES export_receipts(id),
        event_type TEXT NOT NULL CHECK (event_type IN ('recipient-created', 'recipient-verified', 'evidence-recorded', 'evidence-reviewed', 'disclosure-requested', 'disclosure-approved', 'disclosure-rejected', 'disclosure-cancelled', 'disclosure-sent', 'receipt-issued', 'receipt-acknowledged')),
        reason TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        occurred_by_user_id TEXT NOT NULL REFERENCES users(id),
        audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id)
      );
      CREATE INDEX IF NOT EXISTS idx_export_governance_events_disclosure ON export_governance_events(disclosure_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_export_governance_events_evidence ON export_governance_events(evidence_id, occurred_at DESC);
    `,
  },
  {
    version: 16,
    name: "export-status-packages",
    sql: `
      CREATE TABLE IF NOT EXISTS export_status_packages (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        package_id TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        issuer_key_id TEXT NOT NULL,
        issuer_key_version INTEGER NOT NULL CHECK (issuer_key_version > 0),
        generated_at TEXT NOT NULL,
        valid_until TEXT NOT NULL,
        previous_status_hash TEXT CHECK (previous_status_hash IS NULL OR length(previous_status_hash) = 64),
        entries_hash TEXT NOT NULL CHECK (length(entries_hash) = 64),
        package_hash TEXT NOT NULL CHECK (length(package_hash) = 64),
        source TEXT NOT NULL CHECK (source IN ('hub-created', 'usb-import', 'lan-import', 'android-import', 'external-import')),
        acceptance_state TEXT NOT NULL CHECK (acceptance_state IN ('pending', 'accepted', 'rejected', 'superseded', 'quarantined')),
        source_reference TEXT,
        accepted_at TEXT,
        accepted_by_user_id TEXT REFERENCES users(id),
        rejection_reason TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (organization_id, package_hash)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_export_status_one_accepted
        ON export_status_packages(organization_id) WHERE acceptance_state = 'accepted';
      CREATE INDEX IF NOT EXISTS idx_export_status_sequence
        ON export_status_packages(organization_id, sequence DESC);
      CREATE INDEX IF NOT EXISTS idx_export_status_state
        ON export_status_packages(organization_id, acceptance_state);
      CREATE INDEX IF NOT EXISTS idx_export_status_package
        ON export_status_packages(organization_id, package_id);
      CREATE TABLE IF NOT EXISTS export_status_entries (
        id TEXT PRIMARY KEY NOT NULL,
        status_package_id TEXT NOT NULL REFERENCES export_status_packages(id),
        export_package_id TEXT REFERENCES export_packages(package_id),
        package_id TEXT NOT NULL,
        manifest_hash TEXT NOT NULL CHECK (length(manifest_hash) = 64),
        status TEXT NOT NULL CHECK (status IN ('issued', 'stored', 'downloaded', 'expired', 'revoked', 'superseded', 'archived', 'destroyed')),
        status_changed_at TEXT NOT NULL,
        lifecycle_event_id TEXT,
        reason_code TEXT,
        disclosure_state TEXT CHECK (disclosure_state IS NULL OR disclosure_state IN ('none', 'requested', 'approved', 'sent', 'acknowledged', 'rejected', 'cancelled')),
        receipt_state TEXT CHECK (receipt_state IS NULL OR receipt_state IN ('none', 'issued', 'acknowledged')),
        UNIQUE (status_package_id, package_id)
      );
      CREATE INDEX IF NOT EXISTS idx_export_status_entries_package
        ON export_status_entries(package_id, status_changed_at DESC);
      CREATE TABLE IF NOT EXISTS export_status_events (
        id TEXT PRIMARY KEY NOT NULL,
        status_package_id TEXT NOT NULL REFERENCES export_status_packages(id),
        event_type TEXT NOT NULL CHECK (event_type IN ('created', 'imported', 'verified', 'accepted', 'rejected', 'superseded', 'quarantined')),
        reason TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        occurred_by_user_id TEXT REFERENCES users(id),
        occurred_by_device_id TEXT,
        audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id)
      );
      CREATE INDEX IF NOT EXISTS idx_export_status_events_package
        ON export_status_events(status_package_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS export_trust_anchors (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        key_id TEXT NOT NULL,
        key_version INTEGER NOT NULL CHECK (key_version > 0),
        public_key_pem TEXT NOT NULL,
        fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
        state TEXT NOT NULL CHECK (state IN ('pending', 'accepted', 'retired', 'revoked')),
        source TEXT NOT NULL CHECK (source IN ('local-signer', 'admin-import', 'signed-trust-bundle')),
        accepted_by_user_id TEXT REFERENCES users(id),
        accepted_at TEXT,
        retired_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (organization_id, key_id, key_version),
        UNIQUE (organization_id, fingerprint)
      );
      CREATE INDEX IF NOT EXISTS idx_export_trust_anchors_state
        ON export_trust_anchors(organization_id, state);
      CREATE TABLE IF NOT EXISTS export_status_import_queue (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT,
        candidate_package_hash TEXT NOT NULL UNIQUE CHECK (length(candidate_package_hash) = 64),
        source TEXT NOT NULL CHECK (source IN ('usb-import', 'lan-import', 'android-import', 'external-import')),
        source_reference TEXT,
        received_at TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('received', 'verifying', 'accepted', 'rejected', 'quarantined')),
        attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
        last_error_code TEXT,
        last_error_detail TEXT,
        processed_status_package_id TEXT REFERENCES export_status_packages(id),
        quarantined_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_export_status_import_queue_state
        ON export_status_import_queue(state, received_at DESC);
    `,
  },
  {
    version: 17,
    name: "clinical-synchronization",
    sql: `
      CREATE TABLE IF NOT EXISTS sync_devices (
        id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL UNIQUE REFERENCES devices(id),
        enrollment_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        policy_version INTEGER NOT NULL CHECK (policy_version > 0),
        state TEXT NOT NULL CHECK (state IN ('active', 'suspended', 'revoked')),
        allowed_scopes_json TEXT NOT NULL,
        patient_scope_json TEXT,
        last_seen_at TEXT,
        last_sync_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sync_devices_owner
        ON sync_devices(owner_user_id, state);
      CREATE TABLE IF NOT EXISTS sync_cursors (
        id TEXT PRIMARY KEY NOT NULL,
        sync_device_id TEXT NOT NULL REFERENCES sync_devices(id),
        scope TEXT NOT NULL CHECK (scope IN ('appointments', 'patient-summary', 'encounter-summary', 'clinical-notes', 'export-governance')),
        cursor TEXT NOT NULL,
        server_sequence INTEGER NOT NULL CHECK (server_sequence >= 0),
        accepted_at TEXT NOT NULL,
        UNIQUE (sync_device_id, scope)
      );
      CREATE TABLE IF NOT EXISTS sync_resource_versions (
        id TEXT PRIMARY KEY NOT NULL,
        sync_device_id TEXT NOT NULL REFERENCES sync_devices(id),
        scope TEXT NOT NULL CHECK (scope IN ('appointments', 'patient-summary', 'encounter-summary', 'clinical-notes', 'export-governance')),
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
        last_updated_at TEXT NOT NULL,
        redacted INTEGER NOT NULL DEFAULT 0 CHECK (redacted IN (0, 1)),
        UNIQUE (sync_device_id, scope, resource_type, resource_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sync_resource_versions_resource
        ON sync_resource_versions(resource_type, resource_id, version DESC);
      CREATE TABLE IF NOT EXISTS sync_audit_events (
        id TEXT PRIMARY KEY NOT NULL,
        sync_device_id TEXT NOT NULL REFERENCES sync_devices(id),
        sync_session_id TEXT,
        user_id TEXT REFERENCES users(id),
        scope TEXT NOT NULL CHECK (scope IN ('appointments', 'patient-summary', 'encounter-summary', 'clinical-notes', 'export-governance')),
        result TEXT NOT NULL CHECK (result IN ('success', 'partial', 'rejected', 'conflict', 'error')),
        change_count INTEGER NOT NULL CHECK (change_count >= 0),
        conflict_count INTEGER NOT NULL CHECK (conflict_count >= 0),
        redaction_count INTEGER NOT NULL CHECK (redaction_count >= 0),
        reason_code TEXT,
        occurred_at TEXT NOT NULL,
        audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id)
      );
      CREATE INDEX IF NOT EXISTS idx_sync_audit_events_device
        ON sync_audit_events(sync_device_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        operation_id TEXT NOT NULL UNIQUE,
        sync_device_id TEXT NOT NULL REFERENCES sync_devices(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        organization_id TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('appointments', 'patient-summary', 'encounter-summary', 'clinical-notes', 'export-governance')),
        operation TEXT NOT NULL CHECK (operation IN ('appointment-acknowledge', 'appointment-arrival', 'queue-note')),
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        base_version INTEGER NOT NULL CHECK (base_version > 0),
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
        reason TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'accepted', 'already-applied', 'conflict', 'rejected', 'requires-amendment')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        last_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_state
        ON sync_outbox(sync_device_id, state, created_at ASC);
      CREATE TABLE IF NOT EXISTS clinical_sync_conflicts (
        id TEXT PRIMARY KEY NOT NULL,
        sync_device_id TEXT NOT NULL REFERENCES sync_devices(id),
        operation_id TEXT REFERENCES sync_outbox(operation_id),
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        client_base_version INTEGER NOT NULL CHECK (client_base_version > 0),
        server_version INTEGER NOT NULL CHECK (server_version > 0),
        conflict_type TEXT NOT NULL CHECK (conflict_type IN ('version-mismatch', 'requires-amendment', 'redacted', 'policy-denied')),
        resolution TEXT NOT NULL CHECK (resolution IN ('refresh', 'amend', 'rejected', 'none')),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by_user_id TEXT REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_clinical_sync_conflicts_open
        ON clinical_sync_conflicts(sync_device_id, resolved_at, created_at DESC);
    `,
  },
  {
    version: 18,
    name: "android-enrollment-state",
    sql: `
      CREATE TABLE IF NOT EXISTS android_enrollment_challenges (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        intended_user_id TEXT NOT NULL REFERENCES users(id),
        intended_role TEXT NOT NULL CHECK (intended_role IN ('admin', 'doctor', 'nurse', 'receptionist')),
        requested_policy_version INTEGER NOT NULL CHECK (requested_policy_version > 0),
        requested_scopes_json TEXT NOT NULL,
        response_nonce TEXT NOT NULL UNIQUE,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'revoked', 'rejected')),
        response_hash TEXT,
        signer_key_id TEXT,
        signer_key_version INTEGER,
        descriptor_json TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id),
        accepted_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_android_enrollment_challenges_state
        ON android_enrollment_challenges(status, expires_at, created_at DESC);
      CREATE TABLE IF NOT EXISTS android_enrollment_requests (
        id TEXT PRIMARY KEY NOT NULL,
        challenge_id TEXT NOT NULL REFERENCES android_enrollment_challenges(id),
        organization_id TEXT NOT NULL,
        device_id TEXT NOT NULL UNIQUE REFERENCES devices(id),
        device_name TEXT NOT NULL,
        app_version TEXT NOT NULL,
        api_level INTEGER,
        device_public_key_spki_base64 TEXT NOT NULL,
        device_public_key_fingerprint TEXT NOT NULL CHECK (length(device_public_key_fingerprint) = 64),
        request_nonce TEXT NOT NULL UNIQUE,
        request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
        descriptor_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        requested_at TEXT NOT NULL,
        reviewed_by_user_id TEXT REFERENCES users(id),
        reviewed_at TEXT,
        rejection_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_android_enrollment_requests_state
        ON android_enrollment_requests(status, requested_at DESC);
      CREATE TABLE IF NOT EXISTS android_enrollment_records (
        id TEXT PRIMARY KEY NOT NULL,
        request_id TEXT NOT NULL UNIQUE REFERENCES android_enrollment_requests(id),
        challenge_id TEXT NOT NULL REFERENCES android_enrollment_challenges(id),
        device_id TEXT NOT NULL UNIQUE REFERENCES devices(id),
        organization_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        role TEXT NOT NULL CHECK (role IN ('admin', 'doctor', 'nurse', 'receptionist')),
        device_name TEXT NOT NULL,
        device_public_key_fingerprint TEXT NOT NULL CHECK (length(device_public_key_fingerprint) = 64),
        policy_version INTEGER NOT NULL CHECK (policy_version > 0),
        allowed_scopes_json TEXT NOT NULL,
        patient_scope_json TEXT,
        response_hash TEXT NOT NULL UNIQUE CHECK (length(response_hash) = 64),
        response_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('approved', 'active', 'suspended', 'revoked')),
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        offline_access_until TEXT NOT NULL,
        acknowledged_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_android_enrollment_records_state
        ON android_enrollment_records(status, expires_at, created_at DESC);
      CREATE TABLE IF NOT EXISTS android_enrollment_events (
        id TEXT PRIMARY KEY NOT NULL,
        enrollment_id TEXT REFERENCES android_enrollment_records(id),
        challenge_id TEXT REFERENCES android_enrollment_challenges(id),
        request_id TEXT REFERENCES android_enrollment_requests(id),
        action TEXT NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL,
        actor_user_id TEXT REFERENCES users(id),
        reason_code TEXT,
        metadata_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_android_enrollment_events_entity
        ON android_enrollment_events(enrollment_id, occurred_at DESC);
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
