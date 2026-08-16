# Step 1 Security Baseline

## Scope

This baseline applies to the Windows Electron desktop application, the manually started local Hub, Windows client caches, Android local storage, synchronization, backups, media, and development tooling.

## Electron requirements

The BrowserWindow must use `contextIsolation: true`, `nodeIntegration: false`, and a restrictive Content Security Policy. The renderer may communicate only through narrow preload APIs. The preload layer must never expose raw `ipcRenderer`, filesystem paths, shell commands, database handles, or sync credentials.

Every IPC handler must validate the sender window, authenticated session, capability, department scope, input schema, and audit requirements. Navigation and new-window creation must be limited to approved local application routes. External URLs must be explicitly allowlisted and opened only after the user understands that protected health information must not be sent through them.

The application must pin a supported Electron release, keep dependencies current, run dependency audits, and test native modules on the supported Windows architectures. The renderer must not place authentication secrets, patient records, or database keys in `localStorage`.

## Key management

The Hub database key, media key, backup key, and device credentials are separate secrets. The database key is kept behind the main process and wrapped with Windows OS-backed protection where available. Android device keys are protected through Android Keystore. No shared clinic-wide secret is embedded in the application package.

The implementation must document key generation, rotation, recovery, loss, backup, and revocation. The key file and backup package must never be committed to Git or written to ordinary logs.

## Device and BYOD controls

Every Android installation that can access patient data is enrolled as a named device approved by an Admin. The Hub records device ID, owner, app version, API level, security patch level, last seen, last sync, status, and revocation state. A revoked device cannot receive new data. On reconnection, the Hub sends a best-effort wipe command and invalidates the session; the user interface must explain that an offline device cannot be remotely wiped.

The Android app uses an Elite PIN, optional biometrics, a configurable inactivity lock with a ten-minute default, excluded system backup where technically possible, encrypted private media storage, a thirty-day offline-access expiry, and a visible residual-risk warning for personal devices.

## Data handling

Development and tests use synthetic data only. Logs use opaque identifiers and never include clinical notes, national IDs, phone numbers, drug histories, images, or full patient records. Exported files are explicitly authorized, minimum-necessary, watermarked where appropriate, logged, and subject to a thirty-day cleanup policy.

## Backup and recovery

Backups are encrypted, integrity-checked, versioned, and stored on the Hub plus a rotating encrypted USB device. Restore always creates a safety backup first, previews the operation, records the operator, and preserves the original audit trail. A clean-device restore test is required before production.

## Clinical safety

Clinical rules, drug warnings, lab ranges, ultrasound formulas, CTG aids, and specialty modules require source/version metadata, test cases, a named Doctor approver, approval timestamp, and a visible status. Warnings are advisory only under the current product policy and must explain their inputs and source.

## Step 3 research findings

Electron's official safeStorage documentation states that on Windows it uses DPAPI and protects data from other Windows users, but not from other applications running in the same user's context. Elite will therefore use safeStorage only to wrap a random database key, not as a substitute for database encryption, process isolation, user authentication, or endpoint security. Source: https://www.electronjs.org/docs/latest/api/safe-storage

Electron's official native-module guidance states that native modules must be rebuilt for Electron's ABI, and that Windows packaging requires the Electron-compatible rebuild path and correct delay-load behavior. The SQLite3MultipleCiphers provider must therefore be rebuilt against the exact Electron version and target architecture used by the desktop package, then exercised in a packaged Windows smoke test. Source: https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules

## Step 3 compatibility decision

The current JourneyApps `@journeyapps/sqlcipher` repository explicitly states that Windows and prebuilt binary publishing are unsupported in its current phase. Source: https://github.com/journeyapps/node-sqlcipher

The current `better-sqlite3-multiple-ciphers` package supports multiple encryption algorithms and Windows native builds, but its upstream README describes SQLite3MultipleCiphers rather than claiming official SQLCipher compatibility; package metadata identifies it as a fork with multiple-cipher support. Elite pins the upstream fixed `12.11.1` release for the current Electron 43 target. Source: https://github.com/m4heshd/better-sqlite3-multiple-ciphers

Therefore Elite must not silently label `better-sqlite3-multiple-ciphers` as SQLCipher. The product decision is now **Choice B**: use `better-sqlite3-multiple-ciphers@12.11.1` with SQLite3MultipleCiphers, explicitly documented as a different encrypted SQLite provider. Production startup remains fail-closed unless the approved OS-backed key provider is available and the native module has been rebuilt and validated for the packaged Electron version and target architecture.
