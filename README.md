# Elite Clinic Management System

Elite Clinic Management System is a local-first Windows and Android clinic application for one Cairo clinic. The system is designed for sensitive patient, clinical, financial, staff, and communication data.

Step 1 establishes the secure Electron boundary, shared contracts, migration-controlled database layer, synthetic-data tests, and project security rules. No real patient data belongs in this repository.

## Workspace

The repository is organized as a pnpm monorepo. `apps/desktop` contains the Electron desktop and local Hub shell. `apps/android` is reserved for the native Kotlin/Jetpack Compose client. `packages/contracts` contains shared Zod contracts for device, patient, guardian, appointment, and synchronization data. `packages/database` contains the first schema migration and local database boundary. `docs` contains the security and data architecture baselines.

## Development safety

Read `agents.md` before making changes. Development uses synthetic fixtures only. Do not commit patient records, images, credentials, database files, encryption keys, APKs, signing keystores, or exported reports.

The production database path is intentionally fail-closed until the SQLCipher-compatible driver and OS-backed key provider are explicitly configured. The test database uses an in-memory SQLite database only.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm db:test
pnpm security:check
```

The desktop shell can be started after dependencies are installed with `pnpm desktop:dev`. The next implementation phase adds authentication, Admin setup, device enrollment, and the encrypted production local-store provider.
