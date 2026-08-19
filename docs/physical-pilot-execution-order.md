# Elite Clinic Physical Pilot Execution Order

**Prepared by:** Manus AI
**Clinic:** Elite Clinic / ايليت, Cairo, Egypt
**Data rule:** Synthetic data only until every required gate is passed and the Admin signs production readiness

## Purpose

This document is the execution order for the first physical validation rehearsal. It complements the detailed [workstation and device validation matrix](workstation-and-device-validation-matrix.md), the [operator checklist](templates/physical-device-validation-checklist.md), and the [synthetic recovery runbook](synthetic-pilot-rehearsal-and-recovery-runbook.md). The order is deliberately conservative: later synchronization and recovery tests must not begin until the local package, encryption, and trust boundaries have passed.

> **Stop rule:** A failed or unavailable prerequisite leaves the dependent gates `blocked` or `pending`. Do not convert a source-level assertion, a sandbox result, or an operator assumption into physical-device evidence.

## Required equipment and roles

| Item                   | Requirement                                                                                                                                                     | Owner                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Windows Hub            | One Windows 10 test workstation and one Windows 11 test workstation, or an approved equivalent sequence, with controlled synthetic storage and firewall access. | Admin / deployment operator |
| Android floor device   | API 29-class Android device with camera-optional behavior.                                                                                                      | Android test operator       |
| Android current device | Current clinic-supported Android device with a current security patch.                                                                                          | Android test operator       |
| Second Android device  | Required for durable-claim fairness, concurrent sync, and revocation/re-enrollment scenarios.                                                                   | Android test operator       |
| Recovery media         | Admin-controlled encrypted USB with a second verified copy for the rehearsal.                                                                                   | Admin / recovery operator   |
| Synthetic accounts     | Two Admins, two Doctors, one Nurse, and one Receptionist from the deterministic rehearsal only.                                                                 | Admin                       |
| Evidence record        | One JSON record copied from `docs/templates/physical-device-validation-record.json` and one signed checklist.                                                   | Evidence owner              |

No personal patient records, real national IDs, real phone numbers, real medical documents, personal account credentials, or production encryption keys may be used in this rehearsal.

## Before touching hardware

From a clean repository checkout, run the local gates and create the evidence pack:

```bash
pnpm release:readiness
pnpm pilot:evidence -- --clean --require-artifacts
```

On Windows PowerShell, use:

```powershell
pnpm release:readiness
pnpm pilot:evidence -- --clean --require-artifacts
```

The evidence-pack command writes to the ignored `artifacts/pilot-evidence-pack/` directory. It records the repository commit, runtime versions, report hashes, available `app.asar` and APK hashes, and copies the approved evidence templates. It does not copy plaintext databases, plaintext documents, passwords, or OS key material. The manifest must have `syntheticOnly: true` and `pendingHardwareSignoff: true` before the operator begins.

## Execution sequence

| Phase                           | Gates                                                                             | Required result before continuing                                                                                                                                                                  | Stop conditions                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Local baseline               | `LOCAL-TS-001` through `LOCAL-PILOT-001`, `LOCAL-FORMAT-001`, and `LOCAL-GIT-001` | All local gates pass for the intended commit; APK and desktop artifact hashes are recorded.                                                                                                        | Any local failure, missing artifact, non-synthetic report, or dirty evidence source that cannot be explained.                                                               |
| 1. Windows package and startup  | `WIN-INSTALL-001`, `WIN-INSTALL-002`, `WIN-INSTALL-003`                           | Packaged Hub installs, starts without a development server, upgrades without losing synthetic records, and follows the approved retained-data policy.                                              | Renderer loads remotely, key prompt is bypassed, migration changes counts unexpectedly, or uninstall destroys retained data.                                                |
| 2. Windows security and storage | `WIN-SEC-001`, `WIN-DB-001`                                                       | Packaged IPC/navigation boundary fails closed; correct OS-backed key reopens the encrypted database; invalid/missing key fails closed.                                                             | Sensitive error details leak, remote/child-frame request succeeds, database opens without the approved key, or migration checksum/foreign-key checks fail.                  |
| 3. Windows TLS and backup       | `WIN-LAN-001`, `WIN-BACKUP-001`                                                   | TLS failure/recovery and encrypted backup manifest are evidenced before any restore attempt.                                                                                                       | Wrong trust anchor is accepted, redirect/cleartext path succeeds, backup contains plaintext, or manifest hashes do not match.                                               |
| 4. Replacement Hub recovery     | `WIN-RESTORE-001`, `WIN-RECOVERY-001`                                             | Restore opens under the approved key, hashes/counts reconcile, interrupted-upgrade rollback preserves the synthetic audit trail, and Admin approval is recorded.                                   | Restore mutates the source copy, requires plaintext export, loses patient sequence/vault metadata, or TLS trust changes silently.                                           |
| 5. Android install and database | `AND-BOOT-001`, `AND-BOOT-002`, `AND-BOOT-003`, `AND-DB-001`                      | Floor and current devices install/enroll, start offline according to policy, honor expiry, and open/migrate SQLCipher Room without destructive fallback.                                           | Device binding is bypassed, cloud access is required, offline policy is ignored, key invalidation is not detected, or data is lost after process death.                     |
| 6. Android LAN and lifecycle    | `AND-SYNC-001` through `AND-SYNC-004`, `AND-BILL-001`                             | Six scopes, durable claims, two-device fairness, retry-now, TLS outage/restart, process death, and billing-summary validation are evidenced.                                                       | Wrong trust anchor succeeds, permanent security failures retry indefinitely, duplicate claims occur, conflict state disappears, or malformed billing data changes balances. |
| 7. Android documents            | `AND-DOC-001` through `AND-DOC-003`                                               | Synthetic document upload/view works only through the approved role path; no Android persistence remains; `FLAG_SECURE`, viewer cleanup, picker limits, and camera-optional behavior are observed. | Content appears in Room, external files, logs, WorkManager input, recents, recordings, screenshots, or unauthorized roles.                                                  |
| 8. Signed release lifecycle     | `AND-RELEASE-001`                                                                 | Signed APK signature/checksum, installation, upgrade, rollback, revocation, and re-enrollment evidence are complete.                                                                               | APK identity cannot be verified, downgrade bypasses policy, revocation is ignored, or a revoked device regains access without Admin approval.                               |

## Evidence handling

The operator creates one validation record before Phase 1 and updates it after each phase. Every scenario must include the commit, artifact hashes, device labels, API/security-patch metadata, trust-anchor version, scenario result, evidence paths, and unresolved blockers. Use sanitized labels rather than personal device identifiers whenever possible.

A failed scenario receives `failed` and a defect reference. An unavailable device, missing signer, unavailable recovery media, or absent approved key procedure receives `blocked`, not `passed`. A scenario may be `not-applicable` only when an Admin records the reason and confirms that it does not affect the release scope.

At close-out, hash the completed record and checklist, preserve only synthetic evidence, remove temporary plaintext files, and keep the final pack read-only. Update the unified readiness report only after the evidence has been reviewed; do not manually edit a gate from `pending` to `passed` without its corresponding record.

## Final release decision

The first physical rehearsal is successful only when every P0/P1 gate is `passed`, no gate is `failed` or `blocked`, the backup/restore procedure has completed on a replacement Hub, the Android document and process-death checks are complete, and two Admins approve the evidence record. Until then, Elite Clinic remains **advanced pre-pilot** and must not receive real patient data.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/workstation-and-device-validation-matrix.md "Elite Clinic workstation and device validation matrix"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/synthetic-pilot-rehearsal-and-recovery-runbook.md "Elite Clinic synthetic pilot rehearsal and recovery runbook"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/templates/physical-device-validation-record.json "Elite Clinic physical-device evidence record template"
