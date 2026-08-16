# Step 9 — Signed-Encounter Amendments

## Scope

This increment implements corrections to signed encounter notes without rewriting the original signed record. The workflow follows the project clinical-record integrity rule: signed encounters remain immutable in place, while corrections become separate `encounter_amendments` records containing the proposed content, correction reason, author, review metadata, and application state.

## Amendment lifecycle

| State    | Behavior                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pending  | A Doctor submits a proposed correction against the current signed encounter version with a mandatory reason. The signed encounter is unchanged.                                                                                       |
| Approved | A different Doctor with `clinical.approve` reviews the proposal and records a mandatory review reason. The proposal remains separate from the signed original.                                                                        |
| Rejected | A different Doctor rejects the proposal with a reason. Rejected content remains preserved for audit and review.                                                                                                                       |
| Applied  | A Doctor applies an approved proposal after the service confirms that the signed encounter still has the exact base version recorded by the amendment. The amendment is marked applied; the original encounter row remains unchanged. |

Only one applied amendment is allowed for the current increment. The service rejects application when the encounter base version no longer matches or when another amendment is already applied, preventing silent last-write-wins behavior.

## Security and audit behavior

Requesting, reviewing, and applying amendments require clinical capabilities and a Doctor role boundary. The requesting Doctor cannot review their own amendment. Review and application use optimistic version checks. Every amendment action creates a patient-linked audit event containing the actor, device, entity, action, timestamp, base encounter version, and review metadata. Clinical note text is not written to operational logs.

The existing signed encounter remains available as the immutable original, including its original version and signature metadata. The amendment record preserves the proposed Subjective, Objective, Assessment, Plan, and Follow-up content, correction reason, request author, review author, review reason, and application actor/timestamp.

## Desktop controls

Opening a signed encounter displays an amendment section below the immutable note. A Doctor can request a correction by editing the proposed fields and supplying a correction reason. A separate Doctor can enter a review reason and approve or reject the proposal. Approved proposals expose an Apply amendment action. The UI displays amendment status, request author, base version, and review reason so the correction history is visible in the same encounter workspace.

## Tests and remaining scope

Synthetic tests cover migration 9, amendment creation, signed-only enforcement, independent Doctor review, self-review rejection, optimistic version checks, application, and preservation of the original signed encounter. Future work should support multiple sequential applied amendments with an effective-record projection, formal amendment conflict resolution, amended diagnosis and medication references, amendment exports, and Hub synchronization conflict routing.
