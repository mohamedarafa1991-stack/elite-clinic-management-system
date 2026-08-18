# Android Vault `FLAG_SECURE` and Memory-Zeroization Implementation Plan

**Status:** Implementation plan; no source changes are made by this document.
**Scope:** Android doctor-document viewing and uploading only.
**Baseline:** `8c62555` / current Android document workspace.

## 1. Objectives and non-goals

The implementation must prevent ordinary Android screenshots, screen recordings, and recents thumbnails while a doctor document is visible, and must make ownership and cleanup of mutable document/session buffers explicit. It must preserve the existing rule that doctor-document bytes are not stored in Android Room, files, downloads, WorkManager input, the outbox, or logs.[1] [2]

The implementation must **not** claim forensic erasure from a managed JVM or native graphics stack. `FLAG_SECURE` is a platform display control, and byte zeroization is best-effort cleanup of mutable arrays. Immutable Kotlin/Java `String` objects, provider buffers, JVM copies, garbage-collector behavior, and decoded native graphics memory cannot be completely controlled. The UI and release documentation should state this limitation precisely.

The implementation should not change the Hub’s 20 MiB document policy in this slice, and it should not introduce Android document persistence. Encrypted chunked transport is a separate follow-up if device memory measurements show that the current JSON/Base64 path is too large.

## 2. Current ownership map

| Data or resource                 | Current owner                                                                                                       | Current cleanup                                                                                  | Required treatment                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser-decoded document bytes    | `DoctorDocumentStreamParser` creates a `ByteArray`; `InMemoryDoctorDocument` owns it.                               | `InMemoryDoctorDocument.clear()` fills the array with zeroes.                                    | Replace the raw array with a `ZeroizableBytes` owner that rejects use after close.                                                                                                            |
| Viewer copy for image/PDF decode | `copyBytesForViewer()` returns a new `ByteArray`.                                                                   | Image/PDF composables fill the copy after decode; decoded bitmap is recycled on disposal.        | Keep a scoped `useCopy` helper so every copy is cleared in `finally`, including decode failures and cancellation.                                                                             |
| File-picker read buffer          | `readPickedDoctorDocument()` uses `ByteArrayOutputStream` and a 64 KiB read buffer.                                 | No explicit cleanup for the buffer/output object.                                                | Replace with a bounded `ZeroizableByteBuffer` whose working buffer is cleared on `close`, overflow, provider failure, and successful ownership transfer.                                      |
| Upload Base64/JSON payload       | `Base64.encodeToString()` and `JSONObject` hold immutable text.                                                     | Garbage collection only.                                                                         | Shorten lifetime, never log or retain it, clear mutable source bytes before returning, and document that immutable strings are best-effort residual risk. Plan encrypted chunking separately. |
| Decrypted frame plaintext        | `SessionFrameCodec.decrypt()` returns a `ByteArray`; `LanSyncHttpSession` converts it into a `String`/`JSONObject`. | No explicit wipe of the returned plaintext array.                                                | Wrap conversion in `try/finally` and wipe the plaintext array immediately after JSON parsing.                                                                                                 |
| Encrypted frame temporary arrays | Ciphertext, tag, concatenated encrypted bytes, AAD, and nonce are created inside `SessionFrameCodec`.               | Session key material is cleared on `close`; temporary frame arrays are not consistently cleared. | Wipe every mutable temporary array in `finally` after the cipher no longer needs it.                                                                                                          |
| Session key arrays               | `SessionFrameCodec` owns nonce prefix, send key, and receive key.                                                   | `SessionFrameCodec.close()` fills all three arrays with zeroes.                                  | Preserve this behavior; add failure-path cleanup in session construction before a codec is returned.                                                                                          |
| Decoded image/PDF bitmap         | Compose viewer state owns native bitmap memory.                                                                     | Recycled when the viewer composable leaves composition.                                          | Recycle on disposal and cancellation; add device tests for rotation, backgrounding, and process death.                                                                                        |

## 3. Implementation phases

### Phase A — Add the zeroization primitives

Create `apps/android/app/src/main/java/com/elite/clinic/security/ZeroizableBytes.kt` with a small ownership API. The wrapper should have the following behavior:

```kotlin
class ZeroizableBytes private constructor(
    private var value: ByteArray?,
) : AutoCloseable {
    val size: Int
        get() = value?.size ?: 0

    val isCleared: Boolean
        get() = value == null

    fun <T> use(block: (ByteArray) -> T): T {
        val bytes = value ?: throw IllegalStateException("SECURE_BYTES_CLEARED")
        return block(bytes)
    }

    fun copyForUse(): ByteArray = use { it.copyOf() }

    override fun close() {
        val bytes = value ?: return
        bytes.fill(0)
        value = null
    }

    companion object {
        fun adopt(bytes: ByteArray): ZeroizableBytes = ZeroizableBytes(bytes)
    }
}
```

The actual implementation should use an internal `requireOpen()` helper and should not expose the backing array, a mutable reference, or an unchecked getter. `use` must not clear the array automatically because some callers need more than one operation; ownership remains with the wrapper and the caller closes it in a surrounding `try/finally` or `use` extension.

Add `ZeroizableByteBuffer`, also in the security package, for bounded file-picker accumulation. It should maintain a private mutable buffer and current length, reject writes above 20 MiB, wipe the buffer on `close`, and provide a one-way `seal()` operation that transfers ownership to a `ZeroizableBytes` instance. After `seal()`, the builder must reject further writes and clear any spare capacity.

Add a small helper for borrowed arrays:

```kotlin
inline fun <T> withZeroizedBytes(
    bytes: ByteArray,
    block: (ByteArray) -> T,
): T = try {
    block(bytes)
} finally {
    bytes.fill(0)
}
```

Use this only when the current function owns the array. Do not call it on arrays owned by `SessionFrameCodec` or `InMemoryDoctorDocument` unless ownership has explicitly been transferred.

### Phase B — Refactor the document parser and model

Change `InMemoryDoctorDocument` so that it stores `ZeroizableBytes` rather than a raw `ByteArray`. Keep immutable metadata—document ID, display name, filename, MIME type, version, and declared size—outside the sensitive buffer.

Replace the unconstrained copy method with one of these scoped APIs:

```kotlin
inline fun <T> useViewerCopy(block: (ByteArray) -> T): T {
    val copy = content.copyForUse()
    return try {
        block(copy)
    } finally {
        copy.fill(0)
    }
}
```

`clear()` should delegate to `content.close()` and make subsequent `useViewerCopy` calls fail with `SECURE_BYTES_CLEARED`. The object should expose `isCleared` for tests and viewer-state checks. `sizeBytes` should use immutable metadata rather than the cleared buffer length.

Update `DoctorDocumentStreamParser.parse()` as follows:

1. Decode Base64 into a local mutable array.
2. Enter a `try/finally` immediately after decoding.
3. Validate non-empty size, allowed MIME, declared size, lowercase SHA-256 format, and actual SHA-256.
4. On success, transfer ownership with `ZeroizableBytes.adopt(decoded)` and set a boolean such as `ownershipTransferred = true`.
5. In `finally`, fill `decoded` with zeroes when ownership was not transferred.

This prevents invalid, oversized, tampered, or malformed responses from leaving their decoded bytes under the parser’s ownership without cleanup.

### Phase C — Refactor the Android file picker

Replace `ByteArrayOutputStream` in `readPickedDoctorDocument()` with `ZeroizableByteBuffer`:

1. Validate the provider MIME type before opening the stream.
2. Read using a fixed 64 KiB scratch buffer.
3. Append each chunk to the bounded zeroizable buffer.
4. Clear the scratch buffer in `finally` regardless of success or provider failure.
5. Call `seal()` only after a non-empty document has been read.
6. Wrap the sealed bytes in `PickedDoctorDocument` and make `PickedDoctorDocument.close()` delegate to the wrapper.
7. If any exception occurs before ownership transfer, close the builder and clear all temporary state.
8. After upload, cancellation, replacement, or activity disposal, close the selected document and set its Compose state to `null`.

The picker must continue to avoid `takePersistableUriPermission`, `FileProvider`, cache files, and downloads. The URI is a transient read source only.

### Phase D — Add secure-window lifecycle control

Create a composable in `DoctorDocumentScreen.kt` or a small security UI file:

```kotlin
@Composable
private fun SecureDocumentWindow(enabled: Boolean) {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() } ?: return
    val window = activity.window

    DisposableEffect(window, enabled) {
        val wasSecure = window.attributes.flags and FLAG_SECURE != 0
        if (enabled) {
            window.addFlags(FLAG_SECURE)
        } else {
            window.clearFlags(FLAG_SECURE)
        }
        onDispose {
            if (wasSecure) window.addFlags(FLAG_SECURE) else window.clearFlags(FLAG_SECURE)
        }
    }
}
```

Implement `Context.findActivity()` by walking `ContextWrapper` values and returning the first `Activity`; do not cast blindly because Compose previews and tests may use a non-Activity context.

Call `SecureDocumentWindow(enabled = viewedDocument != null)` at the top of `DoctorDocumentWorkspace`. The effect must be active before the viewer is displayed and must restore the previous window flag state when the viewer closes or the activity leaves composition. If later screens display other protected health information, promote this to an activity-level protected-content coordinator instead of adding multiple independent flag effects.

The secure-window acceptance behavior is:

| State                                       | Expected flag                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Document workspace with no document visible | Restore the prior activity state.                                                               |
| Document loading                            | Set `FLAG_SECURE` before the response is rendered.                                              |
| Image/PDF viewer visible                    | Keep `FLAG_SECURE` set.                                                                         |
| Viewer closed or document replaced          | Clear it unless it was already set by another protected screen.                                 |
| Activity destroyed/backgrounded             | Cleanup effect restores state; Android lifecycle must not expose a protected recents thumbnail. |

### Phase E — Zeroize session transport buffers

Update `LanSyncHttpSession.postEncrypted()`:

1. Build the request plaintext byte array in a local variable.
2. Encrypt it in a `try` block.
3. Fill the request plaintext array in `finally` immediately after `frameCodec.encrypt()` returns.
4. After reading and decrypting the response frame, hold the decrypted plaintext byte array in a local variable.
5. Construct the `JSONObject` only inside a `try` block.
6. Fill the decrypted plaintext array in `finally` before returning the JSON object.
7. Never log the JSON object, content Base64 string, frame text, or response body.

Update `SessionFrameCodec.encrypt()` and `decrypt()` to wipe local arrays after use:

- Wipe the derived nonce after `Cipher.doFinal()`.
- Wipe AAD after cipher initialization/use and AAD hashing.
- On encryption, wipe the combined cipher output after copying ciphertext and tag into the frame fields.
- On decryption, wipe decoded ciphertext, decoded tag, concatenated ciphertext-plus-tag, nonce, and AAD in `finally`; do not wipe the plaintext returned to the caller.
- Preserve counter advancement only after successful authentication/decryption.
- Keep `close()` idempotent and continue wiping session keys and nonce prefix.

Update `LanSyncSessionFactory.createSessionInternal()` so that if any exception occurs after ECDH/HKDF key derivation but before a `SessionFrameCodec` is returned, the derived root, directional keys, confirmation key, nonce prefix, and any decoded key material are cleared. Once the codec owns the directional arrays, the codec’s `close()` owns cleanup.

This phase should remain source-compatible with the existing encrypted frame wire format. It does not change counters, nonce construction, message types, or Hub contracts.

### Phase F — Harden viewer cleanup and state transitions

Add an explicit `close()`/`isClosed` state to the viewer model. On close, execute cleanup in this order:

1. Stop or cancel any in-flight decode coroutine.
2. Recycle the current bitmap, if any.
3. Close the `InMemoryDoctorDocument` zeroizable buffer.
4. Clear the Compose document state.
5. Disable `FLAG_SECURE` through the composable effect, restoring any previous protected-window state.

When replacing one document with another, close the old document before assigning the new one. When the activity is destroyed or the composable leaves composition, execute the same close path. A stale callback must not be allowed to render or copy a cleared document.

The viewer should label the PDF implementation as a first-page preview until a page navigator exists. This is separate from zeroization but avoids implying that the complete PDF has been reviewed when only one page is visible.

## 4. Test plan

### 4.1 JVM unit tests

Add `ZeroizableBytesTest.kt` covering:

- `use` exposes the original contents before close.
- `close` overwrites the backing array and is idempotent.
- `use` and `copyForUse` fail after close.
- A copy is cleared by the scoped viewer-copy helper even when the callback throws.
- `ZeroizableByteBuffer` rejects writes above 20 MiB.
- Builder scratch storage is wiped on overflow, read failure, cancellation, and close.
- `seal()` transfers ownership once and rejects later writes or sealing.
- The parser transfers ownership only on successful validation and clears decoded bytes on invalid MIME, size mismatch, invalid hash, and integrity failure.

Extend `DoctorDocumentStreamTest.kt` with:

- Post-clear access rejection.
- Replacing a viewed document clears the previous object.
- Parser failure does not return a document object.
- Metadata remains available after the content wrapper is cleared, but content access fails.

Extend `SessionFrameCodecTest.kt` with cleanup-oriented tests where feasible. Because Java/Kotlin cryptographic providers do not expose internal cipher memory, test observable behavior instead:

- A closed codec rejects encrypt/decrypt.
- Close is idempotent.
- Successful decrypt advances the receive counter once.
- Failed authentication does not advance the receive counter.
- Replay and counter-gap rejection remain unchanged.

### 4.2 Compose/UI tests

Add the Compose UI test dependency if it is not already present and create tests for:

- `FLAG_SECURE` is set when a document becomes visible.
- `FLAG_SECURE` is cleared/restored when the viewer closes.
- An initially secure window remains secure after the viewer closes.
- Recomposition does not repeatedly lose the previous flag state.
- No save, share, download, or external-viewer controls are present.
- Upload cancellation clears the selected document state.
- Replacing a picked file clears the old selected buffer.

Use a test `Activity` window and inspect `window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE`. Do not rely only on screenshot text assertions.

### 4.3 Device/instrumentation tests

On at least one API-29 device and one representative newer device:

- Display a synthetic PDF and image, then capture the screen using Android test tooling. The captured image should not expose the protected document while `FLAG_SECURE` is active.
- Open recents and verify that the activity thumbnail is protected.
- Attempt screen recording and verify that the document is not recorded.
- Background/foreground the app while the viewer is open and verify flag continuity.
- Rotate the device or recreate the activity and verify document bytes and bitmaps are cleared.
- Kill the process during view decoding and verify no document file appears after restart.
- Pick a valid file, cancel, choose another file, exceed 20 MiB, use a wrong MIME provider, and simulate a provider read failure.
- Inspect the private app directory, Room tables, WorkManager input, logs, and downloads after every scenario. There must be no doctor-document byte persistence.

### 4.4 Session and failure-path tests

Verify that every path closes the session and clears owned buffers:

| Scenario                                          | Required result                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Session-init rejected                             | No derived key material remains owned by the failed factory path.                                |
| Wrong certificate/trust anchor                    | Terminal security failure; no retry loop; no document bytes produced.                            |
| HTTP timeout/Hub outage                           | Retryable error classification; request buffers cleared; session closed.                         |
| Invalid encrypted frame                           | Authentication failure; receive counter unchanged; temporary buffers cleared.                    |
| Valid response with invalid Base64/hash/size/MIME | Parser rejects and clears decoded bytes.                                                         |
| Viewer decode exception                           | Copy buffer cleared, bitmap recycled if allocated, document closed, secure flag removed on exit. |
| Upload cancellation                               | Session closes, source bytes and mutable buffers are cleared, no outbox/file/Room write occurs.  |
| Process death                                     | No Android document file or metadata is created; a later launch has no document object.          |

## 5. Implementation order and commit boundaries

Use small commits so failures can be isolated:

1. `Add zeroizable Android byte ownership primitives` — wrappers and JVM tests only.
2. `Refactor Android document parser to zeroizable buffers` — parser/model changes and parser tests.
3. `Harden Android picker and viewer cleanup` — bounded picker buffer, viewer copy scopes, bitmap/PDF cleanup.
4. `Protect Android document windows from screenshots` — `FLAG_SECURE` effect and Compose tests.
5. `Zeroize encrypted session temporary buffers` — HTTP/frame/factory cleanup and protocol regression tests.
6. `Document Android workstation and physical security gates` — update Step 30 docs, build matrix, and sanitized device evidence templates.

Do not alter the wire protocol or Android persistence schema in the first five commits. If device memory testing shows unacceptable peak usage, create a separate design and implementation change for encrypted chunked document transfer rather than weakening cleanup guarantees in the existing one-shot path.

## 6. Acceptance criteria

The work is complete only when:

- `FLAG_SECURE` is set before any doctor-document pixels are rendered and is restored correctly after the viewer closes.
- The UI test proves no save/share/download/external-viewer action is exposed.
- Every mutable document buffer has one explicit owner and a `try/finally` cleanup path.
- Parser, picker, viewer, frame codec, HTTP response, session factory, and cancellation/error paths have cleanup tests.
- Android JVM tests, Compose/UI tests, lint, and debug APK assembly pass on the Android workstation.
- At least two physical devices confirm screenshot/recording/recents protection, process-death cleanup, and absence of Android document persistence.
- Memory measurements for valid 20 MiB documents are recorded; if peak usage is unsafe, the 20 MiB Android limit is reduced or encrypted chunking is implemented.
- Release documentation accurately says “explicit best-effort zeroization of mutable buffers” rather than promising complete heap erasure.
- The Step 28 real-device report includes the document view/upload scenarios and is marked complete only after physical evidence is reviewed.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/apps/android/app/src/main/java/com/elite/clinic/sync/LanSyncSessionFactory.kt "Elite Clinic Android LAN session factory"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/apps/android/app/src/main/java/com/elite/clinic/sync/SessionFrameCodec.kt "Elite Clinic Android encrypted session frame codec"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/apps/android/app/src/main/java/com/elite/clinic/sync/DoctorDocumentStream.kt "Elite Clinic Android in-memory document stream"
[4]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/8c62555/apps/android/app/src/main/java/com/elite/clinic/DoctorDocumentScreen.kt "Elite Clinic Android doctor-document Compose workspace"
[5]: https://developer.android.com/reference/android/view/WindowManager.LayoutParams#FLAG_SECURE "Android FLAG_SECURE reference"
