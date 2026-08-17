# Step 22 Contract and Signed-Descriptor Verification Implementation

## Status

This increment implements the first executable Step 22 security boundary. It does not yet create an Android live session, derive transport keys, or authorize clinical synchronization by itself. It makes the enrollment and session message shapes explicit on both platforms and adds Hub-side verification for the signatures and hashes that must precede those later state transitions.

All fixtures use synthetic identifiers and keys generated inside tests. No production private key, real patient data, or reusable bearer credential is stored in source control.

## Implemented components

| Component                         | Implementation                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared TypeScript contracts       | Added Zod schemas for enrollment challenges, Android device requests, Hub enrollment responses, device acknowledgments, session-init requests, signed session grants, and AES-GCM session frames.                                                       |
| Kotlin contract shapes            | Added Android data classes mirroring the Step 22 message families. They are intentionally transport-neutral and do not expose the encrypted Room database key or session private keys.                                                                  |
| Canonical descriptor hashing      | Added Hub helpers that hash canonical unsigned descriptors with canonical JSON v1 and SHA-256. Self-referential response hashes exclude the hash field and all signature metadata before hashing.                                                       |
| Hub signature verification        | Added Ed25519 verification for trusted Hub challenge, enrollment-response, and session-grant descriptors.                                                                                                                                               |
| Android device proof verification | Added P-256 `SHA256withECDSA` verification for enrollment requests and session-init descriptors, including SHA-256 fingerprints over DER-encoded X.509 SubjectPublicKeyInfo bytes.                                                                      |
| Android transcript helper         | Added Android SHA-256 descriptor hashing and P-256 device-signature verification helpers using the same canonical JSON boundary.                                                                                                                        |
| Synthetic tests                   | Added TypeScript contract tests and Hub cryptographic tests for valid signatures, tampering, identity binding, response-hash mismatch, and session-init possession proof. Added an Android JVM hash test alongside the existing canonical vector tests. |

## Verification rules

The Hub validators reject a message when its Zod shape is invalid, signature metadata uses an unsupported algorithm, a public-key fingerprint does not match the submitted SPKI bytes, or the signature does not verify over the canonical descriptor with signature fields removed. Enrollment responses additionally bind the organization, device, challenge, response nonce, and device-key fingerprint to the expected pending enrollment state.

Response hashes are constructed without circularity. The unsigned response descriptor is copied, all signature fields are removed, and the self-referential `responseHash` field is removed. SHA-256 is then computed over the canonical JSON bytes. The resulting hash is inserted into the descriptor, and the Hub signs that descriptor without the signature fields. A verifier repeats the same process before accepting the Hub signature.

The current validator checks message expiry and validity-window ordering, but it does not yet mutate `sync_devices`, persist a pending challenge, or transition Android enrollment state. Those operations belong to the next service/repository increment and must remain transactional.

## Key separation

The implementation preserves the protocol’s key separation rule:

> Hub Ed25519 keys authenticate Hub-issued policy and session descriptors; Android P-256 identity keys prove device possession; ephemeral P-256 keys will later establish session confidentiality; AES-GCM keys will later protect framed transport messages.

The device-signature helpers do not accept Android identifiers, phone numbers, display names, or bearer tokens as substitutes for the device public key. The public-key fingerprint is calculated over the DER SPKI bytes that are actually verified.

## Deferred work

The next increment should add the Android Keystore identity-key manager, challenge persistence and explicit Admin approval on the Hub, transactional Android acceptance of signed enrollment responses, and idempotent enrollment acknowledgments. After those are stable, add deterministic ECDH P-256, HKDF-SHA-256, key-confirmation, AES-256-GCM nonce/AAD, direction counters, and replay-rejection vectors before enabling encrypted session frames.
