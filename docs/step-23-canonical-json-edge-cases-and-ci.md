# Step 23: Canonical JSON Edge Cases and Pull-Request CI Design

## Scope and status

Step 23 hardens canonical JSON v1 and adds a pull-request CI gate for the TypeScript and Android Kotlin implementations. The canonical serializer is intentionally stricter than ordinary JSON serialization: it must not silently convert a JavaScript array hole or an unsafe floating-point value into a different byte sequence on Android.

The changes in this step are implemented in the shared TypeScript package, Android Kotlin serializer tests, the repository-level vector fixture, and `.github/workflows/canonical-json-pr.yml`. The Android workflow uses a hosted Linux runner to install JDK 17, Android SDK API 36/build tools 35.0.0, and Gradle 8.13 because the repository does not yet contain a Gradle wrapper.

## Canonical JSON v1 edge-case rules

| Input category                                 | TypeScript behavior                              | Kotlin behavior                                                                      | Reason                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Explicit JSON `null` in an array               | Encodes as `null`                                | Encodes as `null`                                                                    | `null` is a valid JSON value and must remain distinguishable from a missing array slot.                                          |
| JavaScript sparse array hole                   | Rejects with `ELITE_CANONICAL_JSON_SPARSE_ARRAY` | Rejects a missing/null array slot when a `JSONArray` is constructed programmatically | A hole is not a portable JSON value and must not become an ambiguous comma-only representation.                                  |
| `undefined` object property                    | Omitted                                          | Not representable in JSON input                                                      | Matches the existing Hub descriptor behavior, where undefined optional fields are omitted before hashing.                        |
| `undefined` array value                        | Rejects with `ELITE_CANONICAL_JSON_UNDEFINED`    | Not representable in parsed JSON; programmatic null-like holes are rejected          | Prevents JavaScript-only values from entering a cross-platform payload.                                                          |
| Safe integer, including ±9,007,199,254,740,991 | Encodes as the exact decimal integer             | Encodes as the exact decimal integer                                                 | This is the largest range that JavaScript can represent without integer precision loss.                                          |
| Fractional value, including `0.1 + 0.2`        | Rejects with `ELITE_CANONICAL_JSON_NUMBER`       | Rejects with `ELITE_CANONICAL_JSON_NUMBER`                                           | Fractional normalization can differ between runtimes and is not needed by the current protocol descriptors.                      |
| Non-finite value                               | Rejects with `ELITE_CANONICAL_JSON_NUMBER`       | Rejects with `ELITE_CANONICAL_JSON_NUMBER`                                           | JSON does not define NaN or infinity.                                                                                            |
| Integer outside the safe range                 | Rejects with `ELITE_CANONICAL_JSON_NUMBER`       | Rejects with `ELITE_CANONICAL_JSON_NUMBER`                                           | Avoids silently hashing a value that was rounded by a JavaScript parser or cannot be represented exactly by the shared contract. |
| Object keys                                    | Sorts recursively by UTF-16 code unit            | Sorts recursively using Java `String` ordering                                       | Java and JavaScript use compatible UTF-16 code-unit ordering for the supported key set.                                          |
| Arrays                                         | Retains element order                            | Retains element order                                                                | Array order carries clinical and protocol meaning.                                                                               |

The vector file includes a `numeric-safe-integer-boundaries` fixture for exact maximum/minimum safe integers, while sparse arrays and JavaScript floating-point expressions are covered by executable unit tests because those values cannot be represented faithfully in a JSON fixture file.

The TypeScript encoder is now the Hub’s single implementation path through the `@elite/contracts` package. The synchronization service no longer maintains a private serializer. Android uses the Kotlin implementation in `CanonicalJson.kt`; its JVM test reads the same `test-vectors/canonical-json-vectors.json` file through the Android test resource source set.

## Pull-request workflow

The workflow is named `Canonical JSON PR Checks` and runs for pull requests when they are opened, synchronized, reopened, or marked ready for review. It also supports manual dispatch for maintainers. Concurrency cancels an older run for the same pull request when a newer commit arrives, reducing redundant work without weakening the required check.

The workflow has two independent required jobs:

| Job          | Runner and toolchain                                                     | Required checks                                                                                                                          |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript` | Ubuntu 24.04, Node 22.13.0, pnpm 10.14.0                                 | Supported-file Prettier check, `pnpm typecheck`, canonical vector tests, and the complete TypeScript workspace test suite.               |
| `android`    | Ubuntu 24.04, JDK 17, Android SDK API 36/build tools 35.0.0, Gradle 8.13 | Toolchain inspection and `gradle --no-daemon --stacktrace testDebugUnitTest` in `apps/android`, followed by test-report artifact upload. |

The TypeScript job uses frozen-lockfile installation and the pnpm lockfile as the cache key. The Android job uses Java/Gradle dependency caching and basic Gradle action caching. Pull-request runs do not write application data, use no patient data, and require no repository secrets.

The workflow grants only `contents: read`. It does not request pull-request write access, package publishing access, deployment credentials, cloud credentials, or signing keys. The Android test job is deliberately limited to JVM unit tests and does not boot an emulator or access a clinic LAN.

## Android toolchain decision

The Android module currently declares Android Gradle Plugin 8.12.2, Kotlin 2.2.20, compile/target SDK 36, and Java toolchain 17. Android’s AGP 8.12 compatibility table lists Gradle 8.13 and JDK 17 as the default/minimum supported combination, with API 36 as the maximum supported API level [1]. The workflow therefore installs Gradle 8.13 explicitly through `gradle/actions/setup-gradle@v6` and Java 17 through `actions/setup-java@v4`.

The repository should eventually commit a Gradle wrapper and verify its distribution checksum. Once the wrapper exists, the workflow should change from `gradle ...` to `./gradlew ...`, and the explicit Gradle installation can be removed or changed to wrapper validation. Until then, the CI version is pinned in the workflow so an unannounced runner default cannot change the result.

The Android SDK setup uses `android-actions/setup-android@v4` and explicitly installs platform-tools, API 36, and build tools 35.0.0. The setup action documents that it installs command-line tools, accepts SDK licenses, and exposes `sdkmanager` and `adb` for subsequent steps [2]. The build-tools choice follows the repository’s AGP 8.12 compatibility table [1].

## Acceptance and branch-protection policy

The repository administrator should mark both workflow jobs as required status checks on the default branch. A pull request is not mergeable when either job fails, when the workflow cannot install the frozen lockfile, when a vector hash changes without updating the canonical fixture intentionally, or when Android unit tests fail to compile.

The workflow intentionally does not treat a skipped Android job as success. If Android SDK availability or Gradle installation breaks, the job fails visibly rather than silently proving only the TypeScript side. Test reports are uploaded with `if: always()` so failures remain diagnosable.

The TypeScript checks use the project’s own scripts and remain reproducible locally. The pnpm documentation recommends using the declared package-manager version and frozen CI installation behavior; the workflow pins the existing `packageManager` version explicitly for readability and fails if the lockfile is inconsistent [3].

## Failure diagnosis

| Failure                            | Likely cause                                                                                      | Maintainer action                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Vector hash mismatch in TypeScript | Canonical encoder changed, fixture was regenerated incorrectly, or object/array semantics drifted | Review the serializer diff and regenerate vectors only after confirming the protocol version change.              |
| Kotlin vector mismatch             | Android key ordering, number handling, or escaping differs from TypeScript                        | Inspect `CanonicalJson.kt`; do not change expected hashes to make the test pass.                                  |
| Android Gradle setup failure       | Toolchain or SDK package version changed                                                          | Check AGP release compatibility and update the workflow and documentation together.                               |
| Frozen-lockfile failure            | `pnpm-lock.yaml` does not match package manifests                                                 | Run the repository’s pinned pnpm version locally and commit the resulting lockfile intentionally.                 |
| Missing Android test report        | Test task did not start or report path changed                                                    | Treat as a CI configuration issue; update the artifact path only after confirming the new Gradle report location. |
| Sparse-array test regression       | Serializer reverted to ordinary `Array.map`/JSON behavior                                         | Restore explicit hole detection and add a regression test before merging.                                         |
| Precision regression               | A floating-point value is normalized or coerced before hashing                                    | Keep protocol numbers as exact safe integers or strings; reject unsupported values.                               |

## Future CI enhancements

The next security-oriented CI increment should commit the Gradle wrapper, verify its checksum, add a deterministic ECDH/HKDF/AES-GCM cryptographic vector set, and run a small Android API 29 instrumentation matrix. A later workflow can add dependency review, lockfile provenance checks, static analysis, and signed release builds in a separate protected workflow. Release signing keys must never be available to pull-request jobs.

## References

[1]: https://developer.android.com/build/releases/agp-8-12-0-release-notes "Android Developers — Android Gradle Plugin 8.12.0 compatibility"
[2]: https://github.com/android-actions/setup-android "android-actions/setup-android — GitHub Actions Android SDK setup"
[3]: https://pnpm.io/continuous-integration "pnpm — Continuous Integration"
[4]: https://github.com/gradle/actions/blob/main/docs/setup-gradle.md "Gradle Actions — setup-gradle"
