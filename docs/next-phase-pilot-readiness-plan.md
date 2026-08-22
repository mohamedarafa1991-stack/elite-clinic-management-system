# Elite Clinic Management System

## Next Development Phase: Pilot Readiness and Operational Validation

**Prepared by:** Manus AI
**Baseline:** `origin/main` at [`8855218`](https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/commit/8855218)
**Date:** 19 August 2026

## Executive recommendation

The next phase should be **Pilot Readiness and Operational Validation**, not another broad clinical feature. The project has completed the P0 desktop IPC hardening and the main P1 frontend extraction increment. The current repository passes **99 automated assertions**: 9 contract tests, 6 database tests, 47 authentication/domain tests, and 37 desktop tests. The desktop production build, typecheck, formatting, whitespace checks, and Linux/Xvfb Electron IPC smoke test are also passing. The latest frontend increment extracted the Today workspace and AppShell and added capability-filtered navigation tests.[1]

The remaining risk is now concentrated at the boundary between source code and real clinic operation: the renderer still contains two large workflow regions, the Windows project has no installer configuration, Android compilation and physical-device behavior remain workstation-gated, and the approved Egyptian drug catalog import has not yet been implemented. The recommended sequence is therefore:

> **Close the remaining P1 renderer test boundary, implement the Hub-only staged drug catalog import, create a reproducible Windows installer, validate the Android build and LAN/device workflows, then run a synthetic end-to-end pilot rehearsal.**

No real patient data should be introduced until every release gate in this plan passes.

## Current baseline

| Area                               | Current evidence                                                                                                                                                                                       |                             Status | Implication                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------: | ------------------------------------------------------------------------------------------------------------------ |
| Desktop IPC security               | All 129 handlers use centralized sender validation and strict boundary parsing; runtime smoke coverage verifies isolation, trusted invocation, malformed-input rejection, and safe error redaction.[2] |                Complete in sandbox | Requires packaged Windows verification before production data.                                                     |
| Frontend design system             | Cairo Calm shell, bilingual English/Arabic foundations, Patient Context Banner, Today workspace, AppShell extraction, and synthetic policy tests are present.[1]                                       |              P1 increment complete | Patient and clinical workflow regions still need further boundary extraction.                                      |
| Core clinical and billing services | Patient identity, guardians/related persons, scheduling, encounters, ICD-10, amendments, exports, billing, doctor profiles, and encrypted document vault are implemented with TypeScript tests.        |              Implemented in source | End-to-end UI and platform validation remain incomplete in several areas.                                          |
| Android sync and vault             | Six synchronization scopes, encrypted sessions, outbox durability, billing summaries, doctor-document workspace, `FLAG_SECURE`, and zeroizable byte ownership are implemented in source.[3]            | Source-complete, device-unverified | Android build, migrations, LAN, screen protection, and process-death behavior need a real workstation and devices. |
| Egyptian drug catalog              | The selected `eg-drugs` source is part of the approved product requirements, but no importer/staging/review implementation is currently present in the tracked source.                                 |                    Not implemented | This is the first missing approved domain feature to implement.                                                    |
| Windows distribution               | The desktop package has a development/build script but no current Electron Builder or installer configuration.                                                                                         |                    Not implemented | A clinic cannot receive a controlled Windows deployment until packaging exists.                                    |
| Recovery operations                | Encrypted storage, export signing, and key recovery work exist, but a complete clinic operator runbook for database backup, restore, rollback, and Hub replacement is not yet a release gate.          |              Partially implemented | Recovery must be tested before synthetic pilot sign-off.                                                           |

## Phase objective and non-goals

The phase objective is to make the system **installable, testable on the intended platforms, safe to rehearse with synthetic clinic data, and operationally recoverable**. The phase does not attempt to add insurance, cloud hosting, multi-branch support, or a new mobile clinical module. It also does not introduce live patient data or weaken the local-first/no-cloud deployment model.

## Ordered implementation plan

### 31A. Close the remaining P1 frontend boundary

This is a small code-first increment that can be completed before a Windows or Android workstation is available. Extract the highest-risk parts of `PatientWorkspace` into focused feature modules, beginning with patient search/duplicate review and related-person/guardian controls. Add a pure model for duplicate-warning decisions and tests for the approved choices: continue with an existing patient, create a new patient despite a warning, or enter the controlled merge-review workflow. Add tests for Arabic/RTL identifiers, phone-number non-uniqueness, guardian links for minors, and capability-hidden merge controls.

After that, split the clinical workflow into smaller view-model boundaries rather than copying the entire 3,300-line component at once. The first boundaries should be appointment queue state, encounter-signing capability gates, and diagnosis/ICD-10 selection. Each boundary should have synthetic tests that prove that a receptionist or nurse cannot see or trigger doctor-only signing and diagnosis actions, while a permitted doctor can.

**Acceptance gate:** no behavior change in patient registration, duplicate warnings, guardian editing, appointment scheduling, encounter signing, or RTL rendering; all new tests pass with synthetic data; the renderer’s large components have explicit next boundaries documented in code.

### 31B. Implement the Egyptian drug catalog as a Hub-only staged import

The first new user-facing feature should be the approved drug catalog workflow. It must be deliberately staged rather than an automatic direct write into the active catalog.

The importer should fetch or accept an Admin-selected source snapshot, record the source URL, commit or release identifier, retrieval timestamp, content hash, parser version, and license/attribution metadata, then validate the normalized records into a staging area. The Admin review screen should show additions, changes, removals, invalid rows, duplicate ingredients, and unresolved normalization conflicts. Only an explicit Admin approval should promote a staged snapshot to the active catalog. Existing prescriptions or historical medication references must retain their original display/value snapshot and must not change when a later catalog version is activated.

The import must be idempotent, resumable after interruption, and safe when the source is unavailable. It must never be required for offline clinic operation after a snapshot has been approved. The initial implementation should use synthetic catalog fixtures in tests and should pin real-source integration to a recorded version rather than silently following a moving branch.

**Acceptance gate:** a malformed or partial source cannot alter the active catalog; re-importing the same snapshot produces no duplicate active records; approval and rollback are auditable; historical medication references remain stable; the active catalog continues to work without internet or LAN.

### 31C. Create the reproducible Windows desktop package

Add a controlled Windows packaging target, preferably an NSIS installer with a versioned artifact name, application metadata, uninstall behavior, and a documented data-directory policy. The package must include the compiled main process, renderer, preload, native database dependency, migrations, and required local assets without including development secrets or source maps in the release payload unless intentionally retained for diagnostics.

The installer work should include a first-run synthetic bootstrap path, a clean-install migration test, an upgrade migration test from the previous schema state, and a rollback/recovery procedure. The packaged application must load the trusted `file://` renderer, reject remote navigation, reject child-frame IPC, and preserve safe error behavior.

Code signing should be treated as a release-hardening step. If a clinic-owned Windows signing certificate is not yet available, the pilot artifact may remain unsigned only for an explicitly controlled internal test; it must not be presented as a production distribution standard.

**Acceptance gate:** an installer can be produced from a clean checkout, installed on Windows 10 and Windows 11, started without a development server, opened with a new synthetic database, upgraded without data loss, and uninstalled without deleting retained clinic data unless the operator explicitly chooses data removal.

### 31D. Complete Android workstation and physical-device validation

On an Android workstation, run the Gradle test and build matrix for API 29 and a current supported API. Verify Room migration 1→7, encrypted database startup, session establishment, seven-scope synchronization including billing and doctor summaries, outbox retry classification, device enrollment, session expiry, and Hub TLS recovery.

Physical-device validation must cover at least one API 29-class device and one current device. The document workspace must verify LAN-only retrieval and upload, file-picker MIME/size rejection, no Android persistence of doctor documents, no share/download affordances, `FLAG_SECURE` while viewing, viewer cleanup on close, process death, session expiry, corrupted content, oversized content, Hub restart, and role-specific access. The Android release documentation already identifies these as workstation and device gates.[3]

**Acceptance gate:** debug and release-like APKs install successfully; JVM tests pass; both devices complete login/enrollment and an offline-to-LAN sync cycle; no protected document is written to public or app-persistent storage beyond the intended encrypted database/session mechanisms; all security-critical behaviors are observed rather than inferred from source inspection.

### 31E. Add operational backup, restore, and pilot runbooks

Before synthetic pilot use, define the Windows Hub operator procedures for encrypted database backup, backup verification, restore to a replacement Hub, migration recovery, export-key recovery, TLS certificate recovery, and Android device revocation/re-enrollment. Each procedure should state the required Admin role, the expected downtime, the files or USB media involved, the verification evidence, and the failure rollback.

The backup feature should produce an integrity-verifiable artifact without exposing plaintext database files. Restore must occur into a separate test directory first, verify migration and record counts, and require an explicit Admin confirmation before replacing the active data directory. The runbook should include a daily synthetic backup rehearsal during the pilot period and a documented retention policy.

**Acceptance gate:** a clean replacement-Hub rehearsal restores the synthetic clinic, preserves audit and sequence invariants, re-establishes LAN sync, and documents any records that require manual reconciliation.

### 31F. Run the synthetic pilot rehearsal

Create a repeatable rehearsal dataset with fictional staff, patients, guardians, doctors, appointments, encounters, diagnoses, invoices, payments, refunds, documents, and synchronization changes. Exercise the full clinic day: Admin setup, receptionist registration and duplicate warning, guardian linkage for a minor, appointment arrival, nurse rooming, doctor encounter and ICD-10 entry, billing, doctor document access, LAN outage, Hub restart, Android sync recovery, export verification, backup, and restore.

The rehearsal must capture evidence rather than relying on verbal confirmation. Record build versions, schema versions, device identifiers, sync-health states, backup hashes, installer checksums, and any manual recovery actions. All test data must remain synthetic and must be destroyed or archived according to the pilot runbook afterward.

**Acceptance gate:** the complete scenario passes on the packaged Windows Hub and validated Android devices with no unresolved P0/P1 security or data-integrity defects.

## Recommended execution order

| Order | Work package                                            | Can begin in current sandbox? | Primary blocker                                            | Completion signal                                                  |
| ----: | ------------------------------------------------------- | ----------------------------: | ---------------------------------------------------------- | ------------------------------------------------------------------ |
|     1 | Patient duplicate/guardian feature extraction and tests |                           Yes | None                                                       | P1 renderer tests and typecheck pass.                              |
|     2 | Clinical workflow capability-boundary tests             |                           Yes | None                                                       | Role matrix is enforced by UI and service boundaries.              |
|     3 | Hub-only staged `eg-drugs` import                       |  Yes, with synthetic fixtures | Confirm source snapshot/license details before live import | Staged diff, Admin approval, rollback, and idempotency tests pass. |
|     4 | Windows installer and packaged smoke harness            |                     Partially | Windows workstation and packaging toolchain                | Clean install/upgrade/uninstall and packaged IPC tests pass.       |
|     5 | Android build and device validation                     |                            No | Android SDK/Gradle/ADB and physical devices                | API 29/current-device matrix passes.                               |
|     6 | Backup/restore and replacement-Hub rehearsal            |                     Partially | Packaged Hub and approved media procedure                  | Restore and sync recovery evidence captured.                       |
|     7 | Synthetic pilot rehearsal                               |                            No | All earlier gates                                          | Full scenario accepted without P0/P1 defects.                      |

## Decisions to confirm before implementation

The recommended defaults are shown so work can proceed without reopening settled architecture decisions.

| Decision                    | Recommended default                                                                                                             | Why it matters                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Drug source pinning         | Pin an explicit commit or release snapshot of `mahmoudfalous/eg-drugs` for every import                                         | A moving branch must never silently change the active clinical catalog.                          |
| Drug catalog approval       | Admin-only promotion from staging to active catalog; no automatic activation                                                    | Matches the approved manual-review requirement and protects historical records.                  |
| Catalog update transport    | Hub-only import using internet when available, with an offline file/USB import fallback                                         | Preserves full offline operation and supports the clinic’s USB workflow.                         |
| Windows packaging           | NSIS installer first; code signing added when the clinic-owned certificate is available                                         | Gives the clinic a controlled installation path without requiring a cloud service.               |
| Android validation devices  | One API 29 device plus one current Android device                                                                               | Covers the minimum supported floor and a modern runtime.                                         |
| Ordinary doctor documents   | Keep current behavior: ordinary documents visible to permitted staff; sensitive documents require the sensitive-read capability | This is already the implemented default, but it must be confirmed during physical testing.       |
| Billing authority threshold | Keep explicit reasons and capability checks now; defer monetary threshold configuration until the clinic approves exact limits  | The service already records billing actions, but thresholds remain a product-policy decision.[4] |
| Backup media                | Encrypted removable media under Admin custody, with a second verified copy during pilot                                         | Matches the local-first and USB operational model without introducing cloud dependency.          |

## Definition of done for the phase

The phase is complete only when the repository has the staged drug-import implementation and tests, the remaining P1 frontend boundaries and role tests, a reproducible Windows installer configuration, and documented release/runbook artifacts; and when a Windows workstation plus Android test devices have produced execution evidence for the packaged app, migrations, LAN synchronization, document security, backup/restore, and the synthetic clinic-day rehearsal.

A passing TypeScript test suite alone is not sufficient for release. The current project documentation explicitly treats Android compilation, APK assembly, physical-device viewing/upload, `FLAG_SECURE`, memory clearing, and packaged Windows behavior as workstation or device gates rather than sandbox claims.[3] The next phase should preserve that distinction.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/commit/8855218 "Extract Today and AppShell frontend features"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/ipc-sender-validation-and-boundary-parsing.md "IPC sender validation and boundary parsing"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/step-30-doctor-profiles-and-document-vault.md "Step 30 doctor profiles and secure document vault"
[4]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/step-29-service-catalog-and-billing.md "Step 29 service catalog and billing"
[5]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/claude-code-plan-review.md "Commercial-readiness plan review"
[6]: https://github.com/mahmoudfalous/eg-drugs "Approved Egyptian drug source repository"
