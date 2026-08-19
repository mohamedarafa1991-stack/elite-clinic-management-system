# Elite Clinic Synthetic Pilot Rehearsal and Recovery Runbook

**Prepared by:** Manus AI
**Clinic:** Elite Clinic / ايليت, Cairo, Egypt
**Scenario:** `synthetic-clinic-day-v1`
**Status:** Sandbox rehearsal implemented; packaged Windows and physical-device gates remain required

## Purpose and safety boundary

This runbook defines the first repeatable operational rehearsal for Elite Clinic. It validates a complete fictional clinic day, encrypted Hub database and document-vault copy/restore, offline queue evidence, and the six approved synchronization scopes without introducing real patient data. It is intentionally designed for the current local-first architecture and does not add cloud storage, production seed data, or automatic production restoration.

> **Synthetic-data rule:** Every person, document, identifier, phone number, diagnosis, invoice, payment, and synchronization record created by this rehearsal is fictional. Do not replace any value with a real patient, staff member, national ID, telephone number, document, or credential.

The repository already defines encrypted local storage, migration-history checksums, encrypted doctor-document vault records, signed export governance, and local synchronization policies.[1] [2] The present rehearsal proves the database and vault copy/restore path with a synthetic key provider. It does **not** claim that production OS-backed key recovery, Windows installer behavior, Android physical-device behavior, or live LAN recovery has been completed.

## Acceptance criteria

The rehearsal is accepted for this development milestone only when the command completes with `SYNTHETIC_PILOT_REHEARSAL_OK`, the JSON report has `syntheticOnly: true`, and every local result has `status: "passed"`. The report must also list the physical-device items as pending until they have been observed on the intended workstation and devices.

| Area                        | Required local evidence                                                                                                                                            | Current sandbox result              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Database migrations         | The encrypted Hub database opens at migration version 22 after creation and after restore.                                                                         | Passed.                             |
| Patient identity            | Patients are issued as `EL-00001` and `EL-00002`; the second patient does not reuse the first identifier.                                                          | Passed.                             |
| Guardian workflow           | A fictional minor has one verified guardian relationship with consent authority.                                                                                   | Passed.                             |
| Clinic day                  | Appointment history records registration, arrival, rooming, consultation, and completion transitions.                                                              | Passed.                             |
| Clinical record             | One encounter is signed and has an approved ICD-10 diagnosis (`J06.9`).                                                                                            | Passed.                             |
| Billing                     | One EGP invoice includes a discount, two payments, receipts, and a partial refund.                                                                                 | Passed.                             |
| Doctor profile and vault    | One doctor profile and one encrypted synthetic document are stored in the Hub vault.                                                                               | Passed.                             |
| Offline and synchronization | All six scopes have cursor/resource evidence, with one pending outbox operation and one version-conflict record.                                                   | Passed.                             |
| Recovery                    | The encrypted database and encrypted document-vault file are copied, reopened or compared after restore, and retain counts and hashes.                             | Passed with synthetic key provider. |
| Physical operation          | Packaged Windows installation, Android SQLCipher, LAN, screen protection, document process-death, signed APK, and device lifecycle gates are observed on hardware. | Pending.                            |

## Synthetic clinic-day scenario

The dataset represents one Thursday operating session at the Cairo branch. The script uses fixed fictional names and Arabic/English display values, while service-generated database identifiers remain unique per run as required by the application. The output report records the generated identifiers without exposing any real information.

| Workflow slice    | Synthetic coverage                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff and devices | Two Admins, two Doctors, one Nurse, one Receptionist, one Windows Hub device, and one Android device.                                                 |
| Scheduling        | One synthetic general-practice specialty, one outpatient department, one 30-minute consultation service, and one doctor schedule.                     |
| Patient identity  | One fictional child (`EL-00001`) with a verified parent guardian and one fictional adult (`EL-00002`).                                                |
| Appointments      | A child appointment progresses through arrived, in-consultation, and completed; an adult appointment remains arrived for queue-workflow coverage.     |
| Clinical care     | A signed encounter contains synthetic notes and an approved ICD-10 diagnosis for acute upper respiratory infection, unspecified.                      |
| Billing           | A package and service line create an EGP invoice with a discount; cash and card payments are posted, then part of the first payment is refunded.      |
| Doctor records    | A profile is configured for a synthetic doctor and a professional-license PDF payload containing only synthetic text is encrypted into the Hub vault. |
| Sync and outage   | All six scopes, an offline appointment-arrival outbox item, and a version-mismatch conflict are recorded for the synthetic Android device.            |
| Recovery          | The encrypted database and doctor-document vault file are copied to backup and restore paths, reopened or hashed, and compared.                       |

## Running the local rehearsal

From the repository root, build the shared packages and execute the repeatable scenario:

```bash
pnpm pilot:rehearsal
```

To write a JSON evidence report into the ignored local artifacts directory, use:

```bash
ELITE_PILOT_REPORT=artifacts/pilot-rehearsal/run-report.json pnpm pilot:rehearsal
```

On Windows PowerShell, use the equivalent environment-variable syntax:

```powershell
$env:ELITE_PILOT_REPORT = "artifacts/pilot-rehearsal/run-report.json"
pnpm pilot:rehearsal
```

The generated report is synthetic evidence and should be copied to the pilot evidence archive only after review. It is ignored by Git by design. The optional `--keep-artifacts` argument preserves the temporary encrypted database, backup, restore copy, and vault directories for inspection:

```bash
ELITE_PILOT_REPORT=artifacts/pilot-rehearsal/run-report.json pnpm pilot:rehearsal -- --keep-artifacts
```

The script removes its temporary working directory by default. Never pass real database paths or real vault paths to this development script. It creates its own temporary production-mode database and uses a synthetic 256-bit key provider only for this rehearsal.

## Evidence to archive

For each rehearsal, archive the JSON report, the current Git commit, the package version, the desktop schema version, the Android release-check output when available, and the operator’s signed checklist. Do not archive plaintext database files, plaintext document payloads, passwords, OS key material, or unencrypted copies of the synthetic vault.

The report should be checked for the following fields before archiving:

| Report field                                                  | Review requirement                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `syntheticOnly`                                               | Must be exactly `true`.                                                                                                            |
| `scenario`                                                    | Must identify the approved scenario version, currently `synthetic-clinic-day-v1`.                                                  |
| `database.migrationVersion`                                   | Must be `22` for the current repository.                                                                                           |
| `database.patientIds`                                         | Must contain the expected synthetic sequential identifiers and no real identifiers.                                                |
| `sync.scopes`                                                 | Must contain `appointments`, `patient-summary`, `encounter-summary`, `clinical-notes`, `export-governance`, and `billing-summary`. |
| `recovery.backupSha256` and `recovery.restoredDatabaseSha256` | Must match for this copy/restore rehearsal.                                                                                        |
| `pendingPhysicalGates`                                        | Must remain visible until each workstation/device gate produces evidence.                                                          |

## Hub backup and restore procedure for the future pilot

The following procedure is the operator-level target for the packaged Windows Hub. The current sandbox script simulates the copy and restore using synthetic files; it does not replace the production backup UI or the production key-recovery process.

### Pre-backup checks

An Admin should first confirm that no migration, import, export, restore, or installer upgrade is running. The Hub should be placed in maintenance mode or stopped cleanly so SQLite WAL and shared-memory files are checkpointed and closed. The operator records the application version, Git/release identifier, migration version, database path policy, vault path policy, and current TLS/device lifecycle status in the evidence record.

The backup destination must be encrypted removable media under Admin custody, with a second verified copy during the pilot. The backup package must include the encrypted database file, the encrypted doctor-document vault contents, a versioned manifest, file sizes, SHA-256 hashes, schema/migration version, and the key-recovery reference required by the clinic’s approved OS-backed key procedure. **Never copy or print the plaintext database key.** If the production key-recovery procedure has not been implemented and tested, the backup is not production-recoverable and must be labeled as an incomplete development artifact.

### Backup creation and verification

1. Stop the Hub cleanly and confirm the process is no longer holding the database or vault files.
2. Copy the encrypted database to a new timestamped backup directory on encrypted media. Preserve the database filename and any required sidecar policy only as documented by the packaged Hub.
3. Copy the encrypted doctor-document vault contents while preserving relative paths and file names. Do not decrypt documents for backup.
4. Create a manifest containing the release identifier, migration version, database size, vault file count, each file’s SHA-256 hash, operator identity, timestamp, and backup media identifier.
5. Verify that the manifest hashes match the copied files. Verify that the source and backup are encrypted artifacts and that no plaintext database or document payload is present in the backup directory.
6. Keep the source Hub unchanged until the backup has passed verification. Record the backup result as `verified` or `rejected` in the operator log.

### Restore to a replacement Hub

Restore must first occur in a separate test directory or replacement machine. It must never overwrite the active clinic directory as the first action.

1. Confirm the replacement machine has the approved packaged Hub version or a documented migration-compatible version.
2. Create a safety backup of any existing replacement-machine data before placing restored files.
3. Copy the encrypted database and encrypted vault files from the verified media into a new restore directory.
4. Provision or recover the approved OS-backed database key through the clinic’s two-Admin recovery procedure. Do not bypass encryption with a plaintext export.
5. Start the Hub against the restore directory in verification mode. Confirm that the database opens, migration history is intact, migration checksums match, foreign-key checks remain enabled, the installation identity policy is understood, and the database record counts match the backup manifest.
6. Verify that doctor-document vault metadata and ciphertext hashes match, and view one synthetic document only through the approved role-controlled viewer. Never use a plaintext file explorer as the document viewer during a real-data restore test.
7. Verify Hub TLS startup, the configured trust-anchor policy, and the Admin recovery notification path. Re-enroll or explicitly validate each Android device according to the device lifecycle policy; do not silently trust a changed certificate.
8. Run the synthetic sync smoke scenario, including an offline queued operation, Hub restart, retry, acknowledgment, and conflict visibility. Record any manual reconciliation.
9. Require an explicit Admin confirmation before replacing the active clinic directory. Preserve the pre-restore safety backup until the restored Hub has passed the agreed observation period.

### Restore failure and rollback

If the restored Hub cannot open the encrypted database, reports a migration checksum mismatch, fails vault authentication, or cannot establish the approved TLS trust relationship, stop the restore. Do not repeatedly mutate the restore directory. Preserve the failed directory and logs as a quarantined development artifact, restore the safety backup if the replacement machine had prior data, and open an incident record containing the error code, release version, migration version, and operator actions. A failed restore must not be presented as evidence of recoverability.

## Physical workstation and device gates

The following checks are intentionally not marked as passed by the local script. They require the intended Windows Hub, Android devices, and controlled synthetic LAN described in the project readiness plan.[3]

| Gate              | Evidence required                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows packaging | Clean install and upgrade of the NSIS artifact on Windows 10 and Windows 11, with native encrypted SQLite startup and retained data policy verified.                  |
| Database recovery | Production OS-backed key initialization, encrypted backup, replacement-Hub restore, migration replay, and rollback with two-Admin authorization.                      |
| Android storage   | SQLCipher Room opening and migrations 1→6 on at least one API-29-class device and one current supported device.                                                       |
| LAN sync          | Enrollment, six-scope sync, offline queue, durable claims, conflict/retry classification, Hub outage, restart, TLS recovery, and device revocation/re-enrollment.     |
| Doctor documents  | Upload and view-only retrieval over LAN, `FLAG_SECURE`, no Android persistence, viewer cleanup, process death, oversized/corrupted content, and role-specific denial. |
| Release lifecycle | Signed APK installation, upgrade, rollback, checksum/signature verification, and loss/revocation procedure.                                                           |

## Close-out and data destruction

After the rehearsal, the operator verifies that temporary files and synthetic vault artifacts are removed from the workstation unless the evidence package explicitly requires encrypted retention. Any retained evidence must remain synthetic, access-controlled, and labeled with its release and scenario version. The operator records the final report path, evidence hash, unresolved issues, and the next required physical gate.

No production patient data may be loaded until all P0/P1 security and data-integrity defects are closed, the packaged Windows and Android/device gates are evidenced, and the Admin-approved backup/restore procedure has completed a clean replacement-Hub rehearsal.[3]

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/security-baseline.md "Elite Clinic security baseline"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/database-architecture.md "Elite Clinic database architecture"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/next-phase-pilot-readiness-plan.md "Elite Clinic pilot readiness plan"
