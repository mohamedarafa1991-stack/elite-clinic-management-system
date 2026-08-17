# Step 22: Secure Android Session and Device-Enrollment Handoff Protocol

## Status and scope

This document defines the secure session and device-enrollment handoff that should follow the Step 21 synchronization foundation. It is a protocol design and implementation specification, not a claim that the complete Android session manager has already been implemented.

The Windows Hub remains authoritative for organization identity, staff identity, role, device state, synchronization policy, revocation, and offline-access expiry. Android generates and retains its own device identity key, verifies Hub-signed enrollment and session messages, and stores protected enrollment metadata only inside the encrypted local database boundary established in Step 21.

The design supports both of Elite Clinic’s first-release transport choices: an administrator-controlled USB exchange and a LAN exchange. It does not require cloud authentication, a public internet endpoint, a phone number, an Android hardware identifier, or a shared password. A QR code may carry a short-lived challenge identifier or a fingerprint for operator convenience, but it must not carry a private key, a bearer token, or an unrestricted enrollment secret.

## Security objectives

The handoff must prove four separate properties. First, an administrator explicitly approved the named device for a specific clinic account and policy. Second, the Android app possesses the private key corresponding to the public key approved by the Hub. Third, a live session is bound to both the enrolled device and a fresh ephemeral key exchange rather than to a reusable bearer token. Fourth, every protected message is confidential, integrity-protected, fresh, and associated with a specific direction and sequence number.

> **Key separation rule:** the Hub’s Ed25519 signing key authenticates Hub-issued descriptors and responses. The Android device identity key authenticates the enrolled device. Ephemeral P-256 keys establish per-session confidentiality. None of these keys is used as a substitute for another key’s purpose.

The protocol uses Android Keystore for the non-exportable device identity private key. Android documents that Keystore key material is intended to remain non-exportable and supports restrictions on permitted operations and user authentication [1]. Android’s current guidance lists ECDSA with SHA-256, AES-256 GCM, SHA-256, and HMAC-SHA-256 among recommended choices for compatible cryptographic operations [2]. The ECDH transcript and key-confirmation steps follow the key-establishment and key-confirmation concepts described by NIST SP 800-56A [3].

## Actors and trust anchors

| Actor               | Trust material                                                             | Responsibility                                                                                                                |
| ------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Windows Hub         | Versioned Ed25519 private signing key and accepted public trust-anchor set | Issues enrollment responses, signs policy/session grants, evaluates device state, and records audit events.                   |
| Administrator       | Authenticated Hub account with `sync.manage`                               | Creates a one-time challenge, reviews the device request, approves or rejects enrollment, and can suspend or revoke a device. |
| Android device      | Keystore-protected P-256 identity key pair; local trust-anchor snapshot    | Generates the identity key, proves possession, verifies Hub signatures, derives sessions, and enforces local policy.          |
| Enrolled staff user | Hub account and local Android unlock factor                                | Uses the approved device within the role and scope policy; the local PIN/biometric is not a replacement for Hub identity.     |
| USB/LAN exchange    | No independent trust                                                       | Carries authenticated protocol envelopes; the transport is not itself an authority.                                           |

The Android app must pin or otherwise authenticate the accepted Hub public trust anchor before accepting the first enrollment response. The trust-anchor record should include `organizationId`, `signerKeyId`, `signerKeyVersion`, public key fingerprint, status, and installation provenance. A status-package or administrator-approved trust-anchor update may rotate the accepted Hub key, but a transport message must never silently replace the trust anchor.

## Phase A: administrator challenge

An administrator begins enrollment on the Hub by selecting an already active staff account, assigning a human-readable device name, choosing the initial scope set, and creating a one-time challenge. The Hub persists the challenge as pending and displays or exports an operator package.

The challenge descriptor is signed by the Hub and contains no private material:

```json
{
  "protocolVersion": 1,
  "messageType": "enrollment-challenge",
  "challengeId": "challenge-opaque-id",
  "organizationId": "org-elite-cairo",
  "intendedUserId": "user-nurse-01",
  "intendedRole": "nurse",
  "requestedPolicyVersion": 1,
  "requestedScopes": ["appointments", "patient-summary"],
  "issuedAt": "2026-08-17T09:00:00.000Z",
  "expiresAt": "2026-08-18T09:00:00.000Z",
  "responseNonce": "fresh-128-bit-value",
  "signerKeyId": "hub-signing-key",
  "signerKeyVersion": 1
}
```

The challenge expires after a short administrative window, with 24 hours as the initial maximum. The Hub must reject a challenge that is already accepted, expired, revoked, or associated with a different organization or intended user. Reissuing a challenge creates a new identifier and nonce; it does not reset an accepted challenge.

For USB enrollment, the challenge may be exported as a small signed JSON file. For LAN enrollment, the Android app may discover the Hub only through an explicitly selected local address or a user-entered pairing code. Discovery is convenience, not authentication: the Android app still requires the signed challenge and later verifies the signed response.

## Phase B: Android device request

After importing the challenge, Android generates a random opaque `deviceId` and a P-256 identity key pair under an Android Keystore alias scoped to the application and device identity. The private key remains in Keystore. The public key is exported as a standard X.509 SubjectPublicKeyInfo value and its fingerprint is the lowercase SHA-256 hash of those DER bytes.

The device request is signed by the newly generated identity key with `SHA256withECDSA`. This signature proves possession of the private key, but it does not by itself authorize the device; only the administrator’s subsequent Hub approval does that.

```text
EnrollmentRequest {
  protocolVersion: 1
  messageType: enrollment-request
  requestId: random opaque identifier
  challengeId: challenge identifier
  organizationId: challenge organization
  deviceId: random opaque identifier
  deviceName: administrator-visible name
  devicePublicKeySpkiBase64: X.509 SubjectPublicKeyInfo
  devicePublicKeyFingerprint: SHA-256(SPKI DER)
  appVersion: semantic client version
  requestedAt: ISO-8601 timestamp
  requestNonce: fresh 128-bit value
  deviceSignatureAlgorithm: SHA256withECDSA
  deviceSignatureBase64: signature over canonical descriptor without signature fields
}
```

The device must not use an IMEI, Android ID, serial number, phone number, or display name as its identity. Those values may be diagnostic hints but cannot authorize enrollment. The request includes the challenge’s organization and challenge identifier so that an intercepted request cannot be redirected to a different clinic or account without detection.

## Phase C: Hub approval and enrollment response

The Hub verifies the challenge signature and status, validates the device request schema, confirms that the organization and intended user match, verifies the device signature using the submitted public key, and checks that the request has not already been processed. It then presents the request to an authenticated administrator for explicit approval.

Approval is a state-changing action. It creates or updates the Step 21 `sync_devices` record only after the administrator confirms the named device, owner, role, policy version, and scope set. The action writes an ordinary audit event and a structured synchronization/device audit event. A rejected request is recorded with a reason code and cannot be retried under the same request identifier.

The Hub returns a signed enrollment response. The response is bound to the exact device public-key fingerprint and challenge nonce:

```text
EnrollmentResponse {
  protocolVersion: 1
  messageType: enrollment-response
  enrollmentId: one-time opaque identifier
  challengeId: original challenge identifier
  organizationId: clinic organization
  deviceId: approved random device identifier
  userId: approved staff account
  role: approved role
  deviceName: approved display name
  devicePublicKeyFingerprint: exact request fingerprint
  policyVersion: positive integer
  allowedScopes: explicit scope array
  patientScope: optional restricted selector
  issuedAt: Hub timestamp
  expiresAt: short response validity window
  offlineAccessUntil: signed offline-access expiry
  hubTrustAnchorId: accepted signer key identifier
  hubTrustAnchorVersion: accepted signer key version
  responseHash: SHA-256(canonical descriptor)
  signatureAlgorithm: ed25519
  signatureBase64: Hub signature over canonical descriptor without signature fields
}
```

The response must not include a Hub private key, a reusable Hub bearer credential, the Android database key, a raw staff password, or a general-purpose API token. The initial offline-access expiry is bounded by Hub policy; the Android client cannot extend it by editing local time or restarting the process.

## Phase D: Android acceptance and acknowledgment

Android accepts an enrollment response only after all of the following checks succeed:

| Check                                   | Failure behavior                              |
| --------------------------------------- | --------------------------------------------- |
| Hub signature and trusted key version   | Reject and preserve the previous local state. |
| Challenge identifier and response nonce | Reject as mismatched or replayed.             |
| Organization, device, user, and role    | Reject identity mismatch.                     |
| Device public-key fingerprint           | Reject if the response is for another key.    |
| Enrollment and response expiry          | Reject as expired.                            |
| Scope and policy bounds                 | Reject an invalid or over-broad policy.       |
| Response hash and canonical descriptor  | Reject tampering.                             |
| One-time enrollment state               | Reject duplicate import after acceptance.     |

Acceptance is transactional. Android writes the protected enrollment record, policy snapshot, trust-anchor metadata, and response hash in one transaction, then transitions from `Unenrolled` to `EnrolledLocked`. The app must not display patient data during import or before the user completes the local unlock setup.

Android returns an enrollment acknowledgment signed with the device identity key. The acknowledgment contains the enrollment identifier, response hash, device identifier, acceptance timestamp, and a fresh acknowledgment nonce. The Hub verifies this acknowledgment and changes the enrollment record from `approved` to `active`. If the acknowledgment is lost during USB exchange, the administrator may safely re-submit it because the Hub treats the response hash and enrollment identifier idempotently.

## Phase E: session initiation

A successful enrollment is not a long-lived session. Whenever Android needs a Hub session, it creates a new random `sessionId`, `requestNonce`, and ephemeral P-256 key pair. The ephemeral private key is memory-first and deleted when the session ends, the app locks, the process terminates, or the session validity window expires.

The device sends a signed initiation descriptor containing:

```text
SessionInit {
  protocolVersion: 1
  messageType: session-init
  organizationId: organization identifier
  enrollmentId: active enrollment identifier
  deviceId: enrolled device identifier
  userId: enrolled user identifier
  sessionId: fresh opaque identifier
  requestNonce: fresh 128-bit value
  clientCounter: 0
  deviceIdentityKeyFingerprint: enrolled identity fingerprint
  deviceEphemeralPublicKeySpkiBase64: fresh P-256 public key
  deviceEphemeralKeyFingerprint: SHA-256(SPKI DER)
  requestedScopes: subset of enrolled scopes
  requestedAt: current wall-clock timestamp
  deviceSignature: identity-key signature over canonical descriptor
}
```

The Hub verifies the identity signature and current `sync_devices` state, checks that the user, organization, and enrollment match, rejects suspended or revoked devices, and enforces the current policy version. It generates a fresh server ephemeral P-256 key pair and derives a shared secret with ECDH.

The session transcript includes both public keys, identity fingerprints, organization, enrollment, device, user, session identifier, request nonce, requested scopes, and validity timestamps. The Hub signs a `session-grant` containing the transcript hash, server ephemeral public key, granted scope intersection, a maximum validity of five minutes for the first increment, and a key-confirmation MAC. Android verifies the Hub signature, recomputes the transcript hash and ECDH result, checks the MAC, and only then enters `UnlockedSession` for synchronization.

The recommended derivation is:

```text
transcriptHash = SHA-256(canonicalJson(sessionTranscript))
sharedSecret = ECDH(deviceEphemeralPrivateKey, hubEphemeralPublicKey)
rootKey = HKDF-SHA256(
  ikm = sharedSecret,
  salt = transcriptHash,
  info = "elite-clinic/session-key/v1",
  length = 32 bytes
)
clientToHubKey = HKDF-SHA256(rootKey, info = "client-to-hub", length = 32)
hubToClientKey = HKDF-SHA256(rootKey, info = "hub-to-client", length = 32)
```

The implementation must use one documented HKDF library/parameter convention on both platforms and add a dedicated vector before enabling encrypted session frames. The key-confirmation MAC is computed over the canonical transcript descriptor and is verified before any clinical request is sent.

## Encrypted session frames

After the session grant, synchronization messages are carried in AES-256-GCM frames. Existing signed delta responses remain signed at the application layer; encryption protects the LAN/USB transport and the signed response protects the Hub-originated content after decryption.

```text
SessionFrame {
  protocolVersion: 1
  messageType: sync-request | sync-response | outbox-request | outbox-response
  sessionId: session identifier
  direction: client-to-hub | hub-to-client
  counter: strictly increasing per direction
  nonceBase64: 12-byte nonce derived from direction and counter
  aadHash: SHA-256(canonicalJson(AAD header))
  ciphertextBase64: AES-GCM ciphertext
  tagBase64: AES-GCM authentication tag
  optionalDeviceSignature: required for enrollment acknowledgment and high-value writes
}
```

The AAD header contains the protocol version, message type, session identifier, direction, counter, and nonce. A counter is accepted only if it is exactly the next expected value for that direction. The first increment should reject gaps rather than maintain a replay window; this keeps the SQLite state machine simple and makes USB retries explicit. A repeated counter, reused session identifier, wrong direction, invalid tag, or expired session terminates the session and records a redacted audit event.

A deterministic 12-byte nonce may be formed from a four-byte direction prefix and an eight-byte big-endian counter. The prefix must be different for the two directions, and the counter must never repeat under the same derived key. The nonce and AAD rules must be frozen in a separate cryptographic test-vector set before implementation.

## Offline access and local session state

The signed enrollment policy includes `offlineAccessUntil`; it is not the same as the five-minute live session grant. Offline access controls whether the Android app may use already-authorized local projections without contacting the Hub. Live session expiry controls the cryptographic session used for LAN/USB synchronization.

The Android state machine should be:

```text
Unenrolled
  -> EnrollmentPending
  -> EnrolledLocked
  -> Unlocking
  -> UnlockedOffline
  -> SessionNegotiating
  -> UnlockedSession
  -> EnrolledLocked
  -> OfflineExpired | Suspended | Revoked | De-enrolled
```

Only minimal state survives process death: enrollment status, policy expiry, last accepted Hub trust anchor, last successful sync timestamp, and cursor metadata. Session keys, ephemeral private keys, decrypted request bodies, and local PIN material remain memory-first. A background transition, inactivity timeout, explicit logout, biometric/key invalidation, or device lock clears the session material.

Wall-clock rollback is treated as a security event. The app compares wall-clock time with a monotonic elapsed-time reference where available and refuses to extend `offlineAccessUntil` from local edits. If the policy is expired, Android may show a generic expiry screen and permit local de-enrollment or destruction, but it must not display protected clinical data.

## Revocation, recovery, and lost-device behavior

The Hub can suspend or revoke the Step 21 `sync_devices` record. A connected session receives a signed revocation result or fails on the next authenticated request. An offline device cannot be remotely wiped; the UI must continue to show this limitation. On next connection, the device downloads revocation state before accepting clinical deltas.

Local recovery is explicit. If the identity key is invalidated, the biometric enrollment changes in a way that invalidates the key, or the protected database key cannot be released, Android must not silently create a replacement identity that can read the old database. The user must complete an administrator-approved re-enrollment or local destruction workflow. Re-enrollment creates a new device identity and enrollment identifier.

USB retries are safe only when operation identifiers, enrollment identifiers, response hashes, session identifiers, and counters are idempotently checked. The Hub must not infer success from a copied file or filename; it verifies the envelope and records the resulting state.

## Step 22 implementation sequence

| Work item | Deliverable                         | Acceptance condition                                                                                                                                     |
| --------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22A       | Shared enrollment/session contracts | TypeScript schemas and Kotlin DTO validation agree on required fields and bounds.                                                                        |
| 22B       | Device identity manager             | API 29-compatible Keystore P-256 identity key creation, fingerprinting, signing, and invalidation handling.                                              |
| 22C       | Challenge and enrollment service    | Hub challenge creation, request verification, explicit Admin approval, signed response, and idempotent acknowledgment.                                   |
| 22D       | Android enrollment repository       | Transactional response verification and protected enrollment state transition.                                                                           |
| 22E       | Session key agreement               | P-256 ECDH, transcript binding, HKDF-SHA-256, key confirmation, and short-lived session grant.                                                           |
| 22F       | Encrypted frame codec               | AES-256-GCM, direction-separated counters, AAD, replay rejection, and redacted failure audit.                                                            |
| 22G       | Session manager                     | Lock/background/process-death transitions and memory clearing.                                                                                           |
| 22H       | Enrollment/session UI               | Admin challenge import, device-name confirmation, PIN setup, locked state, expiry, and revocation messaging.                                             |
| 22I       | Transport adapters                  | LAN request/response and USB package exchange with the same authenticated envelope.                                                                      |
| 22J       | Adversarial tests                   | Wrong device, wrong organization, expired/replayed challenge, altered key, stale counter, invalid tag, revoked device, rollback time, and process death. |

The canonical-JSON vector file added with this design covers payload, enrollment descriptor, and session-initiation descriptor serialization. The next cryptographic vector set must add deterministic ECDH/HKDF/AES-GCM fixtures using fixed test-only keys and nonces. No production private key or real patient data may enter those fixtures.

## References

[1]: https://developer.android.com/privacy-and-security/keystore "Android Developers — Android Keystore system"
[2]: https://developer.android.com/privacy-and-security/cryptography "Android Developers — Cryptography"
[3]: https://csrc.nist.gov/pubs/sp/800/56/a/r3/final "NIST SP 800-56A Rev. 3 — Recommendation for Pair-Wise Key-Establishment Schemes Using Discrete Logarithm Cryptography"
