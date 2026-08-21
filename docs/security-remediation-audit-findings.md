# Security Remediation: Audit Findings

**Prepared by:** Manus AI
**Repository:** Elite Clinic Management System
**Scope:** Confirmed authentication and Android sensitive-memory findings from the August 19, 2026 audit

## Executive summary

The audit identified three technically meaningful security concerns: username-enumeration timing behavior in login, immutable managed-runtime copies in the Android doctor-document response path, and unclear ownership of the SQLCipher database passphrase byte array. The first finding was confirmed and fixed with constant-work Argon2id verification for missing or inactive users. The Android document path was redesigned so production retrieval returns decrypted response bytes, parses the document payload without `JSONObject` content parsing, decodes Base64 directly into mutable bytes, and clears transport buffers after parsing. The SQLCipher factory now receives an explicit copy while the caller-owned passphrase is cleared.

These changes reduce exposure and make ownership boundaries explicit. They do **not** claim forensic erasure from a managed Android runtime, native SQLCipher buffers, CPU registers, or operating-system memory. The existing `ZeroizableBytes` contract remains a best-effort cleanup mechanism for mutable arrays it owns.[1]

## Finding status

| Audit finding                           | Current disposition                                                                                                                                                                                                                                                                        | Evidence                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Username-enumeration timing difference  | **Remediated in source and tests.** Login performs Argon2id verification against a fixed production-cost dummy hash when no active user record is available, then returns the same invalid-credentials error.                                                                              | `packages/auth/src/index.ts`; authentication regression test; full auth suite.                                                        |
| Android document Base64/String exposure | **Mitigated in the production document path.** The secure session returns decrypted bytes; the byte parser handles the wrapped response and decodes `contentBase64` into mutable bytes without creating a document-bearing `JSONObject` or immutable Base64 content string.                | `SecureSession.requestDoctorDocumentBytes`; `LanSyncHttpSession.postEncryptedPayload`; `DoctorDocumentStream.kt`; raw-byte JVM tests. |
| Android SQLCipher passphrase lifetime   | **Caller-owned source cleanup implemented.** `EncryptedRoomFactory` passes `passphrase.copyOf()` to SQLCipher and clears the original `DeviceKeyStore`-owned array in `finally`. SQLCipher retains its own copy because the factory/helper may need it when Room first opens the database. | `EncryptedRoomFactory.kt`; Android static verifier assertion.                                                                         |
| Android managed-runtime zeroization     | **Residual limitation documented.** No code can promise forensic erasure of all JVM, framework, graphics, or native copies. Physical-device process-death and viewer lifecycle testing remains required.                                                                                   | `ZeroizableBytes.kt`; Android physical validation matrix.                                                                             |

## Authentication remediation

The login path now performs password verification before rejecting a missing or inactive user. Existing active users continue to use their stored Argon2id hash. Missing or inactive records use a precomputed Argon2id dummy hash with the same configured parameters: memory cost 19,456 KiB, time cost 2, and parallelism 1. The externally visible invalid-credential result remains unchanged.

The regression test injects a verifier seam rather than comparing wall-clock durations. It confirms that an unknown username invokes the verifier once, receives an Argon2id-formatted dummy hash rather than an actual user hash, and returns the same invalid-credential error. This avoids a flaky timing threshold while directly testing the security invariant.

## Android document-memory remediation

The previous path returned a decrypted response as a `JSONObject`, which caused document content to pass through immutable Base64 and JSON `String` representations. The production path now calls `requestDoctorDocumentBytes`. `LanSyncHttpSession` decrypts the response into a mutable `ByteArray` and returns it to the scoped caller. `DoctorDocumentStreamParser` uses a bounded byte-oriented JSON reader for the flat document response and nested `response` envelope. The `contentBase64` value is accumulated in mutable bytes, decoded directly to document bytes, and cleared after decoding. The caller clears the decrypted response payload after parsing, while `InMemoryDoctorDocument` owns the document bytes through `ZeroizableBytes` and exposes only a cleared viewer copy.

The parser validates document MIME type, declared size, maximum size, SHA-256 content hash, document identifier, display name, filename, and version before ownership transfer. The Android static verifier now requires the raw-byte session method, byte parser, and byte-oriented reader. JVM tests cover direct and wrapped responses, viewer-copy cleanup, hash tampering, unsupported MIME, and size mismatch.

This is a meaningful reduction in plaintext lifetime, not an absolute memory-erasure guarantee. A device run must still inspect process death, viewer cancellation, rotation/background behavior, recent-app previews, screen recording, cache contents, logs, WorkManager input, Room, and external storage.

## SQLCipher passphrase remediation

The compiled SQLCipher 4.17.0 factory retains the supplied passphrase array inside the factory/helper and may need it when the database is first opened. Clearing that same array immediately after factory construction could therefore invalidate the factory. The implementation now makes this lifecycle explicit: the factory receives a copy, and the original byte array returned by `DeviceKeyStore.databasePassphrase()` is cleared in a `finally` block.

This is the safe boundary supported by the current SQLCipher API. The factory’s retained copy remains under the SQLCipher/Room lifecycle and cannot be cleared by the caller without a library-supported close/reset operation. Physical-device verification must confirm first open, subsequent Room opens, process death, key invalidation, and recovery behavior.

## Validation evidence

The final unified readiness run passed all eight local gates:

| Gate                                                     | Result                                                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript contract, database, domain, and desktop tests | Passed; the authentication suite now contains 51 tests.                                                                                            |
| TypeScript typecheck                                     | Passed.                                                                                                                                            |
| Desktop production build                                 | Passed.                                                                                                                                            |
| Existing desktop archive verification                    | Passed.                                                                                                                                            |
| Android release pipeline                                 | Passed; JVM tests, lint, release APK assembly, static checks, and archive checks succeeded.                                                        |
| Synthetic clinic-day rehearsal                           | Passed; migration 24, billing, doctor compensation, document vault, six sync scopes, offline queue, and encrypted backup/restore checks succeeded. |
| Formatting                                               | Passed.                                                                                                                                            |
| Git whitespace validation                                | Passed.                                                                                                                                            |

The local report intentionally retains **23 physical scenario gates as pending**, covering the complete workstation/device matrix. These include Windows installer/key/backup/restore behavior, Android offline policy and Keystore behavior, two-device LAN synchronization, `FLAG_SECURE`, process death, picker providers, document no-persistence, signed APK lifecycle, and device revocation/re-enrollment. The full execution order and evidence templates are in the workstation/device validation matrix.[2]

## Remaining recommendation

The next release decision should not be based on the local green result alone. The security fixes should be reviewed on the intended Windows Hub and Android devices using synthetic data. After the physical gates pass, maintainability refactors such as Android ViewModel extraction, domain-package decomposition, and large-file splitting can proceed incrementally. They should not be combined with the security fix commit or performed immediately before the first pilot unless a newly observed defect requires them.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/apps/android/app/src/main/java/com/elite/clinic/security/ZeroizableBytes.kt "Elite Clinic Android zeroizable byte ownership contract"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/main/docs/workstation-and-device-validation-matrix.md "Elite Clinic workstation and device validation matrix"
