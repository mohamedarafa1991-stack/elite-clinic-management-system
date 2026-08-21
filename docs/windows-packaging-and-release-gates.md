# Windows Packaging and Release Gates

## Packaging contract

The repository now defines a reproducible Electron Builder configuration in [`electron-builder.yml`](../electron-builder.yml). The intended production artifact is an **x64 NSIS installer** for Windows 10/11 with the product identity `com.eliteclinic.managementsystem` and display name `Elite Clinic Management System`.

The installer is configured as a per-user installation rather than an elevated machine-wide installation. It presents a normal install directory choice, creates Start Menu and Desktop shortcuts, does not run the application automatically after installation, and does not delete application data during uninstall. This policy protects the local Hub database and the DPAPI-wrapped key envelope, which live under Electron’s per-user `userData` directory.

> Uninstalling the application must not silently remove `elite-clinic.db`, `elite-clinic.db.key`, doctor document vault files, signing-key material, or recovery artifacts. Data destruction remains an explicit Admin/operator workflow outside the installer.

## Build order

The packaging script is [`scripts/package-desktop.mjs`](../scripts/package-desktop.mjs). It runs the following sequence:

1. Build the contracts, database, and auth packages.
2. Build the desktop TypeScript main/preload output and Vite renderer.
3. On the Windows workstation only, run `pnpm desktop:native-rebuild` against the exact Electron version and target architecture.
4. Use `pnpm deploy --legacy --filter @elite/desktop --prod` to create a self-contained production app directory without workspace symlinks pointing outside the package.
5. Run Electron Builder for either a Linux unpacked validation directory or the Windows NSIS target.

The NSIS command deliberately fails when run on a non-Windows host. The Linux sandbox can validate the archive layout, but it cannot provide evidence for Windows DPAPI, Windows native ABI loading, installer execution, code signing, firewall behavior, or Windows upgrade/uninstall semantics.

## Package contents

The Builder configuration uses `asar: true` and unpacks native `.node` modules and the encrypted SQLite package under `resources/app.asar.unpacked`. The application archive must contain the compiled main process, preload bridge, renderer entrypoint, compiled `@elite/auth`, `@elite/contracts`, and `@elite/database` packages, and the PDF export runtime. TypeScript source and runtime smoke scripts must not be included in the production archive.

The verifier is [`scripts/verify-desktop-package.mjs`](../scripts/verify-desktop-package.mjs). It validates `linux-unpacked` on Linux and `win-unpacked` on Windows, using the same archive-structure checks for the target platform, and emits `DESKTOP_PACKAGE_PASS` markers for every check.

## Data and upgrade policy

Production startup uses the existing `ElectronSafeStorageKeyProvider`. The encrypted database and wrapped key are stored under the per-user Electron `userData` location. An upgrade must preserve that directory and must reopen the existing encrypted database with the same key. The application must never create a replacement key merely because a database exists but the key file cannot be unwrapped.

A clean-install rehearsal must verify creation of the database, migration history through migration 23, the wrapped key envelope, and the first-run bootstrap path. An upgrade rehearsal must start from a synthetic database at the prior schema, install the new version over it, apply migration 23, and verify that existing synthetic patients, billing records, audit events, doctor documents, and signing metadata remain readable. An uninstall/reinstall rehearsal must verify that retained data is still present after reinstall and that an operator can explicitly select a separate data-destruction procedure when required.

## Required Windows workstation gates

The following checks are not claimed by the Linux sandbox and must be executed on a controlled Windows 10/11 workstation:

| Gate                  | Required evidence                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native ABI            | `better-sqlite3-multiple-ciphers@12.11.1` and `argon2` load from the packaged app after the exact Electron 43.4.0 rebuild.                             |
| Encrypted startup     | A clean packaged launch creates an encrypted database, closes it, reopens it with the same DPAPI-wrapped key, and reads a known synthetic row.         |
| Wrong-key fail-closed | A copied database opened with an incorrect key fails without silently replacing the key file.                                                          |
| Clean install         | NSIS installation succeeds for a non-administrator user, creates shortcuts, and starts without a development server.                                   |
| Upgrade               | A previous synthetic build upgrades without data loss and applies pending migrations exactly once.                                                     |
| Uninstall/reinstall   | Uninstall preserves user data; reinstall can reopen the retained encrypted database.                                                                   |
| Packaged IPC          | Context isolation, trusted `file://` origin, strict parsing, and safe error redaction pass from the packaged renderer.                                 |
| Network boundary      | Remote navigation and unexpected child-frame IPC remain blocked; LAN TLS startup and firewall instructions are verified.                               |
| Signing               | If the clinic-owned Windows certificate is unavailable, the artifact is marked internal pilot-only and not represented as a production-signed release. |

## Current sandbox evidence

The Linux packaging proxy completed successfully using Electron Builder 26.15.3 and Electron 43.4.0. The archive verifier confirmed the compiled entrypoints, local workspace packages, PDF runtime, unpacked encrypted SQLite native module, absence of source/test files, and the per-user data policy. This is packaging-structure evidence only; it is not a substitute for the Windows gates above.

The unified local readiness command is `ELITE_READINESS_REPORT=artifacts/release-readiness/local-gates.json pnpm release:readiness`. It runs the repository tests, typecheck, desktop build, available archive inspection, Android release pipeline, synthetic pilot rehearsal, formatting, and whitespace checks, then records the Windows and Android physical gates as `pending` until they are executed on the intended workstation and devices. The complete cross-platform matrix is documented in [`docs/workstation-and-device-validation-matrix.md`](workstation-and-device-validation-matrix.md).
