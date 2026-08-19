# IPC Sender Validation and Boundary Parsing

## Scope

This change implements the P0 desktop IPC hardening work identified during the commercial-readiness review. It covers the 129 registered desktop IPC channels and the 46 unsafe `input as never` casts previously present in `apps/desktop/src/main/index.ts`.

## Trusted sender policy

All desktop handlers are now registered through `registerIpcHandler`. The wrapper calls the pure `assertTrustedIpcSender` policy before invoking the handler.

The policy requires all of the following:

| Check                | Behavior                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Main window exists   | Rejects requests before the trusted window is created or after it is destroyed.                                       |
| WebContents identity | Requires `event.sender` to equal the current authenticated desktop window’s `webContents`.                            |
| Main-frame identity  | Rejects if `event.senderFrame` is absent or is not the window’s main frame, preventing child-frame/iframe IPC access. |
| Packaged origin      | Requires the sender frame to use a `file://` URL.                                                                     |
| Development origin   | Requires the sender frame origin to equal `ELITE_RENDERER_URL`, defaulting to `http://localhost:5173`.                |
| Stable error         | All failures use the non-sensitive `ELITE_IPC_UNTRUSTED_SENDER` error code.                                           |

The policy is isolated in `apps/desktop/src/main/ipc-security.ts` so it can be tested without booting Electron or registering real handlers.

## Strict input parsing

The main process now parses untrusted renderer payloads before calling domain services. The migration uses the existing shared contract schemas wherever available and exports a small number of existing service validators through `@elite/auth` where those validators were previously private.

Covered families include authentication/bootstrap/login, Android enrollment, synchronization, patient search/registration/update/merge, related persons, medical history, encounters, ICD-10, projections, exports, export registry/lifecycle, signing-key recovery, export governance, organization settings, FHIR profile bundles, amendments, diagnoses, clinical specialties/departments/services, doctor profiles/documents, billing packages/invoices/payments/refunds, schedules, exceptions, and appointments.

Service-level parsing and authorization remain in place. The IPC parse is an additional boundary defense, not a replacement for domain validation. Schema failures therefore stop malformed renderer payloads before they reach service methods while preserving capability checks and business invariants inside the services.

## Coverage evidence

The source-level regression test verifies that:

- There are exactly 129 `registerIpcHandler` registrations.
- There is exactly one direct `ipcMain.handle` call, inside the centralized wrapper.
- No `as never` cast remains in the desktop main process.

The pure sender-policy tests cover trusted development frames, child-frame rejection, foreign `webContents`, unexpected development origins, accepted packaged file frames, and rejected packaged remote frames.

## Verification

The available sandbox gate passed:

- Contracts: 9 tests.
- Database: 6 tests.
- Auth/domain: 47 tests.
- Desktop: 20 tests, including 5 new IPC hardening tests.
- Total available assertions: **82 passed**.
- TypeScript typecheck: passed.
- Desktop production build: passed.
- Prettier formatting: passed.
- Git whitespace check: passed.

## Remaining workstation/security gates

The implementation still needs a real Electron integration test with mocked or controlled `IpcMainInvokeEvent` objects created by the Electron runtime, plus a packaged Windows smoke test. The following cases should be added before production data:

1. A renderer reload or replacement window cannot reuse another window’s sender context.
2. A child frame cannot invoke a sensitive handler even when it shares the same origin.
3. Development mode honors a configured `ELITE_RENDERER_URL` without allowing arbitrary origins.
4. Every malformed payload produces a safe validation failure and no service side effect.
5. Logout, session expiry, device revocation, and renderer restart remain correctly enforced after parsing.
6. The packaged Windows build rejects remote navigation and remote IPC sender frames.
7. Error reporting never includes bearer tokens, patient content, export payloads, or raw validation structures.

An opaque main-process session handle remains a separate defense-in-depth decision. It is not required to make sender validation effective, and it should be implemented only with window binding, idle/absolute expiry, logout cleanup, crash/close cleanup, and server-side session revalidation.
