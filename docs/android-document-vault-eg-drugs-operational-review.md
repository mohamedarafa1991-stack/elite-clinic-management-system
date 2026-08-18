# Android Document Vault, eg-drugs, and Operational Hardening Review

**Review date:** 18 August 2026
**Repository baseline:** `8c62555` — `Update Android document deployment milestones`
**Author:** **Manus AI**

## Executive assessment

The Android doctor-document path has a strong security foundation: device identity remains in Android Keystore, each document operation creates a short-lived authenticated LAN session, the Hub certificate is pinned, the session is transcript-bound, encrypted frames enforce ordered AES-GCM counters, and session keys are zeroized when the session closes.[1] [2] [3] The Android application also avoids Room and filesystem persistence for doctor-document bytes, and the viewer explicitly clears its in-memory document object when closed or disposed.[4]

The implementation should nevertheless be described as **secure in design but not yet workstation-verified**, and the document payload path is not a true streaming design. A 20 MiB document is Base64-encoded and carried through JSON and encrypted-frame buffers, which can create several simultaneous copies in the Android heap. In addition, some temporary plaintext arrays, JSON strings, and picker buffers are released for garbage collection rather than explicitly overwritten. This is an important residual risk for lower-memory devices and must be tested before clinical deployment.

The `eg-drugs` catalog remains a **Red / not implemented** milestone. The upstream repository currently presents a large, flat, non-release dataset with a README-described non-commercial usage limitation and no published releases.[10] [11] Elite should not silently import the moving `main` branch or distribute raw source data to Android. The correct product boundary is a Windows Hub import that pins an upstream commit and source-file hash, stages and validates the data, presents an Admin review/diff workflow, preserves the previous approved catalog for rollback, and distributes only an approved snapshot.

Operationally, the highest-priority remaining blockers are Android workstation compilation, physical LAN testing, Windows packaging and native-module validation, encrypted backup/restore, certificate and device lifecycle procedures, and a synthetic-data pilot. The project should remain in **advanced pre-pilot** status until these gates produce evidence rather than source-only assurances.[6] [7] [8]

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

| Stage           | Behavior                                                                       | Security consequence                                                     |
| --------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Active profile  | Reads an existing active enrollment profile from encrypted Room.               | Document bytes are not added to the Android database.                    |
| Session factory | Creates a new signed, transcript-bound, short-lived session.                   | A document request does not reuse a long-lived bearer session.           |
| Request         | Sends `document-request` or `document-upload-request` inside an AES-GCM frame. | The Hub receives only authenticated encrypted traffic over pinned HTTPS. |
| Hub response    | View returns document metadata plus Base64 content; upload returns metadata.   | Upload response does not create an Android document copy.                |
| Cleanup         | `finally` closes the session and zeroizes session key material.                | Transport/session secrets have an explicit cleanup path.                 |

The current protocol is therefore **one-shot and authenticated**, but it is not byte-streaming. Both viewing and uploading carry the complete content through JSON/Base64 and in-memory byte arrays.[3] [4]

## 2. Memory-clearing review

### 2.1 Strong controls already present

The parser accepts only PDF, JPEG, PNG, and WebP, rejects empty or over-20-MiB content, compares the declared size with the decoded byte count, validates a lowercase SHA-256 value, and rejects integrity mismatches before returning an `InMemoryDoctorDocument`.[3]

The returned document owns a private byte array. `clear()` overwrites that array, while `copyBytesForViewer()` intentionally creates a temporary viewer copy. The Compose workspace clears the selected upload buffer after successful upload, cancellation, or activity disposal. It also clears the returned document when the viewer closes or leaves composition and recycles decoded image/PDF bitmaps.[4]

The file picker uses `OpenDocument` and reads the selected URI through `ContentResolver`; the application does not call `takePersistableUriPermission`, copy the URI into app storage, or write the selected document into Room, WorkManager, the outbox, downloads, or a share target.[4]

### 2.2 Residual exposure and recommended remediation

| Priority | Finding                                                                                                                                                                                                                                      | Why it matters                                                                                                                                                                                    | Recommended action before production                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | A 20 MiB document is not truly streamed. Upload creates raw bytes, a Base64 string, JSON text, encrypted-frame buffers, and cipher output. View responses similarly exist as JSON/Base64 and decoded bytes.                                  | Peak memory can be substantially larger than 20 MiB, especially because JVM strings and temporary cipher buffers may coexist. Low-memory Android devices could trigger pressure or process death. | Either introduce encrypted chunking with per-chunk counters and a bounded buffer, or establish and device-test a lower Android limit. Keep the Hub’s 20 MiB policy explicit and measure peak RSS on representative API-29 devices.              |
| P0       | Plaintext request and response byte arrays are generally released to garbage collection rather than overwritten. `LanSyncHttpSession` converts decrypted frame bytes to a `JSONObject`; upload request JSON also contains the Base64 string. | The session keys are zeroized, but document plaintext may remain in heap memory until GC.                                                                                                         | Wrap frame plaintext arrays in `try/finally` and overwrite them after JSON parsing/encryption. Avoid logging or retaining request/response objects. Treat immutable Base64/String copies as best-effort residual risk and document it.          |
| P0       | Android screenshot capture is not technically blocked by the current UI. The screen removes save/share/download affordances but does not set `FLAG_SECURE`.                                                                                  | A user or malicious app with screen-capture capability may capture a displayed document despite the “no screenshot export” text.                                                                  | Set `WindowManager.LayoutParams.FLAG_SECURE` while a document viewer is active and restore the prior window state when it closes. Verify screenshots, screen recording, recents thumbnails, and accessibility capture behavior on test devices. |
| P1       | `ByteArrayOutputStream` and its read buffer are not explicitly wiped on picker failure or after successful conversion.                                                                                                                       | Oversized or malformed selection paths can leave temporary file bytes eligible for GC.                                                                                                            | Add a bounded reusable buffer with `finally` zeroization and clear the output buffer on all exit paths. Test oversized, unreadable, cancelled, and provider-error cases.                                                                        |
| P1       | `InMemoryDoctorDocument.clear()` is idempotent but does not mark the object closed. A later `copyBytesForViewer()` returns a zero-filled copy.                                                                                               | A stale UI callback could render an apparently valid-sized blank document after close.                                                                                                            | Add a cleared state and reject post-clear viewer copies with a safe exception; add a test that close invalidates future reads.                                                                                                                  |
| P1       | `Bitmap` and PDF rendering are decoded copies of document content. The current viewer recycles bitmaps on disposal, but cancellation during decode and process death need device testing.                                                    | Native graphics memory is outside the original byte-array cleanup path.                                                                                                                           | Test rotation, background/foreground, process death, low-memory callbacks, and cancellation during decode. Consider a dedicated viewer state owner with an explicit `close()` method.                                                           |
| P2       | The current viewer renders only the first PDF page.                                                                                                                                                                                          | Users may interpret a partially rendered document as complete.                                                                                                                                    | Label the view explicitly as first-page preview or implement a page navigator before clinical use.                                                                                                                                              |

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

The repository’s TypeScript and desktop checks are green, but Android Gradle compilation, Room/KSP generation, APK assembly, Android JVM tests, and physical-device LAN testing have not run in the current environment because the required SDK, Gradle tooling, Kotlin compiler, platform tools, and devices are absent.[6] [7] The project should remain an advanced pre-pilot build.

| Milestone                              | Current state                                    | Release consequence                                                                                                                 |
| -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Android compile and package            | Not verified                                     | No APK release claim is valid.                                                                                                      |
| Android secure LAN and document matrix | Not verified                                     | No claim of physical document confidentiality or role enforcement is valid.                                                         |
| Windows packaged native database       | Not fully evidenced                              | Encrypted storage and doctor vault need packaged Windows smoke testing with the exact Electron ABI.                                 |
| Backup and restore                     | Not evidenced as a complete drill                | A database key, vault ciphertext, certificates, audit trail, or catalog version could be unrecoverable without an operational test. |
| TLS/trust-anchor lifecycle             | Source and harness prepared; device path pending | Certificate rotation, wrong-anchor rejection, Hub restart, and device recovery need physical evidence.                              |
| Android signing/update                 | Pending                                          | Direct APK distribution needs an Admin-owned signing key, checksums, upgrade, rollback, and lost-device procedure.                  |
| Egyptian drug catalog                  | Not implemented                                  | Medication features should not depend on an unreviewed external snapshot.                                                           |
| Reporting and governance               | Not finalized                                    | First-release acceptance criteria remain incomplete.                                                                                |

### Recommended deployment order

**First, freeze governance decisions.** Confirm the organization identifier, Admin ownership, device-enrollment process, trust-anchor rotation owner, Android support inventory, backup destination and retention, APK distribution method, catalog license, catalog approval authority, and first-release medication/reporting scope. These decisions control the architecture and should precede large implementation work.

**Second, run the Android workstation gate.** Install JDK 17, Android SDK compile/API 36, platform tools, Gradle or a reviewed wrapper, and the required native dependencies. Run debug unit tests, lint, APK assembly, Room schema export, migration tests, and the document-stream tests. Review generated Room schema version 6 and inspect the APK for signing/build metadata.[7]

**Third, run the physical LAN matrix.** Use one Windows Hub and at least two API-29+ Android devices on an isolated synthetic-data LAN. Exercise correct and wrong trust anchors, enrollment approval, offline behavior, process death, Hub outage/restart, stale claims, session expiry, document view/upload, permission denials, malformed content, oversized content, screenshot attempts, and proof that no Android document files or Room document rows are created. The Step 28 harness must report physical-device status explicitly rather than treating desktop-only checks as completion.[8]

**Fourth, harden backup and recovery.** Implement or formalize encrypted Hub database and vault backup, separate backup-key handling, rotating encrypted USB copies, integrity manifests, catalog-version inventory, pre-restore safety backup, Admin authorization, clean-machine restore, migration replay, trust-anchor recovery, lost-device revocation, and interrupted-upgrade rollback. The security baseline requires encrypted, integrity-checked, versioned backups and a clean-device restore test.[9]

**Fifth, validate production packaging.** Build the signed Windows installer for Windows 10 and 11, rebuild and smoke-test the native encrypted SQLite module against the exact Electron version and architecture, validate OS-backed key initialization, firewall/LAN setup, startup failure behavior, certificate generation/rotation, upgrade/rollback, uninstall/reinstall, and logging redaction. For Android, produce a protected Admin-owned signing keystore process, signed APK checksum verification, upgrade testing, and a rollback package.[6] [7]

**Sixth, implement Step 31 as a controlled reference-data release.** Complete licensing, importer validation, staging, Admin review, version promotion, rollback, catalog-version references, and approved Android distribution before relying on drug search or medication selection in clinical workflows.

**Seventh, perform the synthetic pilot and production sign-off.** Exercise patient identity, guardians, appointments, clinical notes, amendments, exports, billing, refunds, offline operation, document view/upload, Hub restart, device replacement, catalog rollback, backup restore, and incident recovery with synthetic data. Production requires no unresolved security-critical findings, tested recovery, trained staff, accepted retention policy, and a documented rollback plan.

## 5. Prioritized risk register

| Risk                                          | Severity | Current assessment                                                       | Decision                                                                                     |
| --------------------------------------------- | -------: | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Android source is not compiled or installed   | Critical | Toolchain unavailable in the current sandbox                             | Block clinical release until workstation gate passes.                                        |
| Physical document view/upload not tested      | Critical | No devices or `adb` available                                            | Block release; test on at least two devices.                                                 |
| Large document memory amplification           |     High | Current JSON/Base64 one-shot path can create multiple copies             | Add memory telemetry/device tests and preferably encrypted chunking.                         |
| Screenshot capture not technically blocked    |     High | Current UI removes export actions but does not set `FLAG_SECURE`         | Add and test secure-window behavior before sensitive document use.                           |
| Immutable plaintext strings/JSON not zeroized |     High | Session key arrays are zeroized; document payload copies are GC-managed  | Zeroize mutable frame buffers and document best-effort limitations; avoid logs.              |
| eg-drugs license/provenance uncertainty       | Critical | Upstream README describes non-commercial use and no releases             | Obtain permission or choose a permitted source before commercial deployment.                 |
| Catalog schema/quality drift                  |     High | External branch data may change; price sample is malformed-looking text  | Pin commit/hash, validate, stage, diff, and fail closed.                                     |
| Backup/restore not drilled                    | Critical | Policy exists; complete operational evidence does not                    | Perform clean-device restore and key/vault/catalog recovery drill.                           |
| Windows native module/package drift           |     High | Source uses native encrypted SQLite provider                             | Validate exact Electron ABI, signed installer, upgrade, rollback, and key-provider behavior. |
| Certificate/trust-anchor lifecycle            |     High | Session pinning is strong; rotation/recovery is not physically evidenced | Create rotation/revocation runbook and execute on devices.                                   |

## 6. Recommended next implementation slice

The safest next coding slice is **Step 31A: Hub-side staged drug-catalog import and review**, but only after the license decision. It should introduce versioned source/import metadata, staging tables and parser fixtures, deterministic normalization, schema/duplicate/conflict validation, Admin diff/approval, atomic promotion, rollback, and audit events. Android distribution should follow only after the Hub workflow is proven with synthetic and curated catalog fixtures.

In parallel, the Android workstation gate should be scheduled as an external validation task, not inferred from TypeScript success. If the physical gate exposes memory pressure or screenshot leakage, correct those security issues before expanding medication features.

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
