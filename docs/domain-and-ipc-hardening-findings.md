# Domain and IPC Hardening Findings

**Prepared by:** Manus AI
**Repository:** Elite Clinic Management System
**Scope:** Post-audit domain edge cases, billing lifecycle invariants, patient-merge field resolution, and IPC sender-boundary coverage

## Executive summary

The next hardening increment converted audit concerns into targeted regression tests instead of broad architectural refactors. The tests exposed two real implementation defects. First, approving a patient merge without passing a second field-decision object silently replaced the original request decisions with an empty object, causing every field to default to the target patient. Second, a fully refunded billing payment was not treated as unavailable on a subsequent refund attempt; it returned an over-refund error instead of the payment-not-refundable state.

Both defects are fixed and covered by regression tests. The increment also adds explicit sender-boundary checks for destroyed Electron windows and missing sender frames. All local release-readiness gates remain green, while the physical workstation and device gates remain pending.

## Findings and fixes

| Area                         | Defect or gap                                                                                                                                                                                                         | Remediation                                                                                                                                                                        | Regression coverage                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Patient merge review         | `reviewMergeCase` defaulted omitted review-time decisions to `{}`, discarding the Admin’s original request decisions.                                                                                                 | The review path now loads the pending merge case and preserves its stored field decisions when the review call omits overrides. Explicit review-time decisions still replace them. | Source/target field-resolution test verifies mixed decisions for name, Arabic name, date of birth, sex, phone, and national ID. |
| Billing refund lifecycle     | A fully refunded payment was checked only for `voided`, so a second refund attempt produced `REFUND_EXCEEDS_PAYMENT` rather than `PAYMENT_NOT_REFUNDABLE`.                                                            | `refunded` payments are now treated as unavailable alongside `voided` payments.                                                                                                    | Billing test covers over-refund rejection and duplicate refund rejection after full refund.                                     |
| Electron IPC sender boundary | Existing centralized validation covered trusted, child-frame, foreign-webContents, origin, packaged-file, and remote-frame cases, but destroyed windows and missing sender frames were not explicit regression cases. | Added direct fail-closed assertions for both cases.                                                                                                                                | Desktop IPC security test suite.                                                                                                |

## Why these fixes matter

Patient merge decisions are a clinical identity-integrity control. The target patient must reflect the explicit Admin-approved choices, and the source record must remain auditable as merged history. Silently defaulting to the target undermines the review screen’s purpose and could discard a deliberate source-field selection.

Billing refund states are financial lifecycle controls. A payment that has been fully refunded must not enter a second refund workflow. Returning a stable unavailable-state error is clearer to operators and prevents downstream code from treating a zero remaining balance as a new refundable transaction.

Electron sender validation must fail closed across lifecycle boundaries. A renderer can be destroyed or produce an event with no usable sender frame during teardown or abnormal navigation. Those cases must never reach a business handler.

## Validation evidence

The final `pnpm release:readiness` run passed all eight local gates:

| Gate                                                     | Result                                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| TypeScript contract, database, domain, and desktop tests | Passed.                                                                                                                    |
| TypeScript workspace typecheck                           | Passed.                                                                                                                    |
| Desktop production build                                 | Passed.                                                                                                                    |
| Existing desktop archive verification                    | Passed.                                                                                                                    |
| Android release pipeline                                 | Passed, including JVM tests, lint, APK assembly, static policy checks, and archive checks.                                 |
| Synthetic clinic-day rehearsal                           | Passed, including encrypted backup/restore, billing, doctor-document vault, offline queue, and six synchronization scopes. |
| Formatting                                               | Passed.                                                                                                                    |
| Git whitespace validation                                | Passed.                                                                                                                    |

The local report records **17 physical gates as pending**. Those gates still require Windows workstations and Android hardware, including installer upgrade/reinstall behavior, OS-backed key recovery, SQLCipher startup and migration behavior, LAN/TLS synchronization, `FLAG_SECURE`, process death, document no-persistence, signed APK upgrade/rollback, and device revocation/re-enrollment.[1]

## Scope deliberately deferred

The audit also suggested broad refactors such as splitting large packages, introducing Hilt, and decomposing the monolithic migration and contract files. Those changes are intentionally deferred. They do not directly close the newly confirmed defects and would add change surface before the first physical pilot. They should be scheduled after device evidence or performed incrementally when a concrete maintainability defect justifies them.

The export DOB contract remains permissive because redacted export payloads are a separate serialization boundary from the canonical patient schema. The source patient and registration schemas continue to require ISO dates; tightening the export field would require an explicit compatibility decision for historical or redacted payloads rather than an unreviewed schema change.

## Release interpretation

This increment improves the software’s local evidence and closes two concrete domain defects discovered through adversarial regression tests. It does not change the release classification: the system remains **advanced pre-pilot** until the workstation and device validation matrix is executed with synthetic data on the intended Windows Hub and Android devices.[2]

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/workstation-and-device-validation-matrix.md "Elite Clinic workstation and device validation matrix"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/security-remediation-audit-findings.md "Elite Clinic security remediation audit findings"
