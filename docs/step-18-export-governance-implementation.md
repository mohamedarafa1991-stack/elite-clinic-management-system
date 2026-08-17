# Step 18: Export Governance and FHIR Provenance Implementation

## Purpose

Step 18 establishes the first operational layer for governed clinical-record disclosure. It builds on the persistent export registry and versioned Ed25519 signer introduced in Step 16 and the signed status-package specification prepared in Step 17.

The implementation provides a local-first workflow for registering recipients, recording consent or policy evidence, approving disclosures, recording delivery, issuing signed export receipts, and acknowledging receipt. FHIR exports now include provenance, audit, composition, and security-label resources that explain how the document was created and which redaction policy governed it.

## Contract and capability foundation

The shared contract package now defines recipient categories and verification status, consent-evidence types and lifecycle, disclosure purposes and delivery methods, disclosure decisions, signed receipt fields, security labels, and FHIR governance metadata. The new capabilities are separated by workflow risk:

| Capability                  | Intended users                            | Purpose                                                                                |
| --------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `export.governance.request` | Admin, Doctor, selected operational roles | Register recipients, record evidence, request disclosures, and read governance records |
| `export.governance.review`  | Admin and clinical approvers              | Verify recipients, approve or reject evidence, and decide disclosure requests          |
| `export.governance.send`    | Admin and authorized operational roles    | Mark an approved disclosure as sent and link it to package delivery lifecycle          |
| `export.receipt.manage`     | Admin                                     | Issue and acknowledge signed export receipts                                           |

Review operations require both the capability and either administrator status or the persisted `is_clinical_approver` flag. A phone-number match does not establish guardian authority; guardian evidence requires an active, verified guardian relationship with consent authorization.

## Persistence

Migration 15 adds the following tables:

| Table                      | Role                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `export_recipients`        | Recipient identity, organization, category, contact channel, and verification state                                           |
| `export_consent_evidence`  | Patient-linked consent, treatment, legal, administrative, or emergency evidence and review state                              |
| `export_disclosures`       | One governed disclosure request per export package, including purpose, delivery, decision, evidence, and acknowledgment state |
| `export_receipts`          | Hash-bound, signer-versioned, Ed25519-signed disclosure receipt                                                               |
| `export_governance_events` | Append-only workflow events linked to the existing `audit_events` ledger                                                      |

The schema uses foreign keys to users, patients, related persons, export packages, export signing keys, and audit events. Hash fields are constrained to lowercase SHA-256 values, signer versions must be positive, and receipt/disclosure uniqueness prevents duplicate governed records for the same package or disclosure.

## Disclosure workflow

The implemented service follows this sequence:

1. Create a recipient in an unverified state.
2. Verify or reject the recipient through an administrator or clinical-approver review.
3. Record evidence against the public patient identifier. Guardian evidence additionally checks relationship, guardian flag, consent authority, and verification status.
4. Review the evidence and approve or reject it.
5. Request a disclosure for a registered package, verified recipient, purpose, delivery method, and optional evidence reference.
6. Require approved evidence for full redaction exports, external recipient categories, and higher-risk purposes such as referral, legal, administrative, emergency, and patient-access disclosure.
7. Approve or reject the disclosure.
8. Mark the approved disclosure as sent. For issued or stored packages, this atomically records a `stored → downloaded` package lifecycle transition and a separate lifecycle audit event.
9. Issue a signed receipt containing package and manifest hashes, recipient and purpose, signer key ID/version, lifecycle status at issuance, issuer, receipt hash, and signature.
10. Acknowledge the receipt, preserving the original signed receipt and adding an acknowledgment timestamp.

Every state-changing operation writes an application audit event and an append-only governance event inside the same database transaction as the state change.

## Signed receipt profile

Receipt canonicalization is deterministic and excludes mutable acknowledgment state. The signed descriptor includes:

```text
schemaVersion
receiptId
disclosureId
packageId
recipientId
purposeOfUse
packageHash
manifestHash
signerKeyId
signerKeyVersion
statusAtIssuance
issuedAt
issuedByUserId
```

The receipt hash is SHA-256 over this canonical descriptor. The Ed25519 signature covers the same canonical bytes. `verifyExportReceipt()` reconstructs the descriptor, checks the receipt hash, and verifies the signature against a trusted public key supplied by the caller. Tampering with package hashes, recipient identifiers, purposes, signer metadata, status, or issuer fields causes verification failure.

## FHIR governance projection

FHIR document exports now include:

- A `Composition` resource describing the final patient-summary document.
- A `Provenance` resource targeting the export `Bundle`, with the exporting user and device as agents, the projection snapshot hash as source evidence, and the redaction policy as a second source entity.
- An `AuditEvent` resource describing local-hub export creation, actor/requestor information, source site, outcome, and snapshot entity.
- FHIR security labels on the `Bundle` and clinical resources. The current first increment maps full exports to confidentiality code `V` and other policies to `R`, and adds the local `SIGNED-SNAPSHOT` integrity label.
- A redaction-summary extension on the Bundle identifier explaining that the document is snapshot-bound and governed by the selected policy.

The offline validator now performs basic structural validation for Composition, Provenance, and AuditEvent and reports their standard R4 profile identifiers along with the existing clinic export profile.

## Desktop integration

The Electron main process exposes context-isolated IPC handlers for recipient management, evidence recording and review, disclosure request and decision, delivery, receipt issuance, receipt acknowledgment, and governance listing. The renderer includes an administrator governance panel that provides a compact local workflow for the first increment while keeping encrypted signer recovery material outside the governance controls.

## Tests

Synthetic coverage includes:

- Migration 15 application and table presence.
- Verified-recipient and consent-evidence policy enforcement.
- Disclosure request, approval, send, and acknowledgment lifecycle.
- Package lifecycle transition from stored to downloaded during delivery.
- Signed receipt issuance and listing.
- Standalone receipt verification and tamper rejection.
- FHIR Composition, Provenance, AuditEvent, and `SIGNED-SNAPSHOT` security-label presence.
- Existing signer rotation, recovery hardening, export registry, ZIP verification, and all prior clinical workflow tests.

## Scope limits and next increment

This increment does not treat a recipient record as a legal identity proof, does not automate external delivery, and does not infer consent from a shared phone number. It also does not yet provide an offline national terminology service for all security-label codes or a multi-signature approval requirement for exceptionally sensitive disclosures.

The next Step 18 increment should add policy administration for purpose-specific evidence requirements, a full disclosure-history view, receipt verification in the external command-line verifier, explicit FHIR governance metadata on signed status packages, and Android-compatible governance synchronization records.
