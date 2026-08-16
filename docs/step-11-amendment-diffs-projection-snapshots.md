# Step 11 — Amendment Diffs and Projection Snapshots

## Scope

This increment adds field-level diffs for encounter amendments and immutable effective-record projection snapshots for patient-record exports. The signed encounter remains unchanged, while the current effective record is reconstructed from the signed source and applied amendment lineage.

## Field-level diffs

Each amendment can be queried as a structured diff over the five encounter note fields: Subjective, Objective, Assessment, Plan, and Follow-up. The service reconstructs the amendment’s base state from the signed encounter and its `baseAmendmentId` lineage, then reports only fields whose proposed value differs from that base.

| Diff property     | Meaning                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `field`           | Encounter field changed by the amendment.                            |
| `before`          | Value in the amendment’s base projection; omitted when not recorded. |
| `after`           | Proposed value; omitted only when a value is explicitly removed.     |
| `status`          | Current amendment lifecycle state, including conflict state.         |
| `baseAmendmentId` | Latest applied correction from which the proposal was created.       |

Empty strings are preserved as explicit corrections rather than treated as missing values. This makes clearing an erroneous note field distinguishable from leaving that field unchanged.

## Projection snapshots

A projection snapshot is an immutable export artifact for one effective encounter state. Creating a snapshot requires a reason and records the signed encounter version, effective version, applied amendment count, canonical effective payload JSON, SHA-256 payload hash, creating user, and timestamp. The snapshot table has no update or delete operation. Repeating an export request for the same effective payload returns the existing snapshot by encounter and payload hash rather than creating duplicate content.

Snapshots are stored with the internal patient foreign key but returned through the patient’s stable display ID. The payload includes the effective encounter projection, so an export consumer can verify the record state independently of later amendment activity. Subsequent corrections produce a different effective version and payload hash, resulting in a new immutable snapshot.

## Desktop behavior

Opening a signed encounter loads amendment history, field-level diffs, the current effective projection, and prior export snapshots. The UI displays per-field before-and-after values alongside each amendment. Authorized clinical users can create an immutable export snapshot by entering a mandatory export reason and can review snapshot timestamp, effective version, amendment count, abbreviated payload hash, and reason.

## Security and auditability

Diff and snapshot queries require `clinical.read`. Snapshot creation uses the same local capability boundary and creates a patient-linked `encounter-projection-snapshot.create` audit event containing payload hash, export reason, and effective version. The snapshot payload is not written to operational logs. The signed original remains immutable and is always included as the source version metadata.

## Tests and remaining scope

Synthetic tests cover field-level diff reconstruction across sequential amendments, immutable snapshot creation, payload hash format, duplicate snapshot deduplication, changed-projection snapshot creation, migration 11, and preservation of signed encounter rows. Future export work should add signed file packaging, user-facing export formats, redaction policies, field-level UI diff views for all clinical entities, and external verification of snapshot hashes.
