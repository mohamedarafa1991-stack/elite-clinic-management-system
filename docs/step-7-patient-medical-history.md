# Step 7 — Patient Medical-History Management

## Scope

This increment extends the patient identity workspace with structured medical-history entries stored in the encrypted local database. The design deliberately separates identity data from clinical history: patient registration and demographic editing continue to use patient capabilities, while medical-history reads and writes use clinical capabilities.

## Delivered model

| Field      | Behavior                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Category   | Supports condition, allergy, medication, surgery, family history, social history, immunization, and other. |
| Title      | Required human-readable summary of the history item.                                                       |
| Details    | Optional structured narrative or supporting context, bounded to 4,000 characters.                          |
| Onset date | Optional ISO calendar date.                                                                                |
| Status     | Active, resolved, or inactive. Inactivation is the soft-delete state.                                      |
| Source     | Patient-reported, clinician-recorded, or external record.                                                  |
| Version    | Monotonically increments on updates and inactivation for optimistic concurrency protection.                |
| Provenance | Records the recording and updating user IDs and timestamps.                                                |

The database migration creates `patient_medical_history` with a foreign key to the internal patient record, status and source checks, indexes by patient/category, and no destructive delete operation. The encrypted production database and offline test database both apply the same versioned migration path.

## Service and security behavior

Clinicians with `clinical.read` can list a patient’s history. Users with `clinical.write` can create and update entries, while patient identity-only users such as receptionists do not receive medical-history data through the patient workspace. Create, update, and inactivation operations verify that the patient is active. Every write uses the authenticated session context and creates a patient-linked audit event with the action, entity ID, reason or status metadata, and device ID.

Updates require the entry version supplied by the caller. A stale version produces a conflict instead of silently overwriting another local device’s change. Inactivation also requires a reason of at least three characters and increments the entry version. The history remains listable as inactive for traceability and review.

## Desktop controls

The selected patient profile now includes a Medical history section. Clinicians can add entries, edit structured fields, review details and provenance state, and inactivate entries after entering an audit reason. The renderer communicates only through typed preload methods; SQLite access remains confined to the main-process service layer.

## Tests and remaining scope

Synthetic tests cover creation, listing, update versioning, stale-write rejection, required inactivation reasons, soft inactivation, audit linkage, migration registration, and table creation. Future clinical-record increments should add encounter notes, diagnosis coding, medication orders, allergy severity and reaction fields, doctor approval workflows, attachments, and history-aware merge behavior. These should preserve the same local encryption, capability checks, optimistic versioning, and audit requirements.
