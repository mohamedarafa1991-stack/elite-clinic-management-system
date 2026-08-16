# Step 12 — Signed Patient-Record Exports

## Scope

This increment adds user-facing PDF and FHIR JSON export packages for immutable effective encounter projections. Each package contains a payload, a JSON manifest, and a detached signature file. The package is derived from a previously created projection snapshot, so the exported clinical state is tied to an immutable snapshot ID and payload hash.

## Redaction policies

| Policy   | Included identity data                                             | Clinical data                                       | Sensitive permission                    |
| -------- | ------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------- |
| Minimal  | Stable patient display ID only                                     | Effective encounter note                            | `export.manage`                         |
| Clinical | Patient name, date of birth, and sex                               | Effective encounter note and active medical history | `export.manage`                         |
| Full     | Clinical identity fields plus phone and national ID when available | Effective encounter note and active medical history | `export.manage` plus `export.sensitive` |

The default renderer policy is Clinical. Full exports are unavailable to roles without the dedicated sensitive-export capability. Redaction is enforced in the service layer as well as the UI, so a renderer or IPC caller cannot bypass the policy by changing a form value.

## Package format

A signed export consists of three files:

| File      | Contents                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payload   | PDF document or FHIR R4-style document Bundle.                                                                                                                |
| Manifest  | Schema version, package ID, snapshot ID, snapshot payload hash, payload hash, redaction policy, export reason, creator, timestamp, public key, and signature. |
| Signature | Detached base64 Ed25519 signature copied from the manifest for simple external tooling.                                                                       |

The PDF includes the redaction policy, snapshot ID, effective version, amendment count, and snapshot payload hash. The FHIR Bundle places the snapshot hash in an identifier extension and includes the effective encounter in a `ClinicalImpression` resource. Active medical-history entries are represented as `FamilyMemberHistory` resources in the current export increment.

## Signing and verification

The desktop generates an Ed25519 key pair on first use and stores the private key encrypted through Electron safeStorage. The public key is embedded in each manifest. The signature covers a canonical manifest subset containing package identity, snapshot hash, payload hash, format, redaction policy, export reason, timestamp, and creator. The payload itself is hashed with SHA-256.

The external verifier requires only Node.js and the exported manifest and payload files:

```bash
node tools/verify-export.mjs patient.manifest.json patient.fhir.json
```

It validates the payload SHA-256 hash, the detached Ed25519 signature, and the presence of the signed snapshot hash in the payload. It exits with status zero only when all three checks pass. It does not require access to the clinic database or private signing key.

## Audit and privacy boundaries

Export creation requires `export.manage`, a snapshot ID, and a mandatory export reason. The payload is written to the user-selected destination with restrictive local file permissions. The private signing key never crosses the preload boundary, is never returned to the renderer, and is not included in the package. Operational logs should contain only export metadata and hashes, not clinical text or sensitive identity values.

## Remaining export scope

Future work should add formal FHIR profile validation, PDF redaction watermarking, export access review and revocation, signed package ZIP assembly, external public-key distribution, export expiration policies, configurable organization identifiers, and redaction controls for diagnoses, attachments, medications, and related-person records.
