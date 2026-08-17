# Step 23: Desktop TLS Startup Notification and Recovery

## Overview

The desktop Hub now reports LAN synchronization startup state through the existing security-status IPC response. TLS startup failures no longer disappear silently. The renderer displays a generic administrator-facing notification, keeps patient data workflows visibly local and protected, and exposes a retry action only after an authenticated Admin session with the existing `device.manage` capability.

## Security behavior

The main process stores only a sanitized public status. It never sends certificate paths, private-key paths, OpenSSL errors, filesystem details, or raw exception messages to the renderer. Known configuration failures receive specific safe guidance, while all other failures use a generic message instructing the administrator to verify the Hub certificate and private-key configuration.

The retry IPC handler requires a valid authenticated session and the `device.manage` capability. It stops any currently registered LAN server, creates a fresh server instance so updated environment variables are reread, attempts startup, and returns the resulting sanitized status. A failed cleanup operation does not replace the original startup diagnosis.

Initial application startup now awaits LAN initialization before loading the renderer. This ensures the first security-status read reflects `ready`, `failed`, or `unavailable` rather than an indeterminate transient `starting` state.

## User-facing states

| State | Admin-facing behavior |
|---|---|
| `ready` | No recovery banner is shown. The Foundation status indicates that secure services are ready. |
| `starting` | A non-terminal status is shown while startup is in progress. |
| `failed` | The banner explains that LAN synchronization is unavailable and gives safe TLS configuration guidance. An authorized Admin sees the retry button. |
| `unavailable` | The banner explains that secure local services are not ready. Recovery is unavailable until the main secure service boundary is restored. |

Unauthenticated users and non-admin users can see the safe notification but cannot restart the listener. The retry action is therefore protected by both renderer gating and main-process authorization; the main-process check is authoritative.

## Verification

The desktop suite now includes three regression tests covering sanitized error messages, TLS-required startup without certificate paths, and incomplete certificate configuration. The final verification passed the full workspace test suite with 66 tests, TypeScript typechecking, the desktop production build, Prettier formatting, and `git diff --check`.

The remaining operational requirement is to configure matching certificate and private-key environment variables before launching the packaged Hub. The Android enrollment profile must contain the matching public certificate PEM and the Ed25519 trust anchor. Private-key material remains on the Windows Hub only.
