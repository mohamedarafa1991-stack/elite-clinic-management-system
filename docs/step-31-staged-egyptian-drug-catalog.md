# Step 31 — Staged Egyptian Drug Catalog

## Purpose

Step 31 adds the first approved Egyptian drug-catalog workflow to the Elite Clinic Hub. The workflow is intentionally **staged and Admin-controlled**: downloading or selecting a source file never changes the active catalog. Only a validated snapshot with at least one valid record can be promoted by an authenticated session holding the existing `module.manage` capability.

The implementation uses the approved [`mahmoudfalous/eg-drugs`](https://github.com/mahmoudfalous/eg-drugs) source. The source repository currently documents `data/eg_drugs.json`, a June 2026 dataset version, the documented field mapping, and a non-commercial-use caveat. Elite Clinic therefore records the source URL, commit, file name, dataset version, content SHA-256, and explicit license acknowledgment on every snapshot. The source findings are recorded in [`docs/eg-drugs-source-findings.md`](./eg-drugs-source-findings.md).

## Data model

Migration 22 creates `drug_catalog_snapshots` and `drug_catalog_entries`. A snapshot has one of four lifecycle states: `staged`, `active`, `superseded`, or `rejected`. SQLite enforces that at most one snapshot is active and that the same source commit/file/content hash cannot be staged twice. Entries retain the normalized source values, warning flags, validation status, and row-level validation errors.

The active catalog is a snapshot, not an in-place update. Promoting a staged snapshot supersedes the previous active snapshot and records its ID as `previous_snapshot_id`. Rollback is permitted only to that exact previous active snapshot. Existing future prescription or medication-reference features can therefore retain the selected snapshot identity rather than silently changing historical data when a new catalog is approved.

## Source and validation path

The main process exposes two Hub-only paths through the centralized IPC registrar. An Admin can stage a local JSON file selected from a removable drive, or request a remote fetch from the allowlisted `github.com`/`raw.githubusercontent.com` path for `mahmoudfalous/eg-drugs`. The remote path is bounded by a 30-second timeout and a 50 MB response limit. Both paths converge on the same domain service and normalization logic.

Normalization calculates a SHA-256 hash over the exact UTF-8 source content, parses the JSON array, maps the documented source fields, converts prices defensively, normalizes the seven warning flags, detects duplicate external IDs, and records row-level errors. A source with invalid rows can be staged for review, but a snapshot with zero valid rows cannot be promoted. The source content itself is not stored in the database; the pinned metadata and normalized entries are stored locally, which preserves the local-first deployment model without retaining an unnecessary raw payload.

## Admin workflow

The Admin panel is colocated with the existing billing/catalog management area and is hidden unless the session has `module.manage`. It supports remote fetch-and-stage, offline file staging, snapshot selection, entry review, validation-error inspection, promotion, rejection, and rollback. Every lifecycle transition requires a reason and writes a redacted audit event containing source identifiers, hashes, counts, and transition reasons rather than raw drug payloads.

The workflow is deliberately not exposed to Android clients. No synchronization scope has been added for the catalog in this increment. The Hub remains the authority for catalog ingestion and promotion; later medication/prescription work can consume only the active snapshot through an explicit read contract.

## Verification evidence

Synthetic tests cover source normalization, price and warning mapping, invalid-row accounting, idempotent re-import, missing management capability, rejection of zero-valid-record snapshots, promotion, one-active-snapshot enforcement, rollback, audit event order, snapshot status styling, staged/active action visibility, and rollback eligibility. The centralized IPC coverage assertion now expects 136 guarded handlers, including the seven catalog channels.

## Remaining release gates

This increment is source- and test-verified in the sandbox, but it is not a production-data approval. Before the synthetic pilot, the team must confirm the clinic’s permitted use under the upstream repository’s license note, pin and record the exact source commit used for the pilot, exercise local USB import on the packaged Windows Hub, and verify the Admin-only workflow on Windows 10/11. A future prescription feature must also define whether it stores a catalog snapshot ID and a display/value snapshot at the time of prescribing.
