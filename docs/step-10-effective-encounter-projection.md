# Step 10 — Effective Encounter Projection and Amendment Conflict Resolution

## Scope

This increment adds an effective-record projection over the immutable signed encounter and supports multiple sequential applied amendments. The signed encounter remains the authoritative original source. Applied amendments form an ordered, auditable correction chain that is folded over the original to produce the current effective Subjective, Objective, Assessment, Plan, and Follow-up view.

## Projection model

| Projection element | Behavior                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original source    | The signed encounter row, signature metadata, original version, and original content remain unchanged.                                                  |
| Amendment lineage  | Each new amendment records the latest applied amendment ID as `baseAmendmentId` plus the immutable signed encounter version.                            |
| Applied order      | An applied amendment receives a monotonically increasing `appliedSequence`.                                                                             |
| Field folding      | For each applied amendment in sequence, non-null proposed fields override the current projected field. Empty strings remain valid explicit corrections. |
| Effective metadata | The projection reports effective version, applied amendment count, latest applied amendment ID, and latest amendment timestamp.                         |

The effective projection is calculated by the service from the signed source and ordered applied amendments; it is not a destructive materialized overwrite of the signed encounter row. This preserves the complete history and makes projection rebuilding deterministic.

## Conflict behavior

Two approved amendments can be created from the same latest lineage when separate offline devices work concurrently. The first approved amendment to apply advances the lineage. Applying the stale branch does not silently overwrite the projection. Instead, the service marks it `conflict` and records a conflict reason and audit event.

A different Doctor with clinical approval capability can resolve a conflict using one of two explicit decisions:

| Resolution | Behavior                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rebase     | Moves the conflicted amendment to the current signed/base lineage, records the resolving Doctor and reason, returns it to approved state, and allows a later apply operation. |
| Reject     | Permanently closes the conflicted branch as rejected while preserving its proposed content and conflict history.                                                              |

The original requesting Doctor cannot resolve their own conflict. All resolution and application operations use optimistic amendment-version checks. A conflict is therefore routed to an explicit clinical decision instead of being resolved through last-write-wins.

## Desktop behavior

Opening an encounter loads the immutable signed record, effective projection, and amendment lineage. The signed-note panel displays the current effective content and the number of applied amendments while still identifying the signed original as immutable. Amendment rows show base lineage, applied sequence, review metadata, and conflict reason. Doctors can rebase and approve or reject a conflict after entering a reason.

## Tests and remaining scope

Synthetic tests cover migration 10, sequential applied amendments, projection folding, applied sequence numbering, stale branch conflict detection, self-resolution rejection, Doctor rebase resolution, and preservation of the original signed encounter. Future work should add field-level diff visualization, multiple amendment queues, projection snapshots for export, diagnosis or medication amendment dependencies, and Hub synchronization conflict reconciliation.
