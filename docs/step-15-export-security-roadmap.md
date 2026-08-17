# Step 15 — Export Verification Review and Clinical Export Security Roadmap

## Executive summary

The Step 14 workflow is operational and reproducibly testable. The auth integration test creates a synthetic signed ZIP, writes it to a temporary directory, invokes the standalone verifier as a separate Node process, confirms successful verification, rejects a tampered archive, and rejects a trusted revocation ledger while preserving the archive bytes. The same test installs and selects a synthetic custom profile bundle, validates a clinical export against it, proves that a stricter profile fails when the selected redaction policy omits a required field, and checks profile provenance in the signed manifest.

The current implementation has strong foundations for a local-first clinic: immutable snapshot references, Ed25519 signatures, deterministic ZIP members, redaction policies, profile-bundle provenance, expiration, local revocation, audit events, and safe archive-member handling. The next step should add an **export control plane** around those cryptographic primitives. The highest-value gaps are persistent export inventory, signing-key lifecycle management, signed revocation distribution, hardened profile/package ingestion, and explicit recipient/consent controls.

## Verified integration workflow

The documented Step 14 workflow is implemented as the following sequence.

| Stage                       | Current behavior                                                                                  | Security property                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Profile selection           | An administrator installs or selects a built-in or custom offline R4 profile bundle               | The selected constraints are explicit and auditable                |
| Payload generation          | The exporter builds a redacted FHIR Document Bundle from an immutable projection snapshot         | The export references a stable snapshot hash                       |
| FHIR preflight              | Base R4 checks and selected profile constraints run before ZIP creation                           | Invalid or redaction-incompatible packages are blocked             |
| ZIP creation                | Payload, manifest, signature, README, and canonical profile member are packaged deterministically | Member hashes and package-content hash are signed                  |
| Save and local verification | The desktop process saves the archive and verifies it in-process                                  | The UI can distinguish integrity, expiration, and revocation       |
| External verification       | `tools/verify-export.mjs` extracts and verifies the archive without the application database      | Recipients can independently validate the package offline          |
| Revocation                  | An administrator records a reason in the encrypted local ledger and audit trail                   | Current trust is separate from original cryptographic authenticity |

The archive is self-describing with respect to the selected profile bundle, but the recipient must still trust the profile publisher, source URI, and version for the intended exchange. The profile-bundle mechanism is an offline constrained validator manifest, not a full replacement for all computable FHIR `StructureDefinition`, terminology, slicing, and invariant processing.

## Test and coverage results

The focused Step 14 integration command passed with one export workflow test. The full auth package passed 18 tests across six test files, and the full monorepo passed 29 tests across contracts, database, auth, and desktop packages. The repository now includes `@vitest/coverage-v8` and reproducible `test:coverage` scripts at the root and auth-package levels.

The full auth V8 report was generated at `packages/auth/coverage/index.html` with machine-readable data at `packages/auth/coverage/coverage-final.json`. The full auth-package results are shown below.

| Scope                       | Statements | Branches | Functions |   Lines |
| --------------------------- | ---------: | -------: | --------: | ------: |
| Full `@elite/auth` package  |     85.31% |   65.14% |    90.62% |  85.31% |
| `patient-export-service.ts` |     75.97% |   59.64% |    91.66% |  75.97% |
| `zip-utils.ts`              |     81.59% |   63.63% |   100.00% |  81.59% |
| `fhir-profile-bundles.ts`   |    100.00% |  100.00% |   100.00% | 100.00% |

A focused run containing only `patient-export-service.test.ts` reported 75.97% statements and 59.64% branches for `patient-export-service.ts`. This is useful for identifying untested export branches, but it is not a claim that every line of the application is covered by the single integration test. The next testing increment should raise branch coverage around malformed ZIPs, expired packages, invalid profile bundles, profile-member tampering, key failures, and authorization denials.

## Security and management gap audit

### 1. Export inventory and lifecycle management — highest priority

The current system can create and revoke a package, but it does not maintain a first-class export registry containing every issued archive, its storage path, manifest hash, signer key ID, recipient, retention class, and lifecycle state. Revocation therefore begins with a package ID supplied by the operator rather than an inventory search. There is also no explicit `issued`, `downloaded`, `expired`, `revoked`, `superseded`, or `destroyed` state model.

The next feature should introduce an `export_packages` table and an export-management workspace. It should support searching by patient, snapshot, package ID, creator, date range, format, policy, expiration, and status. Permanent deletion should remain behind the existing administrator workflow and should never erase the audit record.

### 2. Signing-key lifecycle and trust anchors — highest priority

The current Ed25519 key is OS-wrapped, which is appropriate for local protection, but the system does not yet expose key version, rotation, retirement, backup/recovery, or trust-anchor management. A verifier cannot distinguish which signing-key generation signed an archive, and a key compromise would require an operational response that is not yet modeled.

The next feature should add a key-version identifier to every manifest, maintain active and retired key records, support administrator-approved rotation, preserve retired public keys for historical verification, and provide a controlled backup/recovery procedure. The design should follow key-management lifecycle principles rather than treating key generation as a one-time setup [3].

### 3. Revocation distribution and status freshness — high priority

Revocation currently depends on the originating local ledger. An external recipient can verify the archive but cannot know about a later revocation unless the clinic separately supplies a trusted ledger. A signed revocation/status list with a generated-at timestamp, issuer key ID, sequence number, and validity window would make status distribution auditable and usable over USB or LAN synchronization.

### 4. Profile and package ingestion hardening — high priority

Step 14 installs normalized profile JSON, but the next complete-IG importer will need size limits, decompression limits, strict allowlists, filename normalization, safe temporary storage, schema validation, and rejection of unsupported archive members. OWASP specifically highlights authorization, generated safe filenames, content validation, limits, archive-bomb defenses, and storage outside publicly retrievable locations [4]. The same protections should apply if the clinic later imports a full national IG ZIP, signed profile package, or external revocation list.

### 5. FHIR Provenance and AuditEvent export — high priority

The current application audit trail is local and operational. The FHIR document currently carries snapshot and profile metadata, but it does not yet emit explicit FHIR `Provenance` and `AuditEvent` resources describing who generated, signed, accessed, verified, or revoked the package. FHIR distinguishes Provenance as the origin/process record and AuditEvent as an event record, which maps cleanly onto this workflow [1] [2].

A future profile should include a Provenance resource targeting the document Bundle and an AuditEvent resource for export issuance. Revocation and verification events should remain in the local audit ledger and may be emitted as separate operational records or a signed status package.

### 6. Recipient, consent, and purpose-of-use controls — high priority

`exportReason` is currently an operator-entered explanation, not a recipient authorization or patient-consent decision. The next export-management model should support recipient identity, delivery method, purpose of use, consent reference, minimum-necessary policy, and optional second-admin approval for full exports or external recipients. FHIR security guidance emphasizes that patient-sensitive information requires access control and that purpose, sensitivity, and context may affect authorization [1].

### 7. Time and expiration robustness — medium priority

Expiration uses an application timestamp and the verifier’s wall clock. The system should record clock source and apply a configurable clock-skew tolerance, especially for offline Windows and Android devices. FHIR security guidance calls out synchronized clocks and robustness to incorrect system time [1]. A package should report `valid`, `expired`, `clock-uncertain`, and `revoked` separately rather than reducing all status conditions to one Boolean.

### 8. Security labels and redaction transparency — medium priority

The redaction policy is present in the manifest, but the FHIR Bundle does not yet carry a standardized confidentiality/security label or a human-readable redaction report. The next feature should add a machine-readable redaction summary, a profile compatibility preview, and optional security labels that are mapped only when the clinic’s authoritative policy is defined. FHIR describes security labels as inputs to access-control decisions, not as a substitute for authorization [1].

## Prioritized next feature set

### Release A — Export Control Plane and Trust Foundation

This should be the next implementation phase because it closes the most important operational and security gaps without requiring cloud services.

| Priority | Feature                                  | Core deliverable                                                                     | Main acceptance criteria                                                                                                                            |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Export registry and lifecycle            | `export_packages` table, management UI, retention/status state machine               | Every issued ZIP/detached package is registered; operators can search, inspect, expire, revoke, supersede, and archive without losing audit history |
| P0       | Signing-key lifecycle                    | Key-version metadata, rotation, retired-key verification, backup/recovery runbook    | New exports identify a signer key version; old packages remain verifiable after rotation; retired keys cannot sign new packages                     |
| P0       | Signed revocation/status list            | Versioned signed ledger export/import with sequence and validity window              | Offline recipients can verify current package status from a trusted status file; stale lists are reported explicitly                                |
| P0       | Archive/profile ingestion hardening      | Limits, safe temporary storage, schema/size checks, ZIP-bomb and traversal defenses  | Oversized, malformed, duplicate, unsupported, or dangerous packages fail before parsing or persistence                                              |
| P1       | FHIR Provenance and AuditEvent resources | Add issuance Provenance and export AuditEvent resources to the FHIR document profile | The Bundle identifies the generating activity, responsible actor, timestamp, snapshot, and signing key version                                      |
| P1       | Recipient and consent workflow           | Recipient, purpose, consent reference, delivery method, and optional dual approval   | Sensitive/full exports cannot be issued without the required authorization evidence                                                                 |

### Release B — Interoperability and Clinical Governance

After Release A, the application should import complete national IG publisher output, map StructureDefinitions and value sets into a versioned local registry, and report unsupported constraints before an export is attempted. This release should also add profile compatibility previews, security labels, redaction explanations, recipient acknowledgement, and signed export receipts.

### Release C — Resilience and Cross-Device Trust

The later release should extend the same lifecycle to Android and LAN synchronization. It should provide signed status-list synchronization, conflict-safe export registry replication, device trust records, offline verification using trusted key bundles, and recovery testing after hub restoration. Android should never receive private signing keys unless a deliberate multi-device signing design is approved; the safer default is hub-only signing with Android verification and controlled export requests.

## Recommended implementation order

The recommended next coding sequence is to implement the export registry and status machine first, then key-versioned signing, then signed revocation-list export/import, then ingestion hardening, and finally FHIR Provenance/AuditEvent resources. Each increment should add synthetic integration tests and a coverage threshold for changed security-critical modules. The current `patient-export-service.ts` branch coverage of approximately 60% is the first measurable target: new tests should raise it above 75% before adding full national StructureDefinition ingestion.

## References

[1]: https://hl7.org/fhir/R4/security.html "HL7 FHIR R4 Security"
[2]: https://hl7.org/fhir/R4/provenance.html "HL7 FHIR R4 Provenance"
[3]: https://csrc.nist.gov/projects/key-management/key-management-guidelines "NIST Key Management Guidelines"
[4]: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html "OWASP File Upload Cheat Sheet"
