# Step 2 — Authentication and Device Enrollment

## Completed

Elite now has a dedicated `@elite/auth` package and a migration-controlled authentication schema. Passwords are hashed with Argon2id. The first-launch flow creates exactly two Admin accounts and one active Windows Hub device, then closes the bootstrap path permanently.

The authentication service supports individual login, eight-hour sessions, in-memory renderer token handling, logout, failed-attempt tracking, five-attempt lockout with a fifteen-minute lock, session expiry, device-status checks, and audit events for bootstrap, login, failure, denial, enrollment, approval, rejection, and revocation.

The capability matrix is explicit and separate from role names. Admin receives system-management capabilities; Doctor receives clinical approval capability; Nurse receives clinical workflow capabilities; Receptionist receives front-desk and billing capabilities. Every protected service method checks the required capability and, where appropriate, the Admin role.

Device enrollment is Admin-controlled. A new Android device is created as `pending` with friendly name, platform, app version, API level, and security patch level. Admin can approve or reject the request. Admin can list devices and enrollment requests, revoke an active device, invalidate its sessions, and mark it `wipe-pending` for best-effort cache deletion on reconnect.

## Desktop integration

The Electron main process now initializes the auth service, exposes a narrow typed preload API for authentication and device management, and keeps raw session tokens in renderer memory only. The renderer contains the two-Admin bootstrap form, login form, authenticated session view, and Admin device-management panel.

Electron continues to use context isolation, sandboxing, Node integration disabled, restrictive CSP, navigation restrictions, and allowlisted IPC handlers. Patient data is not loaded by Step 2.

## Verification

| Check                     | Result                                 |
| ------------------------- | -------------------------------------- |
| Shared-contract typecheck | Passed                                 |
| Database typecheck        | Passed                                 |
| Authentication typecheck  | Passed                                 |
| Desktop typecheck         | Passed                                 |
| Contract tests            | 2 passed                               |
| Database tests            | 5 passed                               |
| Authentication tests      | 5 passed                               |
| Desktop build             | Passed                                 |
| Dependency security audit | No known high-severity vulnerabilities |
| Prettier format check     | Passed                                 |
| Git repository            | Clean and pushed to private `main`     |

## Production caveats

The production database remained deliberately fail-closed until the approved SQLite3MultipleCiphers driver and OS-backed key provider were configured in Step 3. Development authentication tests use synthetic accounts and an in-memory SQLite database only. No real passwords, patients, devices, or clinical data were used.

Actual Android enrollment and sync are not connected yet; Step 2 creates the Hub-side enrollment and revocation model. Subsequent work should connect the native Android client to enrollment and session issuance through the Hub.
