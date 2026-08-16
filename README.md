# Elite Clinic Management System

Elite Clinic Management System is a local-first Windows and Android clinic application for one Cairo clinic. The system is designed for sensitive patient, clinical, financial, staff, and communication data.

Steps 1–3 establish the secure Electron boundary, shared contracts, migration-controlled database layer, authentication foundation, device enrollment, encrypted production storage, synthetic-data tests, and project security rules. No real patient data belongs in this repository.

## Workspace

The repository is organized as a pnpm monorepo. `apps/desktop` contains the Electron desktop and local Hub shell. `apps/android` is reserved for the native Kotlin/Jetpack Compose client. `packages/contracts` contains shared Zod contracts for device, patient, guardian, appointment, and synchronization data. `packages/database` contains the first schema migration and local database boundary. `docs` contains the security and data architecture baselines.

## Development safety

Read `agents.md` before making changes. Development uses synthetic fixtures only. Do not commit patient records, images, credentials, database files, encryption keys, APKs, signing keystores, or exported reports.

The production database uses `better-sqlite3-multiple-ciphers@12.11.1` with SQLite3MultipleCiphers and an Electron safeStorage/Windows DPAPI-wrapped random key. Production startup remains fail-closed if the OS-backed provider is unavailable. The test database uses synthetic, in-memory SQLite storage only.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm db:test
pnpm security:check
```

The desktop shell can be started after dependencies are installed with `pnpm desktop:dev`. Before Windows packaging, run `pnpm desktop:native-rebuild` against the exact Electron target; see `docs/step-3-encrypted-storage.md` for the required order and recovery limitations.
