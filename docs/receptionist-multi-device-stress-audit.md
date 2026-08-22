# Elite Clinic — Multi-Device Manual-Entry Stress Audit

**Author:** Manus AI  
**Date:** 22 August 2026

## Executive summary

A controlled multi-device stress simulation was performed against the Elite Clinic desktop system using synthetic data only. Three isolated Electron sessions were driven through the real patient-registration interface, and a disposable shared encrypted SQLite database was exercised with concurrent receptionist-style registrations, duplicate races, and simultaneous patient edits. The simulation exposed a real concurrency defect: the shared database returned `database is locked` during concurrent patient registration. The defect was reproduced with as few as three to five concurrent writer processes and occurred repeatedly at higher concurrency.

The registration path was hardened with a 10-second SQLite busy timeout and an immediate write transaction around patient-number allocation and registration [1]. After the fix, three-, four-, five-, and eight-device workloads completed three rounds each with zero lock errors. Sequential patient identifiers remained unique and gap-free within each disposable run, duplicate races never created more than one matching patient, and simultaneous edits correctly produced one winner plus one optimistic-version conflict. The final repository validation also passed with 131 tests and a successful desktop build.

This was a **desktop and disposable-database simulation**, not a physical Windows/Android pilot. It does not prove LAN convergence, Android behavior, printer behavior, packaged-install recovery, or real-clinic readiness.

## Test boundary and device matrix

All names, phone numbers, national IDs, credentials, dates, and database contents were synthetic. No production database or real patient data was accessed.

| Simulated actor             | Execution surface                                        | Manual-entry workload                                              | Concurrency purpose                                                                          |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Device A                    | Isolated Electron renderer on port 9341                  | Full synthetic patient registration and search                     | Tests field entry, local search isolation, and renderer responsiveness.                      |
| Device B                    | Isolated Electron renderer on port 9342                  | Full registration, repeated quick registration, duplicate re-entry | Tests duplicate-review behavior and repeated front-desk entry.                               |
| Device C                    | Isolated Electron renderer on port 9343                  | Full registration and repeated quick registration                  | Tests a third independent operator session.                                                  |
| Shared synthetic Hub actors | Separate Node processes with separate SQLite connections | Concurrent full patient registrations and concurrent patient edits | Tests shared-database write contention, sequencing, duplicate races, and optimistic locking. |
| Sync observer               | Existing disposable LAN/TLS scenario                     | TLS startup failure, correct/wrong trust anchors, outage, restart  | Tests transport fail-closed behavior; Android execution remained pending.                    |

## Real UI simulation results

Each isolated Electron session was initialized with separate synthetic Admin credentials through the first-launch form and then signed in through the visible login form. Each session created a distinct full patient through the real Patients workspace. The application showed the expected fields—English name, phone, Arabic name, date of birth, sex, and optional national ID—and rendered the records as Complete.

The locally generated patient number started at `EL-00001` in every isolated session. This is correct for independent local databases, but it also demonstrates an important product boundary: Device A could not find Device B’s synthetic patient before synchronization. Searching Device A for Device B’s synthetic patient produced “No active patients match this search.” The system did not falsely display another device’s record, but a real sync test is required to verify when and how that record becomes available.

Device B then entered the same synthetic patient again. The duplicate-review panel blocked the save and displayed the existing `EL-00001` record, score 40, severity `possible`, signals `name-en, phone`, a required reason field, Cancel, and Create another patient. This remained understandable and prevented an accidental duplicate during the isolated manual workflow.

Two simultaneous quick-registration actions were also run through the real UI on Devices B and C. Both sessions remained responsive and produced new synthetic records with the expected minimal-completeness status. This confirms that independent renderer sessions can handle overlapping operator activity when they are backed by independent local state.

## Shared-database concurrency reproduction

The shared-hub harness opened separate connections to one disposable encrypted SQLite database and released eight worker processes at the same barrier. Each worker acted as a receptionist registering a full patient. Two workers used the same synthetic phone number and national ID to create a duplicate race. A second barrier then released two workers attempting to edit the same patient using the same expected version.

Before the write-transaction fix, the defect was reproducible. A controlled five-actor run produced two `database is locked` errors. Three repeated eight-actor runs produced two, four, and two lock errors respectively. A threshold run showed no lock errors with two actors, intermittent errors with three actors, and errors in every four-actor run. The duplicate logic itself behaved safely in the successful races: at most one synthetic patient with the duplicate phone was persisted, while the competing registration received `ELITE_PATIENT_DUPLICATE_REVIEW_REQUIRED`.

The immediate transaction fix was then tested with fresh databases. Every run below completed without `database is locked`:

| Concurrent registration width | Rounds | Registration lock errors after fix |
| ----------------------------: | -----: | ---------------------------------: |
|                      3 actors |      3 |                                  0 |
|                      4 actors |      3 |                                  0 |
|                      5 actors |      3 |                                  0 |
|                      8 actors |      3 |                                  0 |

The eight-actor post-fix evidence contained six unique synthetic registrations plus one permitted duplicate-race winner. Patient numbers `EL-00001` through `EL-00007` were all unique within that run, even though completion order differed from actor order. The duplicate phone appeared once. The simultaneous edit test produced one version-2 winner and one `ELITE_PATIENT_VERSION_CONFLICT`, demonstrating that a stale edit did not overwrite the winning edit [2].

## Fixes applied

The following source changes were made after reproducing the concurrency issue.

| Change                                                                         | Purpose                                                                                                                                        | Result                                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `database.pragma("busy_timeout = 10000")` in `openDatabase`                    | Give concurrent SQLite writers time to wait for a short transaction to finish rather than failing immediately.                                 | Improves normal lock recovery and is covered by the database build/test path [3]. |
| `registerPatient` now invokes the registration transaction with `.immediate()` | Acquire the write reservation before the patient-identity sequence and patient row are mutated, avoiding deferred writer promotion contention. | Eliminated lock errors in all post-fix 3-, 4-, 5-, and 8-actor rounds.            |

The fix intentionally does not introduce application-level blind retries. A retry layer must preserve idempotency and audit semantics and should be designed separately for sync operations. The current registration path now fails less often under contention while preserving duplicate-review and optimistic-lock behavior.

## Sync and transport boundary results

The existing disposable LAN/TLS scenario also passed its desktop checks. The Hub rejected TLS-required startup without certificate paths, left no listener after failed startup, accepted the correct synthetic trust anchor, rejected the wrong trust anchor, reported a connection failure during outage, and recovered after restart. The Android hook remained pending because no physical Android command was configured [4].

These results confirm transport safety checks on the local desktop harness only. They do not establish that multiple physical Android devices converge correctly, that outbox acknowledgements are idempotent over a real LAN, or that encrypted documents remain absent from Android storage after process death.

## Remaining usability and operational findings

The multi-device simulation does not remove the previously identified operational blockers. A supported Admin workflow for creating Staff, Receptionist, Doctor, and Nurse accounts is still required. The Doctors workspace still needs doctor-profile and schedule provisioning through the product UI before a real receptionist can book against named availability. Appointment cancellation and no-show controls also need to be visible on the front-desk appointment card.

The isolated-session result should be explained in the product’s sync-health language. A receptionist should be able to tell whether a patient was created only on the current computer, queued for synchronization, or confirmed by the Hub. The phrase “Working locally” is helpful but should be paired with a clear pending-sync count and last-successful-sync time when physical sync is enabled.

## Automated validation

After the fixes, the following commands passed:

```text
pnpm format:check
pnpm typecheck
pnpm test
pnpm desktop:build
```

The repository reported 9 contract tests, 6 database tests, 63 auth tests, and 53 desktop tests passing, for **131 passing tests**. The multi-device harness and raw stress artifacts remain local audit evidence and were not added to the GitHub repository. The committed source changes and this report are the intended deliverables.

## Conclusion and release boundary

The most important result is positive: the patient identity sequence and optimistic edit protections remain correct after introducing concurrent writers, and the reproduced database-lock failure was eliminated across the tested synthetic concurrency widths. The system is more resilient for a busy front desk, but this result is not a release sign-off.

The app remains blocked from unrestricted real-clinic rollout until the Staff/Doctor provisioning workflow, real Receptionist-role audit, named doctor schedules, Windows packaged-install checks, physical Android/LAN synchronization, backup/recovery, printer/PDF, signed-artifact, and governance gates are completed. Continue using synthetic data until those gates are formally passed.

## References

[1]: ../packages/auth/src/patient-service.ts "Patient registration transaction and duplicate handling"
[2]: ../packages/auth/src/patient-service.test.ts "Patient optimistic-version test coverage"
[3]: ../packages/database/src/index.ts "Encrypted database opening and SQLite pragmas"
[4]: ../scripts/step28-real-device-sync-e2e.mjs "Disposable LAN/TLS and physical-device sync boundary scenario"
