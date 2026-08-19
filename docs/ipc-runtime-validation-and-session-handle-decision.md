# IPC Runtime Validation and Session-Handle Decision

## Runtime verification

A headless Electron smoke fixture now exercises the compiled desktop IPC registrar through a real `BrowserWindow`, sandboxed preload, and renderer `ipcRenderer.invoke` calls. It is located under `apps/desktop/scripts/` and is intended as a local runtime gate until a full Windows workstation harness is available.

The smoke test verifies:

| Scenario                | Result                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `contextIsolation`      | The renderer cannot access Node’s `require`; the fixture reports `isolated`.                                               |
| Trusted renderer invoke | A valid renderer call reaches the main handler and returns the expected result.                                            |
| Malformed payload       | The handler rejects the invalid input with the stable `ELITE_INPUT_INVALID` code.                                          |
| Unknown handler failure | Arbitrary details such as database paths and patient IDs are removed and the renderer receives `ELITE_IPC_REQUEST_FAILED`. |
| Cleanup                 | Temporary handlers are removed and the Electron process exits deterministically.                                           |

The gate was executed with Electron 43.4.0 under Xvfb and passed all four runtime assertions. Electron still logs the normalized handler error in the main process, which is expected; production logging must continue to redact tokens, patient content, and raw validation structures.

## Opaque session-handle decision

The current desktop renderer passes an authentication bearer token through the preload API to the main process. The new sender guard prevents untrusted frames and unexpected windows from using those APIs, and every privileged service call still resolves and validates the server-side session. This substantially reduces the practical attack surface.

An opaque main-process session handle remains useful defense-in-depth because it would remove the bearer token from ordinary renderer IPC arguments. It should not be implemented as a simple global token map. A production implementation would need to bind each handle to the issuing `webContents.id`, enforce idle and absolute expiry, clear it on logout, renderer crash, window close, and main-process shutdown, and resolve it through the existing server-side session check on every call.

For the current synthetic-data milestone, the recommended decision is **defer the handle migration until after the packaged Windows sender/renderer test**. Sender validation, strict schema parsing, safe errors, context isolation, sandboxing, navigation restrictions, and CSP are now the higher-value controls. The handle migration becomes a production-data gate if the threat model includes renderer code compromise, local devtools exposure, extensions, or future untrusted content.

## Required Windows release gate

The sandbox runtime proves the IPC registrar and renderer bridge under Linux/Xvfb, but it does not replace Windows verification. Before production data, run the compiled installer and test a real packaged `file://` renderer, renderer reload, window replacement, child-frame rejection, malformed payload side-effect prevention, logout/session expiry, device revocation, and crash/restart behavior. Capture the resulting logs with sensitive values redacted.
