# Step 22 LAN Transport and Verified Queue Integration

## Transport boundary

The Windows Hub now exposes a bounded `POST /sync/lan` endpoint. The endpoint accepts and returns only JSON-serialized `SessionFrame` objects. It does not accept plaintext synchronization requests, bearer tokens, patient payloads, or unauthenticated device identifiers. The frame router looks up the registered session by `sessionId`, decrypts and authenticates the frame with the direction-specific AES-GCM key, dispatches the request, and encrypts the response with the opposite direction key.

The HTTP server binds to `0.0.0.0` by default for the clinic LAN and uses port `8787`, both configurable through `ELITE_SYNC_BIND_ADDRESS` and `ELITE_SYNC_PORT`. The request body is capped at 1 MiB. Invalid, oversized, unauthenticated, replayed, or unknown-session frames are rejected without exposing protected payloads in logs. The authenticated frame layer, rather than the LAN address, is the security boundary.

## Message mapping

| Frame message     | Encrypted plaintext envelope           | Hub operation                                                                                               | Response                                                                                                                      |
| ----------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `sync-request`    | `{ "request": SyncDeltaRequest }`      | `SynchronizationService.getDelta` after capability, device, policy, scope, cursor, and identity checks.     | `{ "response": SyncDeltaResponse }`, including the existing Ed25519 response signature and response-integrity hash.           |
| `outbox-request`  | `{ "request": SyncOutboxInput }`       | `SynchronizationService.queueOutbox` after `sync.write`, device, organization, scope, and operation checks. | An encrypted acknowledgment envelope containing the stable operation ID and durable Hub-queue acceptance state.               |
| `sync-response`   | `{ "response": SyncDeltaResponse }`    | Android unwraps the response and passes the signed delta JSON to `SyncRepository.applyDelta`.               | Cursor and metadata are changed only after identity, freshness, response-integrity, payload-hash, and Ed25519 checks succeed. |
| `outbox-response` | `{ "operationId": ..., "state": ... }` | Android maps the result to its encrypted local outbox state.                                                | Accepted/already-applied, conflict, rejected, or retryable result.                                                            |

Hub queue acceptance means that the operation has reached the Hub’s durable synchronization outbox. The existing Hub acknowledgment state machine remains authoritative for downstream application and conflict resolution. The stable operation ID makes retransmission safe and allows an Android crash between transport response and local state update to recover through an `already-applied` acknowledgment.

## Android adapter

`LanSyncHttpSession` sends only encrypted frame JSON over the LAN. It treats HTTP 401/403 and secure-session authentication failures as terminal security failures, HTTP timeouts and 429/5xx responses as retryable failures, and other non-success responses as terminal protocol rejections. `VerifiedDeltaSynchronizer` unwraps a response frame and delegates the complete signed delta to `SyncRepository`, which applies resource metadata, cursor, and import-event changes in one encrypted Room transaction.

The transport does not write cursor state, resource metadata, or outbox state directly. This prevents a successful network write from being mistaken for a verified clinical read. Queue transitions are performed by `SecureSyncCoordinator`: `pending` → `sending` is an atomic claim; accepted or already-applied becomes `acknowledged`; conflicts become `conflict`; policy or validation rejection becomes `rejected`; transient errors return the event to `pending` and cause WorkManager retry.

## Failure taxonomy

| Failure                                                                                       | Android behavior                                                  | Data safety                                        |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| Unknown session, invalid tag, wrong key, wrong direction, replay, or key-confirmation failure | Terminal security failure; do not retry blindly.                  | No cursor or queue mutation.                       |
| Enrollment revoked or offline-access expiry reached                                           | Terminal security failure; require re-enrollment or Admin action. | Pending events remain encrypted and pending.       |
| LAN unavailable, timeout, 429, or Hub 5xx                                                     | `Result.retry()` with exponential backoff.                        | Sending event returns to pending.                  |
| Signed delta rejected by identity, freshness, integrity, or payload-hash verification         | Terminal verification failure.                                    | No cursor advancement and no resource replacement. |
| Hub conflict or validation rejection                                                          | Mark local event conflict or rejected.                            | Reason code is retained for the clinical workflow. |

## Current integration boundary

The frame router and LAN server are wired into the Electron main process, but the session registry is intentionally populated only by the future enrollment/session-establishment service. Until that service registers a verified session, the endpoint rejects requests with an unknown-session response. This avoids creating an unauthenticated LAN backdoor while still providing the transport boundary needed by the Android session implementation.

The next increment should implement session registration after signed key confirmation, add a concrete request factory for each synchronization scope, and connect `VerifiedDeltaSynchronizer` to the WorkManager coordinator. It should also add a LAN integration test using a loopback server and an in-memory Hub database, then execute the Android JVM tests in the Android build environment.
