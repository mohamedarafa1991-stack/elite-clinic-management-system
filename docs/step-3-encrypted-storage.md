# Step 3: Encrypted Production Storage

## Decision summary

Elite Clinic uses `better-sqlite3-multiple-ciphers@12.11.1` for the Windows desktop database. This package is based on **SQLite3MultipleCiphers** and is not the same file format or compatibility claim as SQLCipher. The choice is the approved **Choice B** from the implementation decision: use a Windows-capable encrypted SQLite provider while documenting the distinction accurately.

The database package applies encryption only in `production` mode. Production startup requires an explicit `DatabaseKeyProvider`; opening production storage without one throws `ELITE_DB_ENCRYPTION_REQUIRED`. Development and automated tests continue to use synthetic, unencrypted storage and must never contain real patient data.

## Key lifecycle

On the first production launch, the Electron main process generates a random 32-byte database key. The key is passed to the database driver only from the main process and is never exposed to the renderer or preload bridge. The main process asks Electron `safeStorage` to wrap the key and writes the wrapped result to the per-user application-data directory.

On Windows, Electron `safeStorage` uses the Windows Data Protection API (DPAPI). The default wrapped-key path is:

```text
%APPDATA%\\<Electron application name>\\elite-clinic.db.key
```

The encrypted database itself is stored beside it as `elite-clinic.db`. The wrapped-key file contains a small versioned JSON envelope with the provider name and base64 ciphertext. It is written through a temporary file and rename operation so a process interruption does not intentionally replace a valid key with a partially written value.

On later launches, the provider checks that OS-backed encryption is available, reads the versioned envelope, unwraps the ciphertext with `safeStorage`, decodes the key, and validates that it is exactly 256 bits. A missing OS key provider, malformed envelope, failed unwrap, invalid key length, or database-open failure causes production initialization to fail closed. The application does not silently create a new key for an existing database.

## Security boundaries and limitations

> `safeStorage` protects the wrapped key from other Windows users, but it does not protect it from another application running in the same Windows user context.

Consequently, safeStorage is a key-wrapping mechanism, not a complete endpoint-security boundary. The design still depends on Windows account protection, application signing and update hygiene, Electron context isolation, authenticated clinic sessions, device enrollment, audit logging, backup controls, and least-privilege administration. The renderer never receives the raw database key, a database handle, filesystem paths, or unrestricted IPC.

Loss of the Windows user profile, DPAPI recovery material, or the wrapped-key file can make the database unrecoverable. The production backup and recovery design must therefore preserve an encrypted database backup and a separately controlled recovery procedure. A backup is not considered restorable until it has been tested on a clean device and the audit trail remains intact. Key export, rotation, and disaster recovery are separate operational work and are not implemented by this Step 3 provider.

## Native-module packaging

`better-sqlite3-multiple-ciphers` contains native code and must be rebuilt against the exact Electron version and target architecture used for Windows packaging. The repository includes the following command:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm desktop:native-rebuild
pnpm desktop:build
```

The rebuild command uses `@electron/rebuild@4.2.0`. Because rebuilding changes the native binary from the Node ABI to the Electron ABI, run the repository’s Node-based typecheck and test commands before the native rebuild, and treat the native rebuild as a packaging-stage operation. Packaging work must additionally include a packaged Windows smoke test that creates a new encrypted database, closes it, reopens it with the same OS-wrapped key, verifies a known row, and confirms that an incorrect key is rejected. The Linux sandbox probe that established compatibility for version 12.9.0 is disposable validation evidence and is not part of the production application.

The project pins `better-sqlite3-multiple-ciphers` to `12.11.1`. The earlier `12.9.0` release passed the initial encryption probe, but the upstream `12.11.1` release includes the V8 changes required by modern Electron builds; it successfully rebuilt against this project’s Electron 43 target. The `13.0.3` release was not selected because it crashed during database creation in the current validation environment. The pin must not be changed without repeating native-build and encryption smoke tests on the supported Windows 10/11 architectures.

## Database API contract

The database layer exposes a narrow `DatabaseKeyProvider` contract:

| Property or method | Purpose                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `providerName`     | Identifies the approved key-provider implementation for diagnostics and future policy checks.                              |
| `storageScheme`    | Declares `os-wrapped-random-key`, distinguishing this mechanism from an embedded or hard-coded secret.                     |
| `getOrCreateKey()` | Returns key material to the main-process database opener; the database layer clears the returned buffer after applying it. |

The database layer does not know how Windows DPAPI or Electron safeStorage works. This keeps OS-specific key handling in the desktop main process and allows synthetic providers in tests without placing production secrets in test fixtures.

## Verification completed

Step 3 includes automated coverage for the following behaviors:

| Area                 | Verification                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Production guard     | Production mode rejects an absent key provider.                                              |
| Encrypted open       | A synthetic 32-byte provider opens SQLite3MultipleCiphers production storage and migrations. |
| Reopen               | The same key reopens the database and reads an existing row.                                 |
| Provider persistence | The Electron provider creates one wrapped key, then reuses it on the next opening.           |
| Fail closed          | The Electron provider rejects unavailable safeStorage and corrupted key envelopes.           |
| Type safety          | Workspace TypeScript checks pass, including the native driver import.                        |

## Out of scope for Step 3

This step does not implement key rotation, administrator recovery ceremonies, encrypted USB backup orchestration, Android database encryption, clinical data modules, or patient-identity workflows. Those features must consume this storage boundary rather than bypassing it.
