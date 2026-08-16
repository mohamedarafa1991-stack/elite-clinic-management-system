# Step 8 — Encounter Notes and ICD-10 Diagnoses

## Scope

This increment adds structured encounter notes linked one-to-one with appointments and ICD-10-linked diagnoses recorded in English. The records remain local-first and are stored through the encrypted SQLite database. The renderer communicates only through typed Electron IPC and never accesses the database directly.

## Encounter lifecycle

| State               | Behavior                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Draft               | A clinician can create and edit the Subjective, Objective, Assessment, Plan, and Follow-up sections. Draft writes use optimistic version checks. |
| Signed              | A Doctor with `clinical.sign` can sign a draft. The signed timestamp and signing user are recorded, and the note becomes immutable in place.     |
| Correction boundary | Attempts to edit a signed encounter are rejected with an explicit amendment-workflow error rather than silently rewriting the clinical record.   |

Each encounter is linked to one appointment and its patient, records the appointment time as the encounter time, stores the author and version metadata, and rejects cancelled or no-show appointments. An appointment cannot receive multiple encounter records.

## ICD-10 catalog and diagnosis workflow

The local ICD-10 catalog stores the code, English title, optional Arabic title, release version, optional source URL, active state, and creation provenance. Admins can add synthetic or approved catalog entries through the clinical configuration area; future catalog synchronization can populate the same table after review.

A Doctor records diagnosis text in English and selects an active ICD-10 code from the local release-aware catalog. New diagnoses begin in `pending` approval state. A different Doctor with `clinical.approve` must approve or reject the diagnosis with a reason. The service rejects self-approval, duplicate review, stale-version updates, inactive ICD-10 codes, and diagnoses added to signed encounters.

> Clinical approval is intentionally distinct from Admin module management. A user with administrative catalog access cannot sign an encounter or approve a diagnosis unless the authenticated session also carries the Doctor approval capability and role boundary required by the service.

## Audit and security behavior

Encounter creation, draft updates, signing, diagnosis creation, approval, and rejection create patient-linked audit events containing the actor, device, entity, action, timestamp, and relevant metadata. Clinical text is not emitted into logs. All service operations validate the authenticated capability and relevant Doctor boundary before changing records.

## Desktop controls

The appointment list now provides an **Open encounter** action. The encounter panel supports draft creation and editing, signed-note read-only display, Doctor signing, ICD-10 selection, English diagnosis entry, primary-diagnosis designation, and second-Doctor approval or rejection with a mandatory reason. Admins can add active ICD-10 catalog entries with a release version from the clinical configuration area.

## Tests and remaining scope

Synthetic tests cover migration 8, ICD-10 catalog creation, encounter creation, draft updates, stale-version rejection, diagnosis creation, second-Doctor approval, signing, and signed-note immutability. Remaining clinical-record scope includes a formal encounter-amendment table and UI, ICD-10 release import and staged review, diagnosis editing rules, medication orders, attachments, specialty-specific forms, and patient-merge transfer behavior for encounters and diagnoses.
