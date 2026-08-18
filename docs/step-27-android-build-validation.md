# Step 27: Android Build and Migration Validation

## Purpose

Step 27 converts the Android implementation from source-reviewed to workstation-verified. The Android project targets API 36, supports Android API 29 and newer, uses JDK 17, and depends on Room KSP generation, SQLCipher, WorkManager, Compose, and the Android Keystore integration. The repository now exports Room schemas to `apps/android/app/schemas` during the KSP build so the v4→v5 migration can be inspected as a build artifact.

> The Android build gate is a release requirement. Passing the TypeScript and desktop checks does not substitute for Kotlin compilation, Room code generation, Android packaging, or device execution.

## Repository-side changes

The Android application build file now configures Room schema export, generated Kotlin support, and incremental processing. The new `scripts/step27-android-build-gate.mjs` script performs a cross-platform preflight check for Java, Android SDK variables, a Gradle wrapper or system Gradle, the Android project files, and Room schema configuration. With `--run`, it executes the debug unit tests, debug lint, and debug APK assembly tasks.

The script is intentionally fail-closed. It exits with status 2 when a required workstation component is missing, rather than claiming that Android verification passed.

## Workstation prerequisites

The validation workstation must have JDK 17, the Android SDK with the project’s compile SDK installed, platform tools, a Gradle wrapper or a compatible system Gradle installation, and USB debugging support for physical-device tests. Android Studio is optional if the command-line SDK and Gradle tooling are installed correctly, but it is recommended for device inspection and log capture.

From the repository root, run the preflight check first:

```bash
node scripts/step27-android-build-gate.mjs
```

On Linux or macOS, the expected environment variables are commonly configured as follows:

```bash
export JAVA_HOME="/path/to/jdk-17"
export ANDROID_SDK_ROOT="/path/to/android-sdk"
```

On Windows PowerShell, configure equivalent process or user environment variables:

```powershell
$env:JAVA_HOME = "C:\Path\To\jdk-17"
$env:ANDROID_SDK_ROOT = "C:\Users\<user>\AppData\Local\Android\Sdk"
```

If the repository does not yet contain a Gradle wrapper, generate one on the Android workstation using a compatible Gradle installation, review the generated wrapper files, and commit them only after confirming they are reproducible. The sandbox intentionally does not generate a wrapper because it has neither Gradle nor the Android SDK.

## Android verification commands

From `apps/android`, execute the following commands after the preflight check succeeds:

```bash
./gradlew testDebugUnitTest
./gradlew lintDebug
./gradlew assembleDebug
```

On Windows PowerShell, use:

```powershell
.\gradlew.bat testDebugUnitTest
.\gradlew.bat lintDebug
.\gradlew.bat assembleDebug
```

The combined repository helper can run the same gate from the repository root:

```bash
node scripts/step27-android-build-gate.mjs --run
```

A successful build must produce the debug APK and a Room schema export containing version `5`. The schema output must be reviewed to confirm the `local_outbox` lease and failure columns, the device/state/time index, and the `sync_health` attempt and lifecycle timestamp columns.

## Required Android test matrix

| Category                  | Required checks                                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build and code generation | Kotlin compilation, Compose compilation, KSP Room implementation generation, SQLCipher linkage, debug APK assembly, and lint.                                                                                        |
| Room migration            | Open a representative encrypted v4 database, apply migration 4→5, verify all new columns and defaults, confirm the fairness index, and confirm existing rows remain readable.                                        |
| Canonical protocol        | Canonical JSON vectors, sparse-array and floating-point edge cases, session-key derivation, encrypted-frame vectors, nonce/counter enforcement, and key-confirmation behavior.                                       |
| Failure behavior          | Retryable I/O, TLS failures, terminal security failures, cancellation preservation, safe reason-code fallback, and WorkManager retry/failure mapping.                                                                |
| Health behavior           | Running, ready, retry-scheduled, and blocked transitions; attempt increments; last failure, terminal, and completion timestamps; retry-now operation; and persistence across process restart.                        |
| Outbox behavior           | Device-scoped ordering, two-minute lease boundary, stale-claim recovery, cancellation release, claim-token mismatch rejection, lost-claim detection, finalization, transient release, and idempotent acknowledgment. |
| Security                  | Android Keystore identity key, encrypted Room opening, no cleartext transport, certificate/trust-anchor validation, offline expiry, inactivity lock, and protected backup behavior.                                  |
| Packaging                 | Debug APK installation, release build configuration, signing and checksum process, upgrade path, rollback path, and minimum API 29 device compatibility.                                                             |

## Physical-device follow-up

After the workstation gate passes, use one Windows hub and at least two Android devices with synthetic data. Test enrollment and administrator approval, successful LAN synchronization, no-LAN offline operation, hub restart, Android process death, simultaneous device synchronization, TLS recovery, incorrect trust anchors, network outage, stale outbox claims, conflict and rejection responses, and health-state visibility.

The physical-device phase must record only sanitized diagnostics. It must not use real patient data. A test result should include the workstation OS, Android model and API level, application version, hub certificate/trust-anchor version, test scenario, expected result, observed result, and any sanitized log or database evidence.

## Current sandbox status

The sandbox has no Kotlin compiler, Android SDK, Gradle wrapper, or system Gradle. Consequently, it can validate repository structure, run the Node preflight helper to identify missing prerequisites, and continue executing TypeScript and desktop checks, but it cannot claim that the Android build gate has passed. The Android workstation result remains a required external validation before release.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/6c2d9f8/apps/android/app/build.gradle.kts "Elite Clinic Android Gradle configuration"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/6c2d9f8/apps/android/README.md "Elite Clinic Android README"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/6c2d9f8/apps/android/app/src/main/java/com/elite/clinic/data/EliteDatabase.kt "Elite Clinic Room database and migrations"
