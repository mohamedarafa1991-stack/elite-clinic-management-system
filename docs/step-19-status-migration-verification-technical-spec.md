# Step 19 Technical Specification: Status Migration 16 and Verification Logic

## 1. Scope and design decision

This specification defines the database and verification foundation for Step 19. The feature creates and consumes **metadata-only signed status packages** for export lifecycle assertions. The package is intentionally separate from a clinical export: it contains no patient ID, name, phone number, FHIR resource, PDF, or recovery-bundle material.

The Windows Hub remains the issuer and authoritative source for status assertions. The Android client and the dependency-free external verifier are consumers. Android must verify status packages offline, persist only the last trusted snapshot and the minimum queryable metadata, and never receive an Ed25519 private key.

The database is currently at migration 15. Step 19 adds **migration 16**. The migration must be append-only and must not modify or reinterpret existing export registry, governance, signer, or revocation records.

## 2. Terminology

| Term             | Definition                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Status package   | Deterministic signed ZIP containing a status manifest, metadata-only entries, signature, and verification instructions   |
| Candidate        | A status package received but not yet accepted as the trusted local snapshot                                             |
| Trusted snapshot | The highest accepted status package for an organization that passed all acceptance checks                                |
| Trust anchor     | An explicitly accepted organization/key ID/version/public-key record used to verify status packages                      |
| Sequence         | Monotonically increasing issuer counter scoped to an organization                                                        |
| Freshness        | Evaluation of `generatedAt` and `validUntil`, independent of signature validity                                          |
| Quarantine       | Terminal or review-required state for a candidate that cannot replace trusted state                                      |
| Status assertion | The lifecycle state reported for a particular export package, such as `stored`, `downloaded`, `revoked`, or `superseded` |

## 3. Status-package wire profile

The canonical ZIP contains exactly four members:

| Member                 | Required content                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `status-manifest.json` | Signed manifest metadata, organization identity, sequence, validity window, hashes, issuer key ID/version, and schema version |
| `status-entries.json`  | Canonical array of metadata-only export status entries                                                                        |
| `status-signature.sig` | Base64 Ed25519 signature over the canonical descriptor bytes                                                                  |
| `README.txt`           | Human-readable instructions with no patient identity or clinical content                                                      |

The writer must reject any additional member by default. A future profile may add a member only by incrementing the schema version and updating the verifier allow-list.

### 3.1 Manifest schema

The shared contract should define `exportStatusManifestSchema` with the following fields:

| Field                | Type and constraints                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| `schemaVersion`      | Literal `1`                                                                        |
| `packageId`          | Opaque ID, unique within the organization                                          |
| `organizationId`     | Canonical organization identifier; must match the configured Elite Clinic identity |
| `sequence`           | Positive integer; monotonic per organization                                       |
| `issuerKeyId`        | Opaque key ID matching the trust anchor                                            |
| `issuerKeyVersion`   | Positive integer                                                                   |
| `signatureAlgorithm` | Literal `ed25519`                                                                  |
| `generatedAt`        | ISO timestamp                                                                      |
| `validUntil`         | ISO timestamp strictly later than `generatedAt`                                    |
| `previousStatusHash` | Optional lowercase SHA-256 hash; required after the first accepted package         |
| `entriesHash`        | Lowercase SHA-256 hash of canonical `status-entries.json` bytes                    |
| `packageHash`        | Lowercase SHA-256 hash of the canonical package descriptor                         |
| `signatureBase64`    | Strict Base64 Ed25519 signature; exact decoded length must be enforced             |
| `entryCount`         | Nonnegative bounded integer matching parsed entries                                |

Input limits must be explicit. The initial profile should cap the complete ZIP at 16 MiB, `status-entries.json` at 8 MiB, the entry count at 100,000, each member name at 128 bytes, each reason code at 160 characters, and the README at 16 KiB. The verifier must fail before allocating unbounded decompression or parsing buffers.

### 3.2 Entry schema

Each `exportStatusEntrySchema` contains only:

```text
packageId
manifestHash
status
statusChangedAt
lifecycleEventId
reasonCode?
disclosureState?
receiptState?
```

`status` uses the existing export lifecycle enum. `manifestHash` is the hash of the signed export manifest, not the clinical payload. `disclosureState` and `receiptState` use bounded enums and do not include recipient names, patient IDs, consent source text, or delivery addresses.

The entries array must be sorted by `packageId` using bytewise UTF-8 ordering. Duplicate package IDs are invalid. The verifier must recompute `entryCount` and `entriesHash` from the parsed canonical bytes.

## 4. Canonical signing profile

The status signature covers the following canonical JSON descriptor:

```json
{
  "schemaVersion": 1,
  "packageId": "...",
  "organizationId": "...",
  "sequence": 1,
  "issuerKeyId": "...",
  "issuerKeyVersion": 1,
  "generatedAt": "...",
  "validUntil": "...",
  "previousStatusHash": "...",
  "entriesHash": "...",
  "entryCount": 0
}
```

The actual implementation must use the repository’s deterministic JSON serializer, UTF-8 bytes, no whitespace, stable key ordering, and normalized ISO timestamp strings. The placeholders above represent ordinary ISO timestamp strings in production.

The package hash is computed over the canonical descriptor **without** `signatureBase64` and without filesystem paths. The signature is calculated over the same descriptor bytes. The manifest stores the resulting hashes and signature. ZIP timestamps and compression metadata must be deterministic or excluded from signed material.

## 5. Migration 16 schema

Migration 16 adds five tables and the associated indexes. Status records deliberately do not foreign-key to the private signer table because Android and an external verifier need to hold public trust anchors independently.

### 5.1 `export_status_packages`

```sql
CREATE TABLE export_status_packages (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  issuer_key_id TEXT NOT NULL,
  issuer_key_version INTEGER NOT NULL CHECK (issuer_key_version > 0),
  generated_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  previous_status_hash TEXT CHECK (previous_status_hash IS NULL OR length(previous_status_hash) = 64),
  entries_hash TEXT NOT NULL CHECK (length(entries_hash) = 64),
  package_hash TEXT NOT NULL CHECK (length(package_hash) = 64),
  source TEXT NOT NULL CHECK (source IN ('hub-created', 'usb-import', 'lan-import', 'android-import', 'external-import')),
  acceptance_state TEXT NOT NULL CHECK (acceptance_state IN ('pending', 'accepted', 'rejected', 'superseded', 'quarantined')),
  source_reference TEXT,
  accepted_at TEXT,
  accepted_by_user_id TEXT REFERENCES users(id),
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, package_hash)
);
```

The migration must add indexes on `(organization_id, sequence DESC)`, `(organization_id, acceptance_state)`, and `(organization_id, package_id)`. A partial unique index must enforce at most one accepted trusted snapshot per organization:

```sql
CREATE UNIQUE INDEX idx_export_status_one_accepted
ON export_status_packages(organization_id)
WHERE acceptance_state = 'accepted';
```

The service, rather than a broad SQL constraint, rejects a conflicting same-sequence package with a different hash and records the candidate in the import queue.

### 5.2 `export_status_entries`

```sql
CREATE TABLE export_status_entries (
  id TEXT PRIMARY KEY NOT NULL,
  status_package_id TEXT NOT NULL REFERENCES export_status_packages(id),
  export_package_id TEXT NOT NULL REFERENCES export_packages(package_id),
  manifest_hash TEXT NOT NULL CHECK (length(manifest_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('issued', 'stored', 'downloaded', 'expired', 'revoked', 'superseded', 'archived', 'destroyed')),
  status_changed_at TEXT NOT NULL,
  lifecycle_event_id TEXT,
  reason_code TEXT,
  disclosure_state TEXT CHECK (disclosure_state IS NULL OR disclosure_state IN ('none', 'requested', 'approved', 'sent', 'acknowledged', 'rejected', 'cancelled')),
  receipt_state TEXT CHECK (receipt_state IS NULL OR receipt_state IN ('none', 'issued', 'acknowledged')),
  UNIQUE (status_package_id, export_package_id)
);
```

The service must verify that `manifest_hash` is a known hash for the referenced package when the Hub creates a status package. An Android import may store the entry without a local export package row, so the foreign key must be implemented as a local Hub-only table or represented by a nullable `export_package_id` in the Android Room equivalent. The cross-platform wire profile uses `packageId`, not a database foreign key.

### 5.3 `export_status_events`

```sql
CREATE TABLE export_status_events (
  id TEXT PRIMARY KEY NOT NULL,
  status_package_id TEXT NOT NULL REFERENCES export_status_packages(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'imported', 'verified', 'accepted', 'rejected', 'superseded', 'quarantined')),
  reason TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  occurred_by_user_id TEXT REFERENCES users(id),
  occurred_by_device_id TEXT,
  audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id)
);
```

### 5.4 `export_trust_anchors`

```sql
CREATE TABLE export_trust_anchors (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  public_key_pem TEXT NOT NULL,
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  state TEXT NOT NULL CHECK (state IN ('pending', 'accepted', 'retired', 'revoked')),
  source TEXT NOT NULL CHECK (source IN ('local-signer', 'admin-import', 'signed-trust-bundle')),
  accepted_by_user_id TEXT REFERENCES users(id),
  accepted_at TEXT,
  retired_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, key_id, key_version),
  UNIQUE (organization_id, fingerprint)
);
```

A trust anchor is accepted only after parsing the Ed25519 public key, recomputing its fingerprint and key ID, checking the organization binding, and recording the approving administrator. Retired anchors remain available for historical verification; revoked anchors cannot validate newly accepted status packages.

### 5.5 `export_status_import_queue`

```sql
CREATE TABLE export_status_import_queue (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT,
  candidate_package_hash TEXT NOT NULL UNIQUE CHECK (length(candidate_package_hash) = 64),
  source TEXT NOT NULL CHECK (source IN ('usb-import', 'lan-import', 'android-import', 'external-import')),
  source_reference TEXT,
  received_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('received', 'verifying', 'accepted', 'rejected', 'quarantined')),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  last_error_code TEXT,
  last_error_detail TEXT,
  processed_status_package_id TEXT REFERENCES export_status_packages(id),
  quarantined_at TEXT
);
```

The queue stores metadata and a safe source reference, not unbounded raw archive bytes. If a retained archive is required for forensic review, it must be copied to an application-controlled directory using a generated safe filename and separately bounded by the same import limits.

## 6. Verification API

The shared TypeScript API should expose a pure verifier that does not require the application database:

```ts
verifyStatusPackage(
  archive: Uint8Array,
  options: {
    trustedAnchors: readonly ExportTrustAnchor[];
    organizationId: string;
    now: string;
    trustedSequence?: number;
    trustedPackageHash?: string;
  },
): ExportStatusVerificationResult;
```

The result must be schema-validated and include independent fields:

```text
accepted
signatureValid
contentHashValid
organizationValid
trustAnchorValid
sequenceValid
freshness: current | stale | not-yet-valid | unknown
statusAssertion: current | revoked | superseded | expired | unavailable
packageId?
sequence?
packageHash?
issuerKeyId?
issuerKeyVersion?
reasonCode
```

The result must never return a patient identifier because the input profile does not contain one. Errors should use stable machine-readable codes such as `STATUS_ZIP_LIMIT_EXCEEDED`, `STATUS_MEMBER_UNEXPECTED`, `STATUS_SCHEMA_UNSUPPORTED`, `STATUS_SIGNATURE_INVALID`, `STATUS_TRUST_ANCHOR_UNKNOWN`, `STATUS_ORGANIZATION_MISMATCH`, `STATUS_SEQUENCE_ROLLBACK`, `STATUS_SEQUENCE_CONFLICT`, `STATUS_STALE`, and `STATUS_PATIENT_FIELD_PRESENT`.

## 7. Acceptance transaction

Candidate acceptance is a database transaction with the following order:

1. Validate file size, ZIP structure, member allow-list, decompression limits, and duplicate-member rules.
2. Parse and validate manifest and entries.
3. Recompute canonical entries bytes, entry count, entries hash, package hash, and signature bytes.
4. Resolve the organization and issuer trust anchor; recompute public-key fingerprint and key ID.
5. Verify Ed25519 signature and timestamp/freshness semantics.
6. Compare sequence and previous-status hash with the current accepted snapshot.
7. Insert the candidate status package, entries, and verification event.
8. If accepted, mark the prior trusted package superseded, mark the candidate accepted, and insert acceptance and supersession events with separate audit IDs.
9. If rejected or quarantined, preserve the candidate/import queue record and do not modify the trusted snapshot.
10. Commit only after every state and audit row succeeds.

Same-package re-imports are idempotent by `(organization_id, package_hash)`. A different hash with the same sequence is a conflict and must be quarantined. A lower sequence is a rollback and must be rejected unless an explicit recovery workflow is introduced in a later step.

## 8. Android Room equivalent

Android uses a separate Room database and does not open or copy the Windows SQLite file. The Room model mirrors the wire profile and stores:

- Trusted status package metadata and one accepted snapshot per organization.
- Status entries keyed by package ID and manifest hash.
- Public trust anchors with acceptance state and fingerprint.
- Import events and quarantine records.
- No raw clinical payload and no private key material.

The Android repository reads only from Room. Imports are parsed and verified in a worker or background dispatcher, then accepted through a Room transaction. Failed imports leave the previous trusted snapshot untouched. This local-first pattern follows Android’s recommendation that local storage is the canonical source for reads and that network or Hub synchronization updates the local source before UI consumers observe changes [1].

## 9. External verifier behavior

Add `tools/verify-status-package.mjs` rather than overloading the clinical-export verifier. The tool must accept a ZIP path, trusted public-key/trust-anchor JSON, organization ID, optional current snapshot metadata, and an optional `--json` output mode. It must operate without the application database, Node package imports, internet, or filesystem writes by default.

Human output should display signature, content, issuer, organization, sequence, freshness, and acceptance separately. JSON output must match the shared result vocabulary. The tool must exit nonzero for malformed, tampered, wrong-organization, unknown-key, rollback, or rejected packages and may exit zero for valid current or valid-but-stale packages when the caller requests reporting rather than acceptance.

## 10. Cross-language test vectors

Commit synthetic vectors under `packages/contracts/test-vectors/status/` or a dedicated `tools/test-vectors/status/` directory. Each vector includes the ZIP, trusted-anchor input, expected canonical descriptor hash, and expected result.

| Vector                             | Expected result                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Valid current                      | Signature/content/trust/organization/sequence valid; freshness current; accepted true |
| Valid stale                        | Cryptographically valid; freshness stale; accepted false for replacement              |
| Wrong public key                   | Signature invalid; trusted anchor invalid                                             |
| Retired key                        | Historical verification allowed; new acceptance rejected                              |
| Revoked key                        | Verification rejected for acceptance                                                  |
| Tampered entries                   | Content hash invalid and signature invalid or descriptor mismatch                     |
| Wrong organization                 | Organization invalid; candidate rejected                                              |
| Lower sequence                     | Sequence rollback; previous trusted snapshot retained                                 |
| Same sequence, different hash      | Sequence conflict; candidate quarantined                                              |
| Duplicate member or path traversal | ZIP structure rejected before parsing                                                 |
| Oversized member                   | Resource-limit error before decompression exhaustion                                  |
| Patient identifier field           | Schema/profile rejection; no database replacement                                     |
| Idempotent re-import               | Existing accepted package returned without duplicate state                            |

TypeScript and Kotlin must consume the same canonical vectors. A failing cross-language vector blocks release.

## 11. Implementation task list

| ID  | Task                                                            | Primary files                                                             |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 19A | Add contracts and stable verifier result/error codes            | `packages/contracts/src/index.ts`                                         |
| 19B | Add migration 16, indexes, constraints, and migration tests     | `packages/database/src/index.ts`, `index.test.ts`                         |
| 19C | Implement canonical status writer and ZIP profile               | `packages/auth/src/status-package-service.ts`, `zip-utils.ts`             |
| 19D | Implement pure verifier and acceptance policy                   | `packages/auth/src/status-package-verifier.ts`                            |
| 19E | Add trust-anchor and import queue service methods               | `packages/auth/src/status-package-service.ts`                             |
| 19F | Add desktop IPC/preload handlers and administrator UI           | `apps/desktop/src/main/index.ts`, `preload/index.ts`, `renderer/main.tsx` |
| 19G | Add dependency-free external verifier                           | `tools/verify-status-package.mjs`                                         |
| 19H | Add Kotlin Room entities, DAOs, canonicalizer, and verifier     | `apps/android/app/src/main/java/...`                                      |
| 19I | Add Android import UI, status dashboard, and WorkManager worker | Android presentation and worker packages                                  |
| 19J | Add cross-platform vectors and integration tests                | contracts/auth/desktop/Android test sources                               |
| 19K | Add USB/LAN exchange and key-rotation runbook                   | `docs/step-19-status-exchange-runbook.md`                                 |

## 12. Acceptance criteria

Step 19 migration and verification work is complete when:

1. A fresh database applies migrations 1–16, and an existing migration-15 database upgrades without data loss.
2. A synthetic Windows status package contains no patient identity or clinical payload fields.
3. The TypeScript verifier, external verifier, and Kotlin verifier agree on every checked-in vector.
4. A valid current package can be accepted and queried by package ID.
5. A valid stale package is reported as stale and cannot replace current trusted state silently.
6. Wrong-key, revoked-key, wrong-organization, tampered, rollback, conflict, oversized, duplicate-member, and path-traversal packages are rejected or quarantined with stable error codes.
7. Same-hash re-import is idempotent and does not create duplicate accepted state.
8. Rejected or quarantined imports never modify the last trusted snapshot.
9. Trust-anchor acceptance, retirement, revocation, import, rejection, quarantine, acceptance, and supersession are auditable.
10. Android stores only the minimum metadata required for offline status lookup and never receives private signing-key or recovery-bundle material.

## References

[1]: https://developer.android.com/topic/architecture/data-layer/offline-first "Android Developers — Build an offline-first app"
[2]: https://mas.owasp.org/MASVS/05-MASVS-STORAGE/ "OWASP MASVS — Storage"
[3]: https://mas.owasp.org/MASVS/ "OWASP Mobile Application Security Verification Standard"
