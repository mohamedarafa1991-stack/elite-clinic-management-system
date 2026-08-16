# Step 1 Database Architecture

## Database responsibilities

The Hub database is the clinic’s canonical coordination store when the local Hub is reachable. Each Windows or Android device has an encrypted local store for offline operation. No device writes directly into another device’s database.

The local stores expose repository APIs to application services. UI code never constructs SQL, accesses database files, or manages encryption keys directly.

## Core entities

The first schema contract includes these domains:

| Domain          | Entities                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Identity        | patient, patient_identifier, related_person, patient_related_person, consent_record, duplicate_candidate, patient_merge, soft_delete |
| Workforce       | user, role, capability, user_capability, device, session, device_credential                                                          |
| Care            | care_episode, encounter, encounter_amendment, diagnosis, allergy, medication_statement, prescription, care_plan, referral, procedure |
| Diagnostics     | investigation_order, specimen, observation_result, diagnostic_report, imaging_study, media_asset                                     |
| Obstetrics      | pregnancy_episode, pregnancy_history, fetal_assessment, delivery_record                                                              |
| Operations      | department, specialty_module, appointment, queue_event, room, service, service_price_version, invoice, payment, refund               |
| Governance      | audit_event, export_event, print_event, backup_manifest, restore_event, incident, data_subject_request                               |
| Reference       | icd_release, icd_code, drug_catalog_version, drug_item, drug_override, lab_reference_set, clinical_rule, translation_release         |
| Synchronization | outbox_event, inbox_event, sync_checkpoint, sync_conflict, conflict_resolution                                                       |

## Required record metadata

Every mutable record includes an immutable internal ID, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `version`, `status`, and `schemaVersion`. Clinical records additionally include author, observed/encounter time, source, units, reference-set version, signature state, amendment reason, and approval metadata where applicable.

Human patient identifiers use sequential display values such as `EL-00001`; the underlying primary key is a globally unique identifier and is never reused. Phone numbers are not unique. National ID is optional. Related-person and guardian links are separate from patient identity.

## Clinical record integrity

Draft encounters may be edited. Signed encounters are immutable in place. Corrections create `encounter_amendment` records that preserve prior content, corrected content, author, timestamp, reason, and approval state. A user cannot silently rewrite a signed encounter.

Patient deletion creates a soft-delete/archive state. Permanent destruction, where legally and operationally permitted, is a separate Admin action that records reason, actor, timestamp, and affected records.

## Synchronization model

Every device write creates an outbox event containing device ID, user ID, entity ID, entity type, base version, new version, operation, payload hash, and timestamp. The Hub accepts events only after authenticating the device and validating the user’s capability.

The Hub returns acknowledgments, rejected events, or conflict records. A conflict preserves both versions. Signed clinical conflicts are never resolved by last-write-wins; they are routed to the Admin queue and resolved through an amendment or explicit merge decision. Appointment and draft changes may use more permissive merge rules only when the domain policy allows it.

## Migration rules

Migrations are numbered, deterministic, forward-only, and idempotent. Each migration records name, checksum, applied timestamp, application version, and operator context. A migration must be tested against an empty database, the previous migration version, and a representative synthetic dataset.

A failed migration stops startup in a safe maintenance state. The application must not partially migrate a clinical database and then present the UI as ready.

## Backup metadata

Backup manifests record schema version, application version, catalog versions, record counts, media inventory, hashes, created time, and restore compatibility. Backups are encrypted and include no unprotected secret material.
