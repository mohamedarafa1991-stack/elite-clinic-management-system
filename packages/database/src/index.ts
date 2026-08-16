import Database from "better-sqlite3";
import { nanoid } from "nanoid";

export type DatabaseMode = "production" | "test";

export interface OpenDatabaseOptions {
  filename: string;
  mode: DatabaseMode;
  encryptionDriver?: "sqlcipher";
  encryptionKey?: string;
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
  if (options.mode !== "production") {
    return;
  }
  if (options.encryptionDriver !== "sqlcipher" || !options.encryptionKey) {
    throw new Error(
      "ELITE_DB_ENCRYPTION_REQUIRED: production storage requires a configured SQLCipher driver and key provider",
    );
  }
}

export function openDatabase(options: OpenDatabaseOptions): EliteDatabase {
  assertProductionEncryption(options);
  const database = new Database(options.filename);
  database.pragma("foreign_keys = ON");

  if (options.mode === "production") {
    database.pragma(`key = '${options.encryptionKey!.replaceAll("'", "''")}'`);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS migration_history (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    database
      .prepare("SELECT version FROM migration_history ORDER BY version")
      .all()
      .map((row) => Number((row as { version: number }).version)),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }
    const applyMigration = database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare(
          "INSERT INTO migration_history (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
        )
        .run(migration.version, migration.name, checksum(migration.sql), now());
    });
    applyMigration();
  }

  database
    .prepare(
      "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)",
    )
    .run("installation_id", nanoid(24), now());

  return {
    raw: database,
    close: () => database.close(),
  };
}

export function migrationVersions(): readonly number[] {
  return MIGRATIONS.map((migration) => migration.version);
}
