# Step 21 Plan: Minimum-Necessary Clinical Synchronization

## Executive decision

Step 21 should build the first clinical-data synchronization slice between the Windows Hub and the secure Android foundation from Step 20. The scope should be **read-first, least-privilege, conflict-aware synchronization** for patient identity summaries, appointments, and selected encounter summaries. It should not begin with unrestricted patient-record replication or silent last-write-wins overwrites.

The Windows Hub remains authoritative. Android reads from its encrypted local store and receives signed or authenticated delta responses through a narrow protocol. Every synchronization request is authorized for the enrolled user, device, role, capability, purpose, and patient scope. FHIR R4 JSON may represent resources, but the Hub protocol is responsible for authentication, authorization, consent, audit, and conflict policy [1].

This step follows the Android offline-first model: the local data source is the source of truth for UI reads, repositories mediate network or Hub access, and synchronization updates local state before observers receive changes [2]. It also follows mobile-health data-minimization guidance to limit collection, permissions, retention, and exposure of health data [3].

## Objectives

Step 21 has seven objectives. First, the Hub must expose a versioned, local-LAN synchronization protocol that can return only the records and fields the enrolled Android device is permitted to use. Second, Android must store a local synchronization cursor and apply verified deltas transactionally. Third, the protocol must distinguish new records, updates, deletions, redactions, conflicts, and authorization failures. Fourth, patient identity and clinical content must be partitioned by capability and workflow. Fifth, the first Android user experience must provide offline patient lookup, appointment views, and selected encounter-summary views without waiting on the Hub. Sixth, a bounded outbox must support low-conflict operational writes such as appointment acknowledgment or queue notes, while clinical note changes continue through the existing amendment workflow. Seventh, all sync operations must be auditable without logging clinical payloads.

## Non-goals

Step 21 will not provide a general FHIR server, public internet API, cloud sync, unrestricted patient-record replication, offline admin configuration, mobile export signing, or automatic clinical-note merging. It will not use last-write-wins for signed encounter notes, diagnoses, amendments, or other legally significant clinical content. Full record deletion on Android is deferred to the secure de-enrollment and retention policy workflows.

## Trust and authorization model

The Hub authorizes every synchronization request using the authenticated enrolled device, user, current session, role capabilities, organization, and requested scope. Android never treats its cached role snapshot as sufficient to authorize a new server request. The Hub may issue a signed/authenticated policy response with an expiry, but the server remains authoritative when reachable.

| Sync scope                 | Typical roles                                            | Default fields                                                                                           | Notes                                                                                |
| -------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Appointment schedule       | Admin, Doctor, Nurse, Receptionist                       | Appointment ID, patient display ID, scheduled time, specialty, assigned clinician, state                 | Needed for reception and clinical workflow                                           |
| Patient identity summary   | Admin, Doctor, Nurse, Receptionist with operational need | Patient display ID, name, contact summary, age band or DOB only when justified, duplicate/guardian flags | Must be purpose-scoped; receptionist does not automatically receive clinical history |
| Encounter summary          | Admin, Doctor; Nurse only when capability permits        | Encounter ID, date, specialty, clinician, signed state, approved diagnosis summary, amendment state      | Full note body is not part of the default first slice                                |
| Clinical note content      | Admin and Doctor only, explicit capability               | Signed note body, version, amendment chain, projection hash                                              | Read-only first; any edits use amendment workflow                                    |
| Export governance metadata | Admin and approved clinical roles                        | Package ID, status, disclosure/receipt state, no recipient identity unless needed                        | Reuses Step 19 status and Step 18 governance boundaries                              |

The Hub must enforce patient-scope restrictions. A device may be limited to a specialty, department, date window, assigned clinician, or explicit patient list. Scope changes require a new signed policy or authenticated enrollment refresh.

## Synchronization protocol

The first protocol should be a versioned JSON-over-LAN API implemented by the local Hub. It may use HTTPS when certificate provisioning is available; the initial isolated-LAN deployment must still bind requests to the enrolled device and use authenticated encryption or a signed request/response envelope rather than relying on network location alone.

### 3.1 Capability discovery

The Android client begins with a capability request containing:

```text
protocolVersion
organizationId
deviceId
enrollmentId
userId
clientVersion
lastAcceptedStatusSequence
requestedScopes
```

The Hub returns supported scope names, server time, current policy version, minimum client version, current status-package sequence, and a signed/authenticated capability response. Unsupported scopes are rejected explicitly rather than ignored.

### 3.2 Delta request

A delta request contains:

```text
organizationId
deviceId
userId
syncSessionId
scope
cursor
clientBaseVersion
knownPolicyVersion
requestedAt
requestNonce
```

The response contains:

```text
protocolVersion
syncSessionId
scope
serverCursor
serverSequence
generatedAt
validUntil
fullSyncRequired
changes[]
conflicts[]
redactions[]
nextCursor
responseIntegrity
```

Each change has a stable resource ID, resource type, resource version, last-updated timestamp, operation, payload or redacted marker, source snapshot hash, and authorization scope. The response must be bounded by maximum records, bytes, and time window. It must not include fields outside the requested scope.

### 3.3 FHIR representation

FHIR R4 resources may represent the payload using `Patient`, `Appointment`, `Encounter`, `Composition`, `Condition`, and selected clinic profiles. The Hub must provide a capability statement or equivalent protocol declaration for supported interactions and profiles. FHIR version metadata and resource version IDs must be preserved when present [1].

The Android repository must treat an incomplete summary response as read-only. A resource returned with `_summary` or an allow-listed element subset cannot be used as the basis for a full update. Full clinical note editing remains a separate amendment request.

## Database and local synchronization model

Step 21 should add a Windows migration 17 for sync metadata and outbox control. Android should create an equivalent Room schema version after Step 20’s encrypted local store is available.

| Logical table            | Key fields                                                                                           | Purpose                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `sync_devices`           | Device ID, enrollment ID, user, policy version, last-seen, state                                     | Tracks Hub-side enrolled-device synchronization state     |
| `sync_cursors`           | Device ID, scope, cursor, server sequence, accepted-at                                               | Stores the last transactionally applied delta per scope   |
| `sync_resource_versions` | Device ID, scope, resource type/id, version, hash, last-updated, redacted                            | Supports idempotency and version-aware conflict detection |
| `sync_audit_events`      | Sync ID, device, user, scope, result, counts, reason, audit event                                    | Records synchronization without payload logging           |
| `sync_outbox`            | Operation ID, device, user, resource type/id, base version, operation, payload hash, state, attempts | Queues bounded operational writes for later submission    |
| `sync_conflicts`         | Operation ID, resource ID, local base, server version, conflict type, resolution state               | Requires explicit review or amendment path                |

The Hub must enforce unique `(device_id, scope, cursor)` and idempotent operation IDs. A delta application transaction must update resources, versions, cursor, audit summary, and any redaction markers together. If any item fails validation, the transaction must roll back and retain the previous cursor.

## Conflict policy

Conflicts are categorized rather than silently merged:

| Conflict                                               | Policy                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Same operation ID repeated                             | Return the original acknowledgment; do not duplicate the write                           |
| Server version equals client base version              | Apply the permitted operation and increment server version                               |
| Server version is newer for appointment acknowledgment | Return a structured conflict; UI may offer refresh and retry                             |
| Server version is newer for clinical note or diagnosis | Reject automatic write; require amendment or clinician review                            |
| Resource revoked/redacted                              | Remove or mark local copy according to retention policy and record a redaction event     |
| Cursor expired or history compacted                    | Require bounded full resync for that scope; preserve old data until replacement succeeds |
| Unauthorized scope                                     | Do not return partial data; record policy-denied result without payload                  |

Last-write-wins is prohibited for signed encounter notes, diagnoses, amendments, export governance decisions, patient merges, and other legal or clinical records. The existing amendment and projection workflow remains the only supported correction path for signed notes.

## Android repository and UI

The Android repository exposes local `Flow` or equivalent observable state for appointments, patient summaries, encounter summaries, sync status, and conflicts. The UI never reads directly from the network client. A `SyncCoordinator` runs capability discovery, delta retrieval, verification, local transaction application, and outbox draining away from the main thread.

The first screens should be:

1. A sync status dashboard showing last successful sync per scope, server sequence, local cursor, stale/offline state, and the reason for any rejection without exposing payloads.
2. An offline appointment list with filters limited to the authorized scope.
3. A patient lookup that returns only the minimum identity summary required by the user’s role.
4. A read-only encounter summary with signed version, amendment count, projection hash, and an explicit indication when content is partial or redacted.
5. A conflict and pending-operation screen for authorized staff, with no automatic merge of clinical records.

Sensitive screen behavior must align with Step 20 lock, expiry, screenshot, notification, and de-enrollment controls. Mobile-health privacy guidance supports minimizing retained data and explaining sensitive collection and sharing clearly [3].

## Outbox and Hub acknowledgments

The outbox first increment should support only low-conflict operational operations selected by the clinic, such as appointment acknowledgment, arrival state, or a non-clinical queue note. Every operation includes an operation ID, device/user identity, requested capability, base resource version, payload hash, reason, and creation time.

The Hub responds with one of:

```text
accepted
already-applied
conflict
rejected-unauthorized
rejected-expired-session
rejected-policy
rejected-validation
requires-amendment
```

The Android app must retain the acknowledgment and remove or transition the outbox row atomically. `requires-amendment` must link the user to the existing encounter amendment workflow rather than providing a free-form overwrite.

## Security and privacy controls

The protocol must use encrypted transport on production LAN deployments and must authenticate the device and user. Request nonces, bounded timestamps, replay detection, and response integrity are required. The Hub must reject stale or duplicate request envelopes. Synchronization logs must contain identifiers, counts, hashes, result codes, and timing metadata only; no patient names, notes, diagnoses, raw FHIR, or tokens.

The Android client must apply minimum-necessary field projection on the Hub, not merely hide fields in the UI. Local retention must be configurable by policy and must be cleared or redacted on de-enrollment, scope removal, or explicit retention expiry. Backups remain disabled. Permission requests must be limited to required features. The FTC recommends minimizing data, limiting access and permissions, securing retained data, using strong authentication, and maintaining an inventory of data flows [3].

## Implementation tasks

| ID  | Task                                           | Deliverable                                                                              | Acceptance criteria                                                                           |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 21A | Freeze sync contracts                          | TypeScript/Kotlin schemas, scope and capability enums, cursor and change models          | Unknown fields/scopes, oversized payloads, invalid versions, and stale envelopes are rejected |
| 21B | Add Windows migration 17                       | Sync devices, cursors, resource versions, audit, outbox, and conflict tables             | Fresh and upgraded databases migrate without data loss; indexes and foreign keys pass tests   |
| 21C | Implement Hub sync authorization               | Device/user/session/purpose/scope enforcement                                            | Unauthorized scopes return no payload and create an audit summary                             |
| 21D | Implement delta writer                         | Bounded versioned changes with redaction and full-sync responses                         | Same cursor is idempotent; expired cursor produces explicit full-sync-required response       |
| 21E | Implement Android local apply engine           | Transactional Room delta application and cursor advancement                              | A failed item does not advance cursor or partially replace local data                         |
| 21F | Implement conflict protocol                    | Version-aware outbox acknowledgments and conflict records                                | Clinical content conflicts require amendment; no silent overwrite                             |
| 21G | Implement read-first Android UI                | Appointments, patient summary, encounter summary, sync dashboard                         | UI works offline from local state and respects role/scope filters                             |
| 21H | Implement bounded outbox                       | Appointment/queue operations, retry policy, acknowledgment storage                       | Retry only transient failures; idempotent operation IDs prevent duplicates                    |
| 21I | Implement signed/authenticated response checks | Nonce, timestamp, response-integrity, and replay protection                              | Tampered, stale, wrong-device, wrong-user, and wrong-policy responses are rejected            |
| 21J | Add audit and privacy tests                    | No-payload logging, unauthorized access, redaction, retention, and de-enrollment tests   | Test fixtures never contain real patient data; logs contain no clinical payload               |
| 21K | Add cross-platform vectors                     | TypeScript/Kotlin delta and conflict test vectors                                        | Both platforms agree on hashes, versions, cursors, and result codes                           |
| 21L | Document LAN sync and recovery runbook         | Admin setup, device scope, full resync, conflict, de-enrollment, and rollback procedures | A clinic administrator can operate the workflow without cloud services                        |

## Sequencing and dependencies

Implementation should proceed in the following order:

1. Complete Step 20’s secure Android session, encrypted local store, and device enrollment foundation.
2. Freeze the sync wire contracts, field allow-lists, and role-to-scope matrix.
3. Implement migration 17 and Hub authorization before exposing any clinical delta endpoint.
4. Build read-only delta retrieval and Android transactional apply logic.
5. Add local-first Compose screens and sync diagnostics.
6. Add the bounded outbox and explicit conflict workflow.
7. Add cross-platform test vectors, privacy/security tests, and LAN failure drills.
8. Only after this step passes should later work add broader clinical editing or richer FHIR synchronization.

## Definition of done

Step 21 is complete when a synthetic Windows Hub can authorize an enrolled Android device, deliver an allow-listed appointment and patient-summary delta, apply it transactionally while offline afterward, and display the local data without internet or LAN. A stale cursor, unauthorized scope, wrong device, tampered response, redaction, expired session, and version conflict must be handled explicitly. A low-conflict operational outbox operation must be idempotent, while a clinical-note conflict must route to amendment rather than overwrite. No synchronization log or status response may contain patient names, notes, diagnoses, or raw clinical payload beyond the authorized local record.

## Open decisions

| Decision                 | Recommended default                                                        | Why it matters                                           |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| First read scope         | Appointments, patient identity summary, encounter summary                  | Delivers useful offline workflow while limiting exposure |
| First write scope        | Appointment acknowledgment and non-clinical queue state                    | Lower conflict and lower clinical risk                   |
| Transport                | Authenticated encrypted LAN protocol; USB status exchange remains separate | Prevents treating network location as authorization      |
| Cursor model             | Per-device, per-scope opaque cursor plus server sequence                   | Supports delta sync and explicit full resync             |
| Clinical note edits      | Existing amendment workflow only                                           | Preserves signed-record integrity                        |
| Retention                | Admin-configurable bounded local retention with de-enrollment wipe         | Limits device exposure and supports clinic policy        |
| Conflict UI              | Explicit review and refresh; no automatic clinical merge                   | Prevents silent clinical overwrite                       |
| FHIR interaction support | Read and version metadata first; no general FHIR write API                 | Keeps protocol surface small and auditable               |

## References

[1]: https://www.hl7.org/fhir/R4/http.html "HL7 FHIR R4 — RESTful API"
[2]: https://developer.android.com/topic/architecture/data-layer/offline-first "Android Developers — Build an offline-first app"
[3]: https://www.ftc.gov/business-guidance/resources/mobile-health-app-developers-ftc-best-practices "FTC — Mobile Health App Developers: Best Practices"
