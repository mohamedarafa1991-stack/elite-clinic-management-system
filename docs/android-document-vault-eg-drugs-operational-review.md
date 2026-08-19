# Android Document Vault, eg-drugs, and Operational Hardening Review

**Review date:** 18 August 2026
**Repository baseline:** `8c62555` — `Update Android document deployment milestones`
**Author:** **Manus AI**

## Executive assessment

The Android doctor-document path has a strong security foundation: device identity remains in Android Keystore, each document operation creates a short-lived authenticated LAN session, the Hub certificate is pinned, the session is transcript-bound, encrypted frames enforce ordered AES-GCM counters, and session keys are zeroized when the session closes.[1] [2] [3] The Android application also avoids Room and filesystem persistence for doctor-document bytes, and the viewer explicitly clears its in-memory document object when closed or disposed.[4]

The implementation should nevertheless be described as **secure in design but not yet physically device-verified**, and the document payload path is bounded but not a true streaming design. Upload now uses a binary encrypted frame with metadata-only canonical JSON and mutable raw content bytes; download parses raw decrypted bytes without a document-bearing JSON object or Base64 content string. Temporary managed-runtime copies remain a best-effort cleanup risk on lower-memory devices and must be tested before clinical deployment.

The `eg-drugs` catalog is now represented by the staged reference-data foundation and Admin review workflow, including the migration-22 catalog entities and approved-snapshot boundary. The operational import remains a controlled milestone: the upstream repository presents a large, flat, non-release dataset with a README-described non-commercial usage limitation and no published releases.[10] [11] Elite must not silently import the moving `main` branch or distribute raw source data to Android. The remaining product work is to pin an upstream commit and source-file hash, validate and review candidate data, preserve the previous approved catalog for rollback, resolve licensing, and distribute only an approved snapshot.

Operationally, the highest-priority remaining blockers are physical LAN/device testing, Windows packaging and native-module validation, encrypted backup/restore, certificate and device lifecycle procedures, Android signing/update evidence, and the synthetic-data pilot. The project should remain in **advanced pre-pilot** status until these gates produce evidence rather than source-only assurances.[6] [7] [8]

## 1. Android secure document-session architecture

### 1.1 Session establishment and identity binding

The Android UI selects an active enrollment profile from the existing encrypted Room connection-profile table. The profile is usable only when its state is active, its session and offline-access windows have not expired, and its allowed-scope list is valid. No doctor-document entity is stored in Room; the profile is connection metadata, not document persistence.[4]

For every document view or upload, the application creates a fresh `LanSyncSessionFactory` session. The session-init descriptor binds the protocol version, organization, enrollment, device, user, session ID, request nonce, requested scopes, client counters, device public-key fingerprint, ephemeral public-key fingerprint, and request time. The long-lived P-256 device identity key signs the canonical descriptor while remaining non-exportable in Android Keystore.[1]

The Hub grant is checked against the local policy and request: protocol, organization, enrollment, device, user, session, nonce, and granted scopes must match. The Android client then verifies the Hub’s Ed25519 signature, the server ephemeral-key fingerprint, the transcript hash, and the key-confirmation MAC. The session validity window must be future-valid, no longer than five minutes, and no later than either the enrollment expiry or offline-access expiry.[1]

### 1.2 TLS and encrypted frames

The LAN transport fails closed unless the endpoint is HTTPS. It builds a trust store containing the configured Hub certificate and requires both the expected hostname and an exact byte-for-byte match of a peer certificate. Redirects are rejected, unauthorized/forbidden responses are treated as security failures, and transient HTTP failures such as timeout, 429, or 5xx are classified separately.[5]

After P-256 ECDH, HKDF-SHA-256 derives separate client-to-Hub, Hub-to-client, and key-confirmation keys using the transcript hash and domain-separated labels. Each frame uses AES-256-GCM. Its 12-byte nonce is formed from a four-byte session prefix plus an eight-byte monotonic counter. The authenticated data covers the protocol version, message type, session ID, direction, counter, and nonce. The receiver requires the exact next counter, rejecting replay, gaps, direction mismatches, nonce mismatches, AAD tampering, invalid tags, and authentication failures.[2]

`SessionFrameCodec.close()` marks the codec closed and overwrites the nonce prefix, send key, and receive key arrays. The application-level document operations also wrap the request in `try/finally`, so a successful, failed, or cancelled view/upload closes the session and disconnects the underlying HTTPS connection.[2] [3]

### 1.3 One-shot document operation

The current call chain is:

| Stage           | Behavior                                                                                                    | Security consequence                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Active profile  | Reads an existing active enrollment profile from encrypted Room.                                            | Document bytes are not added to the Android database.                    |
| Session factory | Creates a new signed, transcript-bound, short-lived session.                                                | A document request does not reuse a long-lived bearer session.           |
| Request         | Sends `document-request` or `document-upload-request` inside an AES-GCM frame.                              | The Hub receives only authenticated encrypted traffic over pinned HTTPS. |
| Hub response    | View returns metadata plus raw decrypted document bytes; upload sends a binary frame and receives metadata. | Upload response does not create an Android document copy.                |
| Cleanup         | `finally` closes the session and zeroizes session key material.                                             | Transport/session secrets have an explicit cleanup path.                 |

The current protocol is therefore **one-shot and authenticated**, but it is not byte-streaming. The complete bounded document is still held in memory for each operation; however, upload no longer creates immutable Base64 content strings or document-bearing JSON, and download no longer parses document content from JSON.[3] [4]

## 2. Memory-clearing review

### 2.1 Strong controls already present

The parser accepts only PDF, JPEG, PNG, and WebP, rejects empty or over-20-MiB content, compares the declared size with the decoded byte count, validates a lowercase SHA-256 value, and rejects integrity mismatches before returning an `InMemoryDoctorDocument`.[3]

The returned document owns a private byte array. `clear()` overwrites that array, while `copyBytesForViewer()` intentionally creates a temporary viewer copy. The Compose workspace clears the selected upload buffer after successful upload, cancellation, or activity disposal. It also clears the returned document when the viewer closes or leaves composition and recycles decoded image/PDF bitmaps.[4]

The file picker uses `OpenDocument` and reads the selected URI through `ContentResolver`; the application does not call `takePersistableUriPermission`, copy the URI into app storage, or write the selected document into Room, WorkManager, the outbox, downloads, or a share target.[4]

### 2.2 Residual exposure and recommended remediation

| Priority | Finding                                                                                                                                                                                             | Why it matters                                                                                                                                | Recommended action before production                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | A 20 MiB document is not truly streamed. The binary upload frame and raw-byte download path still hold complete bounded content plus transport/cipher buffers.                                      | Peak memory can exceed 20 MiB because JVM and cipher buffers may coexist. Low-memory Android devices could trigger pressure or process death. | Keep the Hub’s 20 MiB policy explicit, add memory telemetry, and device-test representative API-29 devices; consider encrypted chunking if measurements are unacceptable.            |
| P0       | Managed-runtime and cipher buffers can still outlive an operation until garbage collection, even though the upload frame and raw-byte download path now avoid document-bearing JSON/Base64 strings. | Session keys and owned document buffers are explicitly cleared, but forensic erasure of every JVM/native copy cannot be guaranteed.           | Keep plaintext arrays scoped and cleared in `finally`, avoid logging or retaining request/response objects, and validate peak memory and cleanup behavior on representative devices. |
| P0       | Android screenshot capture is now blocked for the doctor-document workspace through `FLAG_SECURE`, but physical observation is still required.                                                      | Device-specific recents, recording, accessibility, and OEM behavior must be evidenced rather than inferred from source.                       | Verify screenshots, screen recording, recents thumbnails, and accessibility capture behavior on test devices, and confirm the flag is restored safely when the workspace closes.     |
| P1       | Picker and transport temporary buffers are explicitly cleared on the implemented success, cancellation, and failure paths, but managed-runtime cleanup remains best-effort.                         | Provider errors, cancellation, and process death can still interrupt cleanup or leave native copies.                                          | Test oversized, unreadable, cancelled, provider-error, rotation, and process-death cases on physical devices.                                                                        |

| P1 | `InMemoryDoctorDocument` owns zeroizable bytes and the viewer uses scoped copies that are cleared on disposal; physical lifecycle callbacks still need evidence. | Rotation, background/foreground, cancellation, and process death can race with rendering. | Exercise those lifecycle transitions on representative devices and confirm no persistent document files or Room rows are created. |
| P1 | `Bitmap` and PDF rendering are decoded copies of document content. The current viewer recycles bitmaps on disposal, but cancellation during decode and process death need device testing. | Native graphics memory is outside the original byte-array cleanup path. | Test rotation, background/foreground, process death, low-memory callbacks, and cancellation during decode. Consider a dedicated viewer state owner with an explicit `close()` method. |
| P2 | The current viewer renders only the first PDF page. | Users may interpret a partially rendered document as complete. | Label the view explicitly as first-page preview or implement a page navigator before clinical use. |

The most important conclusion is that `clear()` is valuable but cannot provide forensic memory erasure on a managed runtime. The design should claim **no intentional Android persistence and explicit best-effort cleanup**, not guaranteed zeroization of every heap/native copy.[3] [4]

## 3. eg-drugs catalog milestone analysis

### 3.1 Source facts and implications

The upstream README describes 26,562 Egyptian drug records, CSV and JSON formats, Arabic and English names, ingredients, company, price, availability, barcodes, summaries, and generated warning flags. It lists approximately 22.1 MB for CSV and 36.5 MB for JSON, and states that the data is intended for personal, educational, research, and non-commercial use; commercial usage may require separate permission.[10] The repository has no published releases and the data directory is updated through branch commits rather than a release artifact.[11]

The source is useful as a **candidate reference catalog**, but it has four important limitations:

1. A moving Git branch is not a stable clinical release. Elite must pin the exact upstream commit and the exact downloaded file hash.
2. Generated FDA-based summaries and warning flags are not a substitute for a physician’s clinical judgment, Egyptian regulatory approval, or a current official product label.[10]
3. The sample price is a string with punctuation (`"40.00."`), so price parsing must be defensive and preserve the original source value.[10]
4. The README’s non-commercial language requires a licensing decision before a clinic deployment. Do not distribute the dataset in the product or use it commercially until permission is confirmed.

### 3.2 Recommended Hub-controlled import architecture

The import should be Windows Hub-only. Android should receive only an approved, minimized catalog projection if mobile drug search is required; Android should never independently fetch or approve the upstream dataset.

| Import stage                | Required control                                                                                                                                                         | Acceptance evidence                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Source check                | Admin starts “Check for catalog update,” or a low-frequency Hub check runs only when the Hub is online. Fetch by immutable commit URL over HTTPS.                        | Source URL, commit hash, download timestamp, HTTP metadata, file SHA-256, and source-license decision. |
| Safe intake                 | Enforce HTTPS, timeout, maximum content size, UTF-8, expected CSV/JSON structure, and temporary staging outside the active catalog.                                      | Rejected malformed, oversized, truncated, wrong-content, and schema-drift fixtures.                    |
| Schema validation           | Validate required columns and types; permit only reviewed additive fields; fail closed on missing or incompatible fields.                                                | Versioned schema report and parser test output.                                                        |
| Normalization               | Normalize Unicode names, Arabic text, ingredient separators, companies, package units, barcodes, availability, and price representation. Preserve raw source values.     | Deterministic normalized hash and sample review report.                                                |
| Duplicate/conflict handling | Detect collisions by source ID, barcode, and normalized name/company/ingredient/package combinations. Never silently merge ambiguous products.                           | Conflict queue with counts and Admin decisions.                                                        |
| Safety classification       | Store warnings and summaries as source-attributed advisory information with source version and effective date. Do not convert them into automatic prescribing decisions. | UI shows source/version/disclaimer; clinical-rule approval remains separate.                           |
| Review and approval         | Show new, changed, removed, price-changed, ingredient-changed, warning-changed, and discontinued records. Admin approves or rejects the candidate snapshot.              | Named Admin, timestamp, reason, diff summary, and audit event.                                         |
| Promotion                   | Promote a complete immutable `drug_catalog_version` transactionally. Keep the previous approved version active until promotion succeeds.                                 | Atomic promotion, rollback test, catalog-version manifest, and record counts.                          |
| Local overrides             | Store clinic aliases or approved local corrections in `drug_override`, never by mutating imported source rows.                                                           | Override audit trail and source-versus-local display.                                                  |
| Distribution                | Synchronize only the approved catalog version/hash to enrolled devices. Android retains the last approved local projection and never accepts staged data.                | Version/hash agreement across Hub and devices; rejection of unapproved snapshots.                      |
| Retirement                  | Mark removed/discontinued products retired rather than deleting historical medication references.                                                                        | Existing records continue to resolve to their historical catalog version.                              |

The existing architecture already names `drug_catalog_version`, `drug_item`, and `drug_override` as reference-domain entities and expects backup manifests to include catalog versions, counts, hashes, and restore compatibility.[9] The remaining work is therefore not just a downloader; it is a versioned reference-data lifecycle with provenance, review, rollback, audit, and clinical-safety boundaries.

### 3.3 Step 31 completion criteria

Step 31 should not be marked complete until all of the following are true:

- The license and permitted use of the upstream data are documented and approved.
- A pinned source commit and file hash produce a deterministic import result.
- Schema drift, malformed rows, invalid prices, duplicate identities, conflicting barcodes, and encoding problems fail safely or enter a review queue.
- An Admin can inspect and approve a candidate snapshot without changing the current approved catalog.
- Promotion is atomic and reversible, and the previous approved snapshot remains available.
- Medication history and prescriptions retain the catalog-version reference used at the time of authoring.
- Warnings are visibly advisory and show source/version metadata.
- Android receives only an approved projection, with no silent replacement of the active catalog.
- Synthetic fixtures cover import, rollback, duplicates, retirement, warning changes, price changes, and source unavailability.

## 4. Operational-hardening milestones

### Current release posture

The repository’s TypeScript, desktop, Android JVM, Android lint, release assembly, static policy, synthetic pilot, and readiness checks are green in the current environment. Physical Windows and Android device gates remain pending, so the project should remain an advanced pre-pilot build until installation, key storage, LAN/TLS, document, backup/restore, signing, and recovery evidence is collected.[6] [7]

| Milestone                              | Current state                                                                                         | Release consequence                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Android compile and package            | Local release check passed; physical signed-APK install pending                                       | The unsigned local artifact is not a production release claim; signing, install, upgrade, and rollback evidence remain required. |
| Android secure LAN and document matrix | Source, synthetic, and static checks passed; physical matrix pending                                  | No claim of physical document confidentiality, screenshot blocking, or role enforcement is valid until device evidence exists.   |
| Windows packaged native database       | Local archive gate passed; physical Windows smoke test pending                                        | Encrypted storage, OS-backed keys, and doctor vault still need packaged Windows testing with the exact Electron ABI.             |
| Backup and restore                     | Synthetic rehearsal passed; clean-machine physical drill pending                                      | Database keys, vault ciphertext, certificates, audit trail, and catalog versions still require operational restore evidence.     |
| TLS/trust-anchor lifecycle             | Source and harness prepared; device path pending                                                      | Certificate rotation, wrong-anchor rejection, Hub restart, and device recovery need physical evidence.                           |
| Android signing/update                 | Pending                                                                                               | Direct APK distribution needs an Admin-owned signing key, checksums, upgrade, rollback, and lost-device procedure.               |
| Egyptian drug catalog                  | Staged catalog foundation and Admin workflow implemented; import/licensing operationalization pending | Medication features must not depend on an unreviewed or impermissibly licensed external snapshot.                                |
| Reporting and governance               | Not finalized                                                                                         | First-release acceptance criteria remain incomplete.                                                                             |

### Recommended deployment order

**First, freeze governance decisions.** Confirm the organization identifier, Admin ownership, device-enrollment process, trust-anchor rotation owner, Android support inventory, backup destination and retention, APK distribution method, catalog license, catalog approval authority, and first-release medication/reporting scope. These decisions control the architecture and should precede large implementation work.

**Second, run the Android workstation gate.** Install JDK 17, Android SDK compile/API 36, platform tools, Gradle or a reviewed wrapper, and the required native dependencies. Run debug unit tests, lint, APK assembly, Room schema export, migration tests, and the document-stream tests. Review generated Room schema version 6 and inspect the APK for signing/build metadata.[7]

**Third, run the physical LAN matrix.** Use one Windows Hub and at least two API-29+ Android devices on an isolated synthetic-data LAN. Exercise correct and wrong trust anchors, enrollment approval, offline behavior, process death, Hub outage/restart, stale claims, session expiry, document view/upload, permission denials, malformed content, oversized content, screenshot attempts, and proof that no Android document files or Room document rows are created. The Step 28 harness must report physical-device status explicitly rather than treating desktop-only checks as completion.[8]

**Fourth, harden backup and recovery.** Implement or formalize encrypted Hub database and vault backup, separate backup-key handling, rotating encrypted USB copies, integrity manifests, catalog-version inventory, pre-restore safety backup, Admin authorization, clean-machine restore, migration replay, trust-anchor recovery, lost-device revocation, and interrupted-upgrade rollback. The security baseline requires encrypted, integrity-checked, versioned backups and a clean-device restore test.[9]

**Fifth, validate production packaging.** Build the signed Windows installer for Windows 10 and 11, rebuild and smoke-test the native encrypted SQLite module against the exact Electron version and architecture, validate OS-backed key initialization, firewall/LAN setup, startup failure behavior, certificate generation/rotation, upgrade/rollback, uninstall/reinstall, and logging redaction. For Android, produce a protected Admin-owned signing keystore process, signed APK checksum verification, upgrade testing, and a rollback package.[6] [7]

**Sixth, implement Step 31 as a controlled reference-data release.** Complete licensing, importer validation, staging, Admin review, version promotion, rollback, catalog-version references, and approved Android distribution before relying on drug search or medication selection in clinical workflows.

**Seventh, perform the synthetic pilot and production sign-off.** Exercise patient identity, guardians, appointments, clinical notes, amendments, exports, billing, refunds, offline operation, document view/upload, Hub restart, device replacement, catalog rollback, backup restore, and incident recovery with synthetic data. Production requires no unresolved security-critical findings, tested recovery, trained staff, accepted retention policy, and a documented rollback plan.

## 5. Prioritized risk register

| Risk                                          | Severity | Current assessment                                                                             | Decision                                                                                     |
| --------------------------------------------- | -------: | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Android source is not compiled or installed   | Critical | Local JVM, lint, release assembly, and static release checks pass; physical install is pending | Block clinical release until signed-APK and device gates pass.                               |
| Physical document view/upload not tested      | Critical | No physical Android devices are connected in this environment                                  | Block release; test on at least two devices.                                                 |
| Large document memory amplification           |     High | Binary/raw-byte transport removes document-bearing JSON/Base64 but remains one-shot            | Add memory telemetry/device tests and consider encrypted chunking if needed.                 |
| Screenshot capture not technically blocked    |     High | `FLAG_SECURE` is implemented; device behavior remains unobserved                               | Verify screenshots, recording, recents, and accessibility behavior on hardware.              |
| Immutable plaintext strings/JSON not zeroized |     High | Upload avoids immutable Base64/document JSON; managed-runtime copies remain possible           | Keep mutable buffers scoped and cleared, avoid logs, and document best-effort limits.        |
| eg-drugs license/provenance uncertainty       | Critical | Upstream README describes non-commercial use and no releases                                   | Obtain permission or choose a permitted source before commercial deployment.                 |
| Catalog schema/quality drift                  |     High | External branch data may change; price sample is malformed-looking text                        | Pin commit/hash, validate, stage, diff, and fail closed.                                     |
| Backup/restore not drilled                    | Critical | Policy exists; complete operational evidence does not                                          | Perform clean-device restore and key/vault/catalog recovery drill.                           |
| Windows native module/package drift           |     High | Source uses native encrypted SQLite provider                                                   | Validate exact Electron ABI, signed installer, upgrade, rollback, and key-provider behavior. |
| Certificate/trust-anchor lifecycle            |     High | Session pinning is strong; rotation/recovery is not physically evidenced                       | Create rotation/revocation runbook and execute on devices.                                   |

## 6. Recommended next implementation slice

The next coding slice is **Step 31A: Hub-side staged drug-catalog import and review**, but only after the license decision. It should complete versioned source/import metadata, staging parser fixtures, deterministic normalization, schema/duplicate/conflict validation, Admin diff/approval, atomic promotion, rollback, and audit events. Android distribution should follow only after the Hub workflow is proven with synthetic and curated catalog fixtures.

In parallel, execute the physical Windows and Android validation matrix as an external acceptance task, not an inference from source or local builds. If the physical gate exposes memory pressure, screenshot leakage, key loss, or recovery defects, correct those issues before expanding medication features.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/apps/android/app/src/main/java/com/elite/clinic/sync/LanSyncSessionFactory.kt "Elite Clinic Android LAN session factory"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/apps/android/app/src/main/java/com/elite/clinic/sync/SessionFrameCodec.kt "Elite Clinic Android encrypted session frame codec"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/apps/android/app/src/main/java/com/elite/clinic/sync/DoctorDocumentStream.kt "Elite Clinic Android in-memory document stream parser"
[4]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/apps/android/app/src/main/java/com/elite/clinic/DoctorDocumentScreen.kt "Elite Clinic Android doctor-document Compose workspace"
[5]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/apps/android/app/src/main/java/com/elite/clinic/sync/LanTlsConnection.kt "Elite Clinic Android pinned TLS connection"
[6]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/docs/project-status-and-milestones.md "Elite Clinic project status and milestones"
[7]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/docs/step-27-android-build-validation.md "Elite Clinic Android build validation gate"
[8]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/docs/step-28-real-device-sync-validation.md "Elite Clinic real-device LAN validation plan"
[9]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/docs/security-baseline.md "Elite Clinic security baseline"
[10]: https://github.com/mahmoudfalous/eg-drugs "Upstream eg-drugs repository README and source description"
[11]: https://github.com/mahmoudfalous/eg-drugs/tree/main/data "Upstream eg-drugs data directory"
