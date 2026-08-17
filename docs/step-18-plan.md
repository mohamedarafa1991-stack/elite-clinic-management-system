# Step 18 — FHIR Provenance, Export Governance, and Disclosure Receipts

## Planning objective

Step 18 should be the clinic’s **interoperability and clinical-governance increment** after the Step 17 signed status-package work. Its purpose is to make every sensitive export explainable to both machines and administrators: who created it, which immutable snapshot and signing key were used, why it was disclosed, to whom it was sent, what authorization evidence supported the disclosure, and what handling restrictions apply.

The proposed scope combines the next priorities identified in the export-security roadmap: FHIR `Provenance`, FHIR `AuditEvent`, recipient and consent workflow, security labels, redaction transparency, and signed export receipts. FHIR R4 distinguishes Provenance as the record of how a resource came to be and AuditEvent as the event record maintained as security-relevant activity occurs [1] [2]. The clinic’s local audit ledger remains authoritative; FHIR resources are controlled projections for interoperability and disclosure evidence.

> **Recommended Step 18 theme:** Make exports governable and interpretable without turning FHIR `Consent` or security labels into an automatic legal or access-control engine.

## Prerequisites and dependency gate

Step 18 should begin after the Step 17 implementation has delivered the signed status-package contract, signer-hardening tests, and trusted status verification. The export manifest must already carry stable package ID, snapshot ID, hashes, organization identity, signer key ID/version, lifecycle state, and profile provenance. Without those identifiers, Provenance and AuditEvent references will be ambiguous and disclosure receipts will not be reliably correlated.

| Prerequisite     | Required state                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Export registry  | Persistent package records and lifecycle events are available for every saved export          |
| Signer lifecycle | Key versioning, recovery hardening, and retired-key verification are passing regression tests |
| Status package   | Signed status artifacts can report revocation/supersession and stale status separately        |
| FHIR validation  | Offline R4 structural validation and selected profile-bundle validation are operational       |
| Audit ledger     | Local audit events are append-only, actor-attributed, and queryable by administrators         |

## Scope and non-goals

Step 18 is intentionally focused on the governance of exports rather than broad clinical-data modeling. It will add disclosure context and FHIR traceability to existing signed bundles. It will not implement a complete national consent law engine, automatic legal interpretation, a cloud consent service, full SMART-on-FHIR authorization, or automatic sharing with external organizations.

FHIR R4 states that Consent expresses a healthcare consumer’s choices for identified recipients or roles, actions, purposes, and periods, while enforcement requires a separate access-control policy model [3]. Therefore, Step 18 should store and evaluate explicit clinic policy decisions and consent evidence; it should not claim that the presence of a FHIR Consent resource alone authorizes disclosure.

## Primary deliverables

| Deliverable                       | Outcome                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| FHIR Provenance projection        | The export Bundle identifies the generation activity, responsible actor, source snapshot, signing-key version, and package target                  |
| FHIR AuditEvent projection        | The export records issuance, access/download, verification, revocation, status import, and disclosure actions for authorized administrative review |
| Recipient and disclosure registry | Each external disclosure has recipient, purpose, delivery method, requested/approved timestamps, and package linkage                               |
| Consent-evidence reference        | A disclosure can reference an approved consent record, guardian decision, policy exception, or documented non-consent basis                        |
| Security-label policy             | The FHIR Bundle and selected resources receive an explicit confidentiality/purpose-of-use label profile tied to clinic policy                      |
| Redaction report                  | The manifest and human-readable receipt state which redaction policy and field groups were applied                                                 |
| Signed export receipt             | The clinic can issue a signed acknowledgment containing package identity, recipient, purpose, status at issuance, and receipt metadata             |
| Governance workspace              | Administrators can inspect disclosures, evidence, labels, receipts, and unresolved approval requirements                                           |

FHIR security labels provide policy metadata for access-control and handling decisions, but depend on a broader policy and mutual-trust framework [4]. Step 18 will therefore define a small, explicit local label profile and document what an external recipient is expected to do when a label is unrecognized.

## Proposed disclosure workflow

The recommended workflow separates export construction from disclosure authorization.

1. A clinician or authorized staff member requests an export for a defined purpose.
2. The system evaluates role, export format, redaction policy, patient/guardian relationship, recipient category, and existing consent evidence.
3. If the policy requires approval, the package remains `issued` or `pending-disclosure` in the governance layer and cannot be released until an authorized administrator or designated clinical approver records the decision.
4. The exporter creates the redacted FHIR Bundle, Provenance, AuditEvent projection, manifest, signature, and optional status-package reference.
5. The disclosure registry records recipient identity, delivery method, purpose, evidence reference, and package hashes.
6. The system creates a signed export receipt. If the recipient later acknowledges receipt, the acknowledgment is recorded as a separate event rather than rewriting the original receipt.
7. If the package is subsequently revoked or superseded, the registry and signed status-package workflow provide the later status assertion.

The initial release should support manual review and send, matching the clinic’s existing requirement. Automatic external delivery should remain out of scope until recipient identity, transport, and acknowledgment semantics are explicitly approved.

## FHIR Provenance design

The Provenance resource should be generated as part of the signed FHIR Document Bundle or as a companion resource when a selected implementation guide requires a separate document structure. FHIR Provenance targets the resources generated or updated by an activity and identifies associated agents and entities [1].

| Provenance element                     | Step 18 mapping                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`                               | Document Bundle identifier and, where appropriate, selected Patient/Encounter resources by stable reference                                                          |
| `recorded`                             | Export creation timestamp                                                                                                                                            |
| `occurredPeriod` or `occurredDateTime` | Export-generation activity window                                                                                                                                    |
| `activity`                             | Local canonical code for patient-record export generation                                                                                                            |
| `agent`                                | Issuing user, clinic organization, hub device, and signer key reference as separate agents where supported                                                           |
| `entity`                               | Projection snapshot ID/hash, source encounter version, selected FHIR profile bundle, and redaction-policy descriptor                                                 |
| `signature`                            | The existing Ed25519 package signature remains the package-level signature; a FHIR signature representation should be added only if the selected profile requires it |

The Provenance payload must not include private signing keys, recovery material, or unnecessary patient demographics beyond what is already present in the export. Any reference to a local database entity must use an opaque stable identifier or a non-resolvable identifier plus hash, so an external recipient is not given a path into the clinic database.

## FHIR AuditEvent design

AuditEvent should represent security-relevant actions rather than restating the whole clinical history. FHIR R4 identifies AuditEvent as a security log record and notes that audit data is normally restricted to security, privacy, and system-administration personnel [2]. The local audit ledger should remain the source of truth; the FHIR projection should be generated only for approved export-governance use cases.

| Audit event            | When recorded                                       | Minimum fields                                                                |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Export issuance        | Package is successfully created and registered      | Actor, organization, package ID/hash, purpose, redaction policy, outcome      |
| Disclosure approval    | A governance decision authorizes release            | Approver, recipient category, evidence reference, decision, reason            |
| Export download/send   | Package leaves the hub or is marked delivered       | Actor/device, package ID/hash, method, recipient, outcome                     |
| Verification           | The desktop or external verifier checks the package | Verifier identity/context, package hash, signer key, result, status freshness |
| Revocation             | Package is revoked                                  | Actor, package ID/hash, reason, lifecycle event, outcome                      |
| Status import          | Signed status package is imported/accepted/rejected | Actor, status package ID/hash, sequence, issuer key, decision                 |
| Receipt acknowledgment | Recipient acknowledges receipt                      | Actor or recipient identity, receipt ID/hash, package ID, timestamp           |

AuditEvent records must not be editable or deletable through ordinary clinical workflows. Administrative reports may summarize them, but the underlying local audit records remain append-only. The system should avoid putting sensitive free-text reasons or patient details into external AuditEvent projections unless the policy explicitly requires them.

## Recipient and consent-evidence model

The first release should implement a clinic-specific disclosure record, with an optional FHIR Consent projection. The local model needs enough structure to support a decision without pretending to be a universal consent engine.

| Record             | Required data                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Recipient          | Internal recipient ID, display name, organization, role/category, contact channel, verification status           |
| Disclosure request | Patient, package/request ID, requested format, redaction policy, purpose, requested by, requested at             |
| Evidence           | Evidence type, reference, status, effective period, recorded by, reviewer, source document/hash where applicable |
| Decision           | Pending/approved/rejected/exception, decision reason, approver, decided at, required second approval             |
| Delivery           | Package ID/hash, method, sent at, sender/device, recipient, acknowledgment state                                 |
| Receipt            | Receipt ID, package/status hashes, recipient acknowledgment, acknowledged at, signature or confirmation method   |

Consent evidence types should initially include `patient-consent`, `guardian-consent`, `clinical-treatment`, `legal-request`, `administrative-policy`, and `emergency-exception`. The system must require an explicit evidence record for full-identity exports or external recipients unless an administrator-approved policy exception applies.

For minors and related persons, the evidence record must reference the guardian relationship and its verification state. A guardian’s phone number or relationship alone must not be treated as proof of authority. The existing related-person and guardian-link workflow should supply the identity relationship; Step 18 should add the disclosure-specific decision and evidence layer.

## Security-label profile

Step 18 should define a minimal local label profile based on the FHIR R4 concepts of confidentiality, purpose of use, integrity, and handling caveat [4]. Labels should be attached at Bundle level and inherited by resources unless a more restrictive resource-specific label is required.

| Label category  | Initial local policy                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Confidentiality | `R` Restricted for clinical exports; `V` Very Restricted for full-identity exports if approved by policy |
| Purpose of use  | Controlled local code such as treatment, referral, legal request, or patient access                      |
| Integrity       | Signed, snapshot-bound, profile-validated                                                                |
| Handling caveat | Do-not-reuse or retention instruction only when a documented clinic policy supports it                   |

Unknown labels must be treated as a governance warning or rejection according to the selected profile. The recipient-facing README and receipt must state that labels communicate handling requirements but do not enforce them on an untrusted recipient.

## Database migration outline

The preferred migration is Migration 16 unless Step 17 uses that version for a status-package implementation that is not yet present in the repository. The migration should be split if the status-package implementation adds its own schema version.

| Table                      | Purpose                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `export_recipients`        | Verified recipient identities and organizations                                       |
| `export_disclosures`       | Disclosure request, purpose, recipient, package, policy, decision, and delivery state |
| `export_consent_evidence`  | Consent or policy evidence references, effective period, reviewer, and source hash    |
| `export_receipts`          | Signed receipt metadata and acknowledgment state                                      |
| `export_governance_events` | Append-only approval, rejection, send, acknowledgment, and exception events           |

All package references should use the existing `export_packages` package ID and hashes. Any patient foreign key must follow the existing internal-ID/public-EL-ID boundary used by the export registry. External-facing contracts should expose the public patient ID only where disclosure authorization requires it.

## Contracts and authorization

The contracts package should add schemas for recipient, disclosure request, consent evidence, governance decision, security-label policy, receipt, and FHIR provenance/audit projection metadata. New capabilities should preserve least privilege.

| Capability                  | Suggested access                                           |
| --------------------------- | ---------------------------------------------------------- |
| `export.governance.request` | Doctor and administrator; request only                     |
| `export.governance.review`  | Administrator and designated clinical approver             |
| `export.governance.send`    | Administrator or explicitly delegated staff after approval |
| `export.governance.audit`   | Administrator only                                         |
| `export.receipt.manage`     | Administrator and authorized sender                        |

A full export or external-recipient disclosure should require an approval decision before release. Doctors may request and provide clinical context, but the selected policy must make clear whether a doctor, administrator, or both can approve. Dual approval should remain available for full-identity exports, legal requests, and break-glass exceptions.

## Implementation task breakdown

### Task 18.1 — Confirm governance policy decisions

Define recipient categories, approval roles, minor/guardian evidence rules, emergency exception rules, default retention, purpose codes, and whether FHIR Consent is a projection or a required local record. This task must be completed before schema migration because the policy affects required fields and state transitions.

### Task 18.2 — Add contracts and capability matrix

Add Zod schemas, enum vocabularies, redaction-report structures, FHIR Provenance/AuditEvent projection types, recipient/disclosure/receipt types, and authorization tests. Ensure no contract exposes private keys or recovery passphrases.

### Task 18.3 — Add governance database migration

Create recipient, disclosure, evidence, receipt, and governance-event tables with unique constraints, foreign keys, indexes, and append-only event relationships. Add migration regression tests and internal/public patient-ID boundary tests.

### Task 18.4 — Build Provenance and AuditEvent resources

Extend the FHIR Bundle builder with deterministic Provenance and approved AuditEvent projections. Validate required references, actor identifiers, package hashes, snapshot hashes, signer key metadata, and selected profile constraints offline.

### Task 18.5 — Implement disclosure authorization service

Add request, review, approve, reject, exception, send, acknowledge, and receipt lookup workflows. Enforce state transitions and approval requirements transactionally. Prevent package release when evidence or approval is required but missing.

### Task 18.6 — Add security labels and redaction transparency

Add a policy-controlled `meta.security` projection and a machine-readable redaction report. Validate labels against a local code profile and report unknown-label behavior explicitly.

### Task 18.7 — Create signed export receipts

Generate a deterministic receipt containing package ID/hash, manifest hash, status assertion, recipient, purpose, evidence reference, decision, delivery method, and timestamp. Sign the receipt with the versioned clinic key and make it independently verifiable without patient clinical content.

### Task 18.8 — Build administrator governance workspace

Add recipient management, disclosure request review, consent-evidence entry, approval controls, send/acknowledge tracking, receipt export, audit search, and unresolved-approval indicators. Keep patient identity display to the minimum necessary for the decision.

### Task 18.9 — Add external verification and integration tests

Extend the standalone verifier for Provenance/AuditEvent consistency, receipt verification, security-label reporting, status freshness, and disclosure metadata. Add synthetic end-to-end tests for normal referral, patient-access export, guardian-approved minor export, rejected disclosure, emergency exception, full export dual approval, revocation after receipt, and tampered receipt.

### Task 18.10 — Document operational runbook

Document manual review, USB/LAN delivery, recipient verification, consent evidence, receipt acknowledgment, revocation notification, emergency exceptions, audit review, and retention/destruction handling. Include a disconnected-workstation drill using synthetic data.

## Proposed implementation phases

| Phase | Deliverable                        | Exit criteria                                                                                   |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| 18A   | Policy and contracts               | Approval roles, recipient categories, evidence types, and schemas are accepted and tested       |
| 18B   | Persistence and service            | Disclosure state machine, evidence, audit events, and package linkage pass integration tests    |
| 18C   | FHIR governance projection         | Provenance, AuditEvent, security labels, and redaction reports pass offline profile validation  |
| 18D   | Receipts and external verification | Signed receipts are independently verifiable and correctly reflect status/freshness             |
| 18E   | Desktop workspace and runbook      | Administrators can review, approve, send, acknowledge, and audit a synthetic disclosure offline |

## Acceptance criteria

Step 18 should be considered complete only when:

1. Every externally released export has a disclosure record with a recipient, purpose, delivery method, actor, package hash, and decision state.
2. Full-identity and other policy-sensitive exports cannot be released without the required approval and evidence.
3. Minor/guardian disclosures reference a verified related-person relationship and a disclosure-specific evidence record.
4. The FHIR Bundle includes valid Provenance linking the export to its snapshot, actor, organization, profile, and signer key version.
5. Approved audit projections distinguish issuance, approval, sending, verification, revocation, status import, and acknowledgment.
6. Security labels and redaction reports are deterministic, policy-controlled, and clearly described to recipients.
7. A signed export receipt can be independently verified offline and does not contain unnecessary clinical content.
8. Revocation or supersession after delivery is visible through the Step 17 signed status-package workflow.
9. Audit records remain append-only and restricted to authorized administrative/security users.
10. All workflows pass synthetic tests with no real patient data, and the full typecheck, tests, desktop build, formatting, and diff checks pass.

## Open decisions for confirmation

| Decision                | Recommended default                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 18 primary theme   | FHIR Provenance/AuditEvent plus disclosure governance and signed receipts                                                                     |
| Approval authority      | Doctor may request; designated clinical approver or administrator reviews; administrator required for full identity and legal/emergency cases |
| Consent model           | Local evidence record first; generate FHIR Consent as an interoperability projection where useful                                             |
| Minor/guardian rule     | Verified guardian relationship plus explicit disclosure evidence; phone-number match alone is insufficient                                    |
| Default confidentiality | Restricted for clinical exports; Very Restricted for full-identity exports                                                                    |
| External delivery       | Manual send through approved local channels; no automatic internet delivery in first release                                                  |
| Receipt acknowledgment  | Optional for internal use, required when a workflow marks a package as externally delivered                                                   |
| Break-glass             | Explicit reason, approving actor, expiry/retrospective review, and mandatory AuditEvent projection                                            |
| Retention               | Configurable governance retention aligned with package lifecycle; destruction remains administrator-controlled                                |
| Step 17 dependency      | Do not finalize external status semantics until the signed status-package implementation and verifier are complete                            |

## References

[1]: https://hl7.org/fhir/R4/provenance.html "HL7 FHIR R4 Provenance"
[2]: https://hl7.org/fhir/R4/auditevent.html "HL7 FHIR R4 AuditEvent"
[3]: https://hl7.org/fhir/R4/consent.html "HL7 FHIR R4 Consent"
[4]: https://hl7.org/fhir/R4/security-labels.html "HL7 FHIR R4 Security Labels"
[5]: https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final "NIST SP 800-57 Part 1 Revision 5 — Recommendation for Key Management"
