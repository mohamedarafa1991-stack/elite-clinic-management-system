# Step 30: Doctor Profiles and Secure Local Document Vault

**Status:** Source implementation complete, including the Android document workspace; Android Gradle and physical-device verification pending.
**Scope:** Doctor profiles, professional documents, encrypted Windows storage, role-based editing, LAN-only Android viewing/upload, versioning, and auditability.

## Product behavior

Each doctor now has a dedicated profile separate from the basic user and scheduling directory record. The profile includes English and Arabic names, professional registration number, license expiry, license-verification status, specialties, departments, qualifications, biography, languages, phone, email, clinic room, consultation fee in EGP, clinical-approver status, and active-account status.

The role policy is intentionally asymmetric. Admins can edit all profile fields and account-governance fields. Doctors can edit their own professional and contact profile fields, upload their own documents, and view their own sensitive records. Nurses and receptionists can view ordinary doctor profiles and non-sensitive documents but cannot edit them. Admin-only fields include license verification, specialties, departments, consultation fee, clinical-approver status, and account activation status.

| Actor        | Ordinary profile                          | Sensitive profile fields                                | Documents                                                                      | Editing                                                  |
| ------------ | ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Admin        | Read/write                                | Read/write                                              | Read/write/archive                                                             | All doctors and all document types                       |
| Doctor       | Read/write for self; read-only for others | Read/write for self; read-only or restricted for others | Read/write/archive for own record; read-only for others subject to sensitivity | Own profile and documents; not account-governance fields |
| Nurse        | Read-only                                 | Hidden when represented by sensitive documents          | Read-only for non-sensitive documents                                          | None                                                     |
| Receptionist | Read-only                                 | Hidden when represented by sensitive documents          | Read-only for non-sensitive documents                                          | None                                                     |

Sensitive document types are national ID, passport, medical degree, professional license, and employment contract. Specialty certificates, CVs, training certificates, profile photos, and custom documents are ordinary by default.

## Windows storage design

The Windows Hub stores document metadata in the encrypted SQLite database and document ciphertext in an application-private vault below the Electron `userData` directory. The vault stores only AES-GCM ciphertext. The service derives a dedicated document-vault key from the existing 256-bit OS-backed database key using a domain-separated HMAC label. The database stores the relative vault path, encryption version, nonce, authentication tag, plaintext SHA-256, size, MIME type, document family, and version.

The vault adapter rejects absolute paths and traversal attempts, creates private directories, writes temporary files with restrictive permissions, and atomically renames completed ciphertext into place. The service verifies the decrypted size and SHA-256 before any document is returned to a viewer. Document contents and encryption keys are not written to audit metadata or ordinary logs.

Supported formats are PDF, JPEG, PNG, and WebP. The maximum document size is 20 MiB. A replacement creates a new version in the same document family and archives the previous active version. Archival does not immediately delete ciphertext, preserving controlled recovery and future administrator destruction workflows.

## Desktop workflow

The Electron main process exposes a narrow typed preload namespace for listing profiles, reading a profile, updating a profile, listing documents, uploading documents, viewing a document, and archiving a document. The renderer does not receive filesystem paths and cannot read the vault directly. The desktop viewer creates a temporary object URL for the decrypted bytes and revokes it when the viewer is closed or replaced.

All profile updates, document uploads, document views, and document archival operations create audit events with actor, device, entity, action, timestamp, and safe metadata. The metadata excludes document bytes, credentials, keys, and plaintext document contents.

## Android LAN behavior

The encrypted session frame contract now supports `document-request`, `document-response`, `document-upload-request`, and `document-upload-response`. A secure session is opened against the Windows Hub for a one-shot document operation, the request is authenticated through the existing signed grant and encrypted AES-GCM frame channel, and the session is closed immediately afterward.

Android receives document bytes only in memory. The `DoctorDocumentStreamParser` validates MIME type, size, Base64 decoding, declared size, and SHA-256 before handing bytes to a viewer. The stream is not inserted into Room, the local outbox, WorkManager input, Android files, logs, or synchronization metadata. The caller must clear the in-memory byte array when the viewer closes.

Android viewing and uploading require an active secure LAN connection to the Windows Hub. They intentionally do not work while the device is offline or disconnected from the Hub, because the requirement is that document files must not persist on Android. Android uploads are streamed directly to the Hub and the response contains metadata only.

The Android UI now exposes a secure document workspace. It discovers active encrypted enrollment profiles from the existing Room connection-profile table, lets the user select a Hub session, accepts a document ID for one-shot viewing, and provides an `OpenDocument` file picker restricted to PDF, JPEG, PNG, and WebP. The picker reads the selected URI into a bounded in-memory byte array, rejects empty or oversized files, and clears the array after upload, cancellation, or activity disposal. The upload form sends only the contract fields required by the Hub: doctor ID, document type, display name, filename, MIME type, and Base64 content.

The temporary viewer decodes images in memory and renders the first PDF page through `PdfRenderer` backed by an in-memory file descriptor. It provides no save, share, download, or external-viewer action. The viewer clears the document byte array and recycles decoded bitmaps when closed or disposed. The Android screen does not cache doctor profiles or document metadata; the current Hub protocol authorizes document retrieval by document ID, so the desktop Doctor Profiles workspace remains the source for discovering document IDs.

## Database migration

Migration 21 adds:

- `doctor_profiles`, containing profile fields, JSON arrays for specialties/departments/languages, a profile version, and license-verification state.
- `doctor_documents`, containing document family/version metadata, strict MIME and 20 MiB checks, sensitivity classification, ciphertext vault path, AES-GCM envelope metadata, content hash, and lifecycle state.
- Indexes for license status, doctor/document status, and document-family version ordering.

Earlier migration versions and their checksums remain unchanged.

## Verification

Synthetic tests cover:

- Owner versus Admin profile editing.
- Protection of Admin-only fields.
- Sensitive-document filtering for nurses and other non-privileged users.
- AES-GCM document encryption round trips.
- Plaintext hash and size verification.
- Replacement version creation and archival.
- Tampered ciphertext rejection.
- Unsupported document sizes and MIME types.
- Windows vault round trips, atomic storage, deletion, and path-traversal rejection.
- Encrypted LAN document-request routing.

The available TypeScript and desktop gate passed after implementation:

```text
Workspace tests: passed
TypeScript typecheck: passed
Desktop production build: passed
Prettier formatting: passed
Git whitespace check: passed
```

Android Kotlin compilation, Android JVM tests, APK assembly, and physical-device viewing/upload remain pending because the current sandbox has no Android SDK, Gradle toolchain, Kotlin compiler, or connected devices. The source-level UI and file-picker workflow are implemented, but they must be compiled and exercised on an Android workstation before release claims can be made.

## Release gates still required

The Android workstation must verify Room/database compatibility with the new repository state, Kotlin compilation of the new Compose document workspace, repository active-profile lookup, secure-session and in-memory document-stream classes, and installation on API 29 and newer devices. Physical testing must verify Admin/doctor/nurse/receptionist permissions, correct and incorrect trust anchors, LAN-only view/upload behavior, OpenDocument MIME and size rejection, no Android file creation, no share/download affordances, viewer byte clearing, process death, session expiry, oversized-file rejection, corrupted-content rejection, and Hub restart.

The clinic should also confirm whether document viewing by nurses and receptionists should expose all ordinary document types or only a smaller subset. The implementation currently allows ordinary non-sensitive documents and hides sensitive documents from users without the sensitive-read capability.
