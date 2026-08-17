# Step 22 Secure Session Frames and WorkManager Synchronization

## Scope

This increment defines and implements the authenticated transport frame boundary that must carry minimum-necessary synchronization and outbox operations after enrollment. It also adds the Android WorkManager scheduling and encrypted local-outbox coordinator design. The transport remains local/LAN-first; no cloud relay is introduced.

## AES-GCM frame format

Each frame carries protocol metadata outside the encrypted plaintext and authenticates that metadata as AES-GCM AAD.

| Field              | Rule                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `protocolVersion`  | Must be `1`.                                                                                                        |
| `messageType`      | `sync-request`, `sync-response`, `outbox-request`, or `outbox-response`.                                            |
| `sessionId`        | Must match the currently authenticated session.                                                                     |
| `direction`        | Must match the direction-specific key: `client-to-hub` or `hub-to-client`.                                          |
| `counter`          | Starts at `0` and must equal the next expected counter exactly. Gaps and repeats are rejected.                      |
| `nonceBase64`      | Base64 encoding of a 12-byte nonce formed as `4-byte session prefix                                                 |     | uint64-big-endian counter`. |
| `aadHash`          | SHA-256 of canonical JSON containing the protocol version, message type, session ID, direction, counter, and nonce. |
| `ciphertextBase64` | AES-256-GCM ciphertext.                                                                                             |
| `tagBase64`        | 16-byte GCM authentication tag.                                                                                     |

The frame codec increments the send counter only after encryption succeeds. The receive counter advances only after GCM authentication succeeds. It rejects a different session ID, wrong direction, nonce mismatch, AAD tampering, invalid tag length, counter gaps, replayed counters, and counter exhaustion. No plaintext or protected payload is written to logs.

The nonce prefix is session-scoped and the keys are direction-separated, so a nonce is never reused with the same key during a session. When a counter reaches the platform-safe maximum, the codec refuses further frames rather than risking integer overflow or nonce reuse.

## Key confirmation

After ECDH and HKDF derivation, the root key yields three independent 256-bit keys: `client-to-hub`, `hub-to-client`, and `key-confirmation`. The confirmation MAC is HMAC-SHA-256 over canonical JSON:

```json
{
  "messageType": "session-key-confirmation",
  "protocolVersion": 1,
  "role": "client",
  "sessionId": "session-01",
  "transcriptHash": "<sha256>"
}
```

The transcript hash, session ID, and role are all bound to the confirmation. The receiver compares the MAC in constant time and rejects a different transcript, session, or role. A session must not be promoted to active synchronization until both sides have confirmed the same transcript and directional key material.

## Shared vectors and tests

The repository contains `test-vectors/session-frame-vectors.json`, generated deterministically by `tools/generate-session-frame-vectors.mjs`. TypeScript tests compare the exact nonce, AAD hash, ciphertext, and tag against this fixture. Android JVM tests load the same resource and perform the same comparison. Additional tests cover replay, counter gaps, nonce tampering, ciphertext tampering, HKDF, ECDH symmetry, and key-confirmation binding.

## WorkManager scheduling

The Android application exposes `configureSecureSyncCoordinator` only after an encrypted Room database and an approved secure-session transport factory are available. Configuration schedules two unique work paths:

| Work           | Policy                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Periodic sync  | Unique periodic work every three hours with `NetworkType.CONNECTED`, exponential backoff, and a 30-second initial delay. Existing periodic work is updated rather than duplicated. |
| Immediate sync | Unique one-time work for an explicit user action, an accepted local write, or a session-renewal trigger. Existing immediate work is kept to prevent a burst of duplicate drains.   |

The network constraint means the job waits for a usable network interface; it does not assume that Internet access exists. The transport factory must select the local Hub LAN route and return `null` when the Hub is unavailable. A null transport, session establishment failure, or transient protocol failure returns `Result.retry()` and preserves pending local data.

A revoked enrollment, invalid session, failed key confirmation, or other non-retryable security failure returns a terminal failure result and must surface a synchronization-status event to the UI. The worker does not silently downgrade to plaintext or bypass the encrypted database.

## Offline queue mechanism

`local_outbox` remains inside the encrypted Room database. The coordinator reads a bounded batch of pending rows, atomically claims each row from `pending` to `sending`, submits it only through the authenticated secure session, and transitions the row according to the Hub result:

| Hub result                        | Local state       | Worker behavior                                                                                                      |
| --------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Accepted or already applied       | `acknowledged`    | Continue with the next event.                                                                                        |
| Version conflict                  | `conflict`        | Stop treating the event as automatically retryable; expose the conflict for the existing clinical conflict workflow. |
| Policy or validation rejection    | `rejected`        | Preserve the reason code and do not retry blindly.                                                                   |
| Network/session/transient failure | Back to `pending` | Stop the batch and return `Result.retry()`.                                                                          |

The queue is idempotent at two levels. The local event ID and operation ID are stable across retries, while the Hub’s existing outbox acknowledgment and conflict logic decides whether an operation was accepted, already applied, or conflicted. A crash after the Hub applies an operation but before the local state update is therefore recovered by replaying the same operation ID and accepting an `already-applied` result.

The coordinator processes at most 50 events per run by default and never exceeds 200. It closes the secure session in a `finally` block. It does not delete acknowledged rows in this increment; retention and administrator-controlled archival will be defined with the audit-retention policy.

## Secure session renewal

Before every drain, the transport factory checks enrollment status, offline-access expiry, session `validUntil`, and the current Hub trust anchor. A session that is near expiry is renewed through a fresh signed session-init/grant exchange with fresh ephemeral ECDH keys and a new transcript hash. Counters are never reset within a session. A new session ID and nonce prefix are mandatory for renewal, and old frame keys are discarded after close.

## Remaining integration boundary

The WorkManager and queue coordinator are implemented as transport-neutral boundaries. The next increment must implement the LAN transport adapter that serializes sync requests and outbox operations into the encrypted frame codec, feeds verified Hub responses into `SyncRepository.applyDelta`, and maps the Hub’s existing outbox acknowledgment result states to `SecureOperationResult`. Until that adapter and the Android build pass, the worker must not be considered production-ready.
