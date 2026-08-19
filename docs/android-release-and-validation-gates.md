# Android Release and Validation Gates

## Purpose

This document records the Android release-pipeline work for Elite Clinic. The goal is to make Android builds reproducible from a clean checkout while separating evidence available in the sandbox from validation that requires a physical Android device or a Windows Hub.

> The Android client remains an offline-first client. It stores encrypted local clinical data and an outbox, synchronizes through the approved secure LAN session, and must not persist doctor-document content beyond the scoped in-memory viewer workflow.

## Reproducible toolchain

The project now checks in the Gradle wrapper at version **8.13**. The Android Gradle Plugin is pinned to **8.12.2**, Kotlin is pinned to **2.2.20**, KSP is pinned to the published `2.2.20-2.0.4` release, and the Kotlin JVM toolchain is JDK **17**. The application compiles and targets API **36**, supports a minimum API level of **29**, and uses SDK Build Tools **35.0.0** in the release environment.

The root scripts provide a single entry point for the release pipeline:

| Command                              | Purpose                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm android:unit`                  | Runs `testDebugUnitTest` through the checked-in Gradle wrapper.                      |
| `pnpm android:lint`                  | Runs `lintRelease` through the wrapper.                                              |
| `pnpm android:assemble`              | Produces the release APK through `assembleRelease`.                                  |
| `pnpm android:verify`                | Runs static source and policy checks.                                                |
| `pnpm android:verify -- --artifacts` | Also verifies the assembled APK archive.                                             |
| `pnpm android:release-check`         | Runs unit tests, release lint, release assembly, and artifact verification in order. |

The wrapper runner is `scripts/run-android-gradle.mjs`. The static verifier is `scripts/verify-android-release.mjs`. Machine-specific `local.properties`, Android SDK directories, and Gradle state are not versioned.

## Static release checks

The verifier currently enforces the following invariants before a release artifact is considered structurally acceptable:

| Control              | Evidence checked                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolchain            | Gradle 8.13 wrapper, AGP 8.12.2, Kotlin 2.2.20, published KSP version, JDK 17, API 29 minimum, and API 36 compile/target.                                                                                             |
| Backup and transport | `allowBackup=false`, `fullBackupContent=false`, and `usesCleartextTraffic=false` in the manifest.                                                                                                                     |
| Encrypted database   | Room schema version 6, migrations 1→2 through 5→6, encrypted `SupportSQLiteOpenHelper.Factory`, and no destructive downgrade migration.                                                                               |
| Synchronization      | All six approved scopes: appointments, patient-summary, encounter-summary, clinical-notes, export-governance, and billing-summary. WorkManager periodic scheduling and typed failure classification are also checked. |
| Doctor vault         | `FLAG_SECURE`, `ZeroizableBytes`, scoped `useViewerCopy`, ephemeral PDF preview cache use with deletion, and no persistent document APIs in the document workspace.                                                   |
| APK structure        | A release APK exists, is non-empty, and contains `classes.dex` and `AndroidManifest.xml`.                                                                                                                             |

The local unit suite uses the pinned JVM `org.json` implementation because Android framework JSON methods are not executable in ordinary local JVM tests. Protocol-facing Base64 helpers use Java’s standard API, which is available at the project’s minimum API level and allows the same canonical encoding to be tested on the JVM and executed on Android.

## Sandbox evidence

The following checks passed during this phase:

| Check                                      | Result                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Gradle configuration and plugin resolution | Passed through the checked-in wrapper.                                                                                 |
| Android unit tests                         | **36 tests passed** across the existing sync, crypto, billing, document-stream, zeroization, and health suites.        |
| Release lint                               | Passed after declaring camera hardware optional; the first run correctly found the missing `uses-feature` declaration. |
| Release APK assembly                       | Passed and produced `app-release-unsigned.apk`.                                                                        |
| Static verifier                            | All toolchain, manifest, migration, scope, vault, WorkManager, failure-classification, and artifact checks passed.     |
| APK archive inspection                     | Passed for `classes.dex`, `AndroidManifest.xml`, and non-empty output.                                                 |

The sandbox emitted two non-blocking environment/build messages: the SDK command-line tools reported an SDK XML-version compatibility warning, and Android packaging reported that `libsqlcipher.so` could not be stripped and was therefore packaged unstripped. The release artifact still assembled successfully; these messages must be reviewed during the Windows/Android workstation release run.

## Required physical-device and workstation gates

The sandbox cannot prove the following requirements and they remain mandatory before a synthetic pilot:

1. Install the signed APK on at least one Android 10/API 29 device and one current clinic-supported device.
2. Confirm first-run device enrollment, Admin PIN handling, biometric unlock where available, inactivity lock, and thirty-day offline-access expiry.
3. Verify SQLCipher-backed Room opening, migrations 1→6, recovery after process death, and behavior when the Keystore key is unavailable or invalid.
4. Exercise all six LAN synchronization scopes with a Windows Hub, including offline queueing, durable claims, multi-device fairness, transient TLS failure, permanent security failure, retry-now, and sync-health display.
5. Verify Android-to-Hub doctor-document upload and Android view-only retrieval while confirming no document is written to Room, external storage, app files, backups, logs, WorkManager input, or the outbox.
6. Confirm `FLAG_SECURE` on screenshots, recent-apps previews, screen recording, and supported OEM behavior.
7. Run signed release install, upgrade, rollback, and checksum/signature verification with the Admin-controlled update flow.
8. Confirm camera-optional installation behavior and camera workflows on devices with and without camera hardware.

A physical-device run must use synthetic patients, doctors, documents, appointments, and billing records only. No production patient data should be introduced during this validation phase.

## References

[1]: https://developer.android.com/build/releases/agp-8-12-0-release-notes "Android Gradle Plugin 8.12.0 release notes"
[2]: https://developer.android.com/tools "Android command-line tools and SDK packages"
[3]: https://services.gradle.org/distributions/gradle-8.13-bin.zip "Gradle 8.13 binary distribution"
