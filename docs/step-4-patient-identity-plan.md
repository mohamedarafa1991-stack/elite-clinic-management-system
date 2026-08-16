# Step 4 Implementation Plan: Patient Identity and Guardian Workflows

## Purpose and boundary

Step 4 establishes the identity layer for Elite Clinic. It will create, find, update, archive, and administratively merge patient records while preserving identity history and supporting minors, guardians, related persons, and shared household contact details. It will not implement clinical notes, diagnoses, drug prescribing, billing, or appointment scheduling beyond preserving existing foreign-key relationships.

The implementation will use synthetic fixtures only. Patient identity is treated as a high-sensitivity domain: phone numbers are not unique, national ID is optional, and a guardian is never silently treated as the patient. The existing Electron boundary remains mandatory: renderer code will use typed preload methods, while authentication, capability enforcement, database transactions, and audit writes remain in the main process and service packages.

## Confirmed product rules

| Rule                       | Step 4 behavior                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient identifier         | Generate sequential, displayable IDs in the `EL-00001` format. IDs are never reused, including after archive or merge.                                                                                            |
| Required registration data | Full English name and a phone number are required in both quick and full registration. National ID is optional.                                                                                                   |
| Registration modes         | Quick registration creates a usable minimal record; full registration captures the available identity, contact, guardian, and demographic details. A record records its registration mode and completeness state. |
| Shared phones              | A phone number may belong to several patients, including a parent and multiple children. Phone-only matches warn but never block registration.                                                                    |
| Minors                     | A minor remains an independent patient. One or more related persons may be guardians, contacts, or consent authorities for that patient.                                                                          |
| Duplicate handling         | Registration and relevant edits run weighted duplicate detection. The user may create another patient or start a controlled merge; the system never silently merges.                                              |
| Merge authority            | Merge requests are reviewed and executed through an Admin workflow. The source record remains retained as a merged record and points to its surviving target.                                                     |
| Archive                    | Archive is a reversible soft-delete state. Permanent destruction is not part of Step 4 and requires a later administrator workflow.                                                                               |
| Audit                      | Creation, edits, duplicate decisions, guardian-link changes, archive/unarchive, merge request, review, execution, and rejection are auditable. Audit entries must not place unmasked PHI in logs.                 |

## Domain model

The existing schema already contains `patients`, `related_persons`, `patient_related_persons`, `consent_records`, and an audit table. Step 4 will extend those tables through a new versioned migration rather than rewriting an applied migration.

### Patient identity

The internal opaque `patients.id` remains the immutable database key. `patients.patient_id` is the human-facing sequential identifier. The patient row will gain lifecycle fields for registration mode, completeness, archive metadata, merge target, merge metadata, and an optimistic version. The source row of a merge will remain addressable for history and redirect purposes; it will not be physically deleted.

The service will maintain normalized identity values for deterministic searching and duplicate scoring. Normalization will be conservative: trim and collapse whitespace, case-fold English text, normalize punctuation, preserve Arabic text in a searchable normalized form, and normalize phone digits into a consistent Egyptian representation without assuming that a shared phone identifies one person. National IDs will be normalized for comparison but will not be written to application logs.

### Sequential identifier allocation

A dedicated sequence row will be introduced for patient display numbers. Allocation will occur inside the same write transaction as patient creation, using a serialized database write and a monotonic counter. The next number is consumed even if a later user action archives or merges the record, ensuring that `EL-00001`-style identifiers are never reused. Existing records, if any, will initialize the counter from the highest valid patient number before new records are created.

### Related persons and guardians

`related_persons` remains reusable across multiple patients so that one parent or guardian can be linked to siblings or other dependents. The relationship table will carry patient-specific relationship data, including role, primary-contact designation, consent authority, contact authority, verification metadata, and an optional end date. This avoids treating a person as a universal guardian for every patient to whom they are connected.

The UI and service layer will require explicit relationship selection for a guardian link. For minors, the workflow will support recording guardian/consent information while preserving the minor’s own patient ID and record. Legal-review-required status remains visible until local counsel confirms the applicable Egyptian PDPL and minor-consent rules.

### Duplicate review and merge records

A dedicated duplicate-review table will store a request, the source and candidate patient IDs, the score and reasons, the requesting user, the decision, and the review history. A separate merge-case table will represent the controlled merge lifecycle: `pending`, `approved`, `rejected`, `cancelled`, or `executed`. The case stores the selected target, field-level decisions, reason, reviewer, executor, timestamps, and a deterministic correlation ID.

Merges will be transactional and idempotent. The service will verify that both records are active, that the reviewer has Admin merge authority, and that the source and target are different. It will preserve the source record as `merged`, redirecting it to the target. Patient-related links and safe references will be reconciled without deleting history. Any future clinical, billing, or appointment records will be handled through explicit entity-specific policies rather than a generic destructive cascade.

### Identity audit history

Existing `audit_events` will record the actor, device, action, result, entity, patient context, correlation ID, and a masked metadata summary. Step 4 will add an append-only patient-identity history table for structured field-change events and merge decisions. Database snapshots may be encrypted at rest with the database, but raw PHI must not appear in console logs, renderer diagnostics, test output, or source-control fixtures.

## Duplicate-scoring design

The first implementation will use a deterministic weighted score that produces an explanation rather than an opaque yes/no result. The system will display matched signals to the user and preserve the score and signal names in the duplicate-review record.

| Signal                                                  | Initial weight | Policy                                                                               |
| ------------------------------------------------------- | -------------: | ------------------------------------------------------------------------------------ |
| Exact normalized national ID when both records have one |             45 | Strong warning; still does not silently block the “create another patient” decision. |
| Exact normalized full English name                      |             25 | Stronger when combined with date of birth.                                           |
| Exact date of birth                                     |             20 | Never used alone as a duplicate decision.                                            |
| Exact normalized primary phone                          |             15 | Warning only because household phones are shared.                                    |
| Shared related-person or guardian phone                 |             10 | Contextual warning only.                                                             |
| Exact normalized Arabic name                            |             10 | Supporting signal where available.                                                   |
| Compatible sex value                                    |              5 | Supporting signal only; unknown never penalizes a match.                             |

The initial thresholds will be configurable constants covered by tests: scores of 60 or more produce a high-priority duplicate review; scores from 35 through 59 produce a possible-duplicate warning; lower scores do not interrupt registration. Exact national ID, phone-only matches, and shared guardian contacts will each have explicit test cases. The scoring module will be designed so future clinical or administrative review can adjust weights without changing stored patient identity history.

## Capability and IPC design

| Operation                                 | Required capability and policy                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Search or view patient                    | `patient.read`; scope validation will be added when departments and clinical scopes are implemented. |
| Create or edit patient and related person | `patient.write`; all inputs are parsed through shared Zod contracts.                                 |
| Archive or unarchive                      | `patient.archive`; current role matrix grants this to Admin only. A reason is mandatory.             |
| Request merge                             | `patient.merge`; the initial role matrix grants this to Admin only.                                  |
| Approve and execute merge                 | Admin role plus `patient.merge`; the executor must re-check the case and record the decision.        |
| View identity history                     | `audit.read` for the audit view, with patient access checks applied.                                 |

The desktop main process will register typed handlers for patient search, retrieval, quick/full registration, update, related-person linking, archive/unarchive, duplicate candidates, merge requests, merge review, and identity-history retrieval. Every handler will obtain and validate the authenticated session, enforce capability, validate input, use a transaction where needed, and write an audit event. The preload bridge will expose narrow methods only; no renderer code will receive a database handle or arbitrary SQL access.

## Desktop user experience

The renderer will receive a patient-management area with a search-first list, a quick-registration form, a full-registration form, and a patient profile. The profile will show the patient ID prominently, identify archived or merged status, and display guardian and related-person links separately from the patient’s own contact information.

When a new or edited record produces matches, the interface will show a duplicate-review panel with the matched signals and three explicit outcomes: return to editing, create another patient with a recorded reason, or submit/start the authorized merge workflow. Archive and merge actions will use confirmation dialogs with the reason, affected record IDs, and the irreversible-history implications clearly stated. Admins will receive a merge-review queue rather than a hidden automatic merge.

## Migration sequence

| Migration | Main change                                                                                                                 | Safety requirement                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Version 3 | Add patient sequence, lifecycle fields, normalized identity fields, and related-person relationship authorization metadata. | Preserve all existing rows and initialize the sequence transactionally. |
| Version 4 | Add duplicate-review, merge-case, and identity-history tables plus indexes.                                                 | All new foreign keys must preserve source records and audit references. |

If implementation reveals that a SQLite column alteration cannot preserve a required constraint safely, the migration will use a create-copy-validate-rename procedure inside a transaction and will be covered by a synthetic upgrade test from the Step 2 schema.

## Acceptance criteria

| Area                    | Acceptance test                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identifier allocation   | First synthetic patient receives `EL-00001`; later records advance monotonically; archived and merged IDs are never reused.                      |
| Shared phone            | Parent and two child patients may share a phone without a uniqueness error; the system shows a phone-only warning.                               |
| Quick/full registration | Required fields are enforced; quick registration is usable; full registration stores optional identity and guardian details.                     |
| Guardian model          | One related person can be linked to multiple patients with patient-specific relationship and authorization roles.                                |
| Duplicate scoring       | National ID, name/DOB, phone-only, guardian-phone, Arabic-name, and non-match cases produce expected scores and explanations.                    |
| Create-another decision | A user can continue after a warning only with an explicit recorded decision and reason.                                                          |
| Merge controls          | Non-Admins cannot approve or execute; approved merges are transactional, idempotent, auditable, and preserve the source record as merged.        |
| Archive                 | Archive requires a reason, is reversible through the authorized workflow, hides records from default active search, and never deletes the row.   |
| Audit                   | Every identity mutation and duplicate/merge decision produces a structured audit entry without PHI in logs.                                      |
| Security                | All desktop handlers reject unauthenticated sessions, insufficient capabilities, malformed input, and cross-record references that do not exist. |
| Upgrade                 | A database created at migrations 1–2 upgrades to the Step 4 schema without data loss and with valid checksums.                                   |

## Implementation order

The work should proceed in six implementation slices. First, finalize shared input/output contracts and migration design. Second, add migrations and database upgrade tests. Third, implement normalization, sequence allocation, patient/related-person services, duplicate scoring, and identity history. Fourth, add controlled merge and archive workflows with authorization tests. Fifth, connect the secure Electron IPC and patient-management UI. Sixth, run the complete test, typecheck, desktop-build, audit, formatting, and synthetic-data review, then document and commit the step.

## Risks and explicit non-goals

The largest identity risk is false certainty from shared contact information. The implementation will therefore treat phone matches as explainable warnings, not identifiers or automatic merge triggers. The largest operational risk is merge irreversibility; the source row, merge case, field decisions, and audit history will remain retained so that a later recovery workflow can be designed without pretending that a merge is a simple delete.

Step 4 will not claim legal compliance for minor consent or Egypt PDPL obligations. It will preserve a legal-review-required status and provide structured consent/authorization data so local counsel can validate the policy before production. It will also not import, sync, or embed real patient data or external identity datasets.

## References

[1]: https://www.tamimi.com/law_update_articles/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law/ "Egypt PDPL executive-regulations update"
[2]: https://iclg.com/practice-areas/data-protection-laws-and-regulations/egypt "Egypt data-protection overview"

## Implementation snapshot

The first Step 4 slice is now implemented in the workspace. It includes migrations 3 and 4, shared contracts, the authenticated patient identity service, related-person creation and retrieval, sequential ID allocation, deterministic duplicate scoring, explicit create-another review records, archive/unarchive, Admin-controlled merge cases, transactional source preservation, secure IPC/preload methods, and a desktop quick-registration/search workspace.

The current desktop UI intentionally starts with quick registration and duplicate review. Full registration, patient profile editing, rich guardian-link editing, merge-case review screens, bilingual labels, and Android integration remain subsequent slices within Step 4. The service and IPC boundaries are in place so those additions do not require bypassing the database or authentication layers.

The synthetic test suite currently covers the migrated schema, sequential identifiers, shared guardian phone reuse, phone-only duplicate warnings, explicit duplicate decisions, archive/unarchive, and approved merge execution. No real patient or identity data has been introduced.

## Full-registration and profile-editing increment

The next increment adds a shared patient form that supports quick and full modes. Full mode captures Arabic name, date of birth, sex, and optional national ID while retaining the required English name and phone. Selecting a patient loads the profile into the same form and displays related persons and guardian authorization separately from the patient’s own phone.

Profile saves include the patient version returned by the database. The service increments the version transactionally and rejects stale saves with `ELITE_PATIENT_VERSION_CONFLICT`. Profile edits also rerun duplicate detection and require an explicit reason when the user chooses to continue despite a possible duplicate. The remaining guardian-link editing controls will be implemented as a subsequent UI slice; the current increment provides read visibility and preserves the secure service operation for existing related-person links.
