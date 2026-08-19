# Elite Clinic Physical Pilot Operator Commands

**Clinic:** Elite Clinic / ايليت, Cairo, Egypt
**Purpose:** Controlled physical validation before any real patient data is introduced
**Data rule:** Synthetic data only. Do not substitute real patient names, national IDs, phone numbers, medical documents, credentials, or production encryption keys.

> **Stop rule:** Stop immediately and record a failed or blocked scenario if the app exposes real data, accepts an incorrect TLS trust anchor, writes protected doctor documents to an unauthorized Android location, loses encrypted data, bypasses device revocation, performs an unreviewed destructive migration, or silently retries a permanent security failure.

## 1. Windows Hub preflight

Run these commands from a clean checkout on the intended Windows Hub workstation in PowerShell. The repository must be at the exact commit being tested.

```powershell
Set-Location C:\path\to\elite-clinic-management-system

git status --short --branch
git rev-parse HEAD
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm release:readiness
pnpm pilot:evidence -- --clean --require-artifacts
```

Copy the evidence record template into the generated pack, then replace only the approved placeholders with sanitized operator, workstation, device, certificate, and artifact metadata.

```powershell
Copy-Item `
  docs\templates\physical-device-validation-record.json `
  artifacts\pilot-evidence-pack\physical-device-validation-record.json

pnpm pilot:validate-record -- `
  --record artifacts\pilot-evidence-pack\physical-device-validation-record.json `
  --output artifacts\pilot-evidence-pack\physical-record-validation.json
```

Record the checksums of the exact installer and signed APK that will be tested. Do not place private signing keys, database keys, passwords, or plaintext database/vault files in the evidence pack.

```powershell
Get-FileHash .\release\Elite-Clinic-*.exe -Algorithm SHA256
Get-FileHash .\apps\android\app\build\outputs\apk\release\app-release.apk -Algorithm SHA256
```

If the pack is generated before the repository-side commit is complete, local development verification may use the explicit override below. Do not use it for the physical pilot sign-off pack.

```powershell
$env:ELITE_EVIDENCE_ALLOW_WORKTREE = "true"
pnpm pilot:evidence -- --clean --require-artifacts
Remove-Item Env:ELITE_EVIDENCE_ALLOW_WORKTREE
```

## 2. Android device inventory

Connect the floor, current-supported, and second synchronization device. Use sanitized labels in the record rather than serial numbers unless the clinic has explicitly approved retaining those identifiers.

```powershell
adb devices -l
adb -s <device-id> shell getprop ro.product.manufacturer
adb -s <device-id> shell getprop ro.product.model
adb -s <device-id> shell getprop ro.build.version.sdk
adb -s <device-id> shell getprop ro.build.version.security_patch
adb -s <device-id> shell settings get secure android_id
```

Do not copy the raw Android ID into the evidence record. Record only the approved sanitized identity label or an approved one-way fingerprint.

## 3. APK installation and lifecycle

Verify the signed APK outside the application before installing. The signing certificate and SHA-256 value must match the Admin-owned release record.

```powershell
$apk = "C:\path\to\app-release.apk"
Get-FileHash $apk -Algorithm SHA256
adb -s <device-id> install -r $apk
adb -s <device-id> shell am force-stop com.elite.clinic
adb -s <device-id> shell monkey -p com.elite.clinic 1
```

For upgrade and rollback, retain the previous approved APK checksum and record the installed version before and after each operation. A downgrade or revoked-device test is not passed merely because installation succeeds; the application must enforce the documented version, enrollment, and revocation policy.

## 4. Offline and LAN boundary tests

For offline scenarios, disable both Wi-Fi and mobile data on the device and disconnect the Hub from the test LAN. Record the start time, policy version, observed lock/expiry state, and recovery result. The application must not require cloud access for approved offline behavior.

For LAN scenarios, use an isolated synthetic network. Test the approved certificate, an incorrect trust anchor, a stopped Hub, and a restarted Hub. Record only sanitized error codes, retryability, timestamps, certificate labels, and Hub restart evidence. Never paste access tokens, private keys, session frames, or document contents into logs or the evidence record.

## 5. Doctor-document persistence inventory

After synthetic upload, view, close, cancellation, rotation, and process-death scenarios, inspect only approved application locations. The expected result is no persisted doctor-document content in Room, app files, external files, WorkManager input, logs, downloads, recents, screenshots, or recording output.

```powershell
adb -s <device-id> shell run-as com.elite.clinic find . -type f -print
adb -s <device-id> shell dumpsys activity activities | Select-String "com.elite.clinic"
adb -s <device-id> shell dumpsys jobscheduler | Select-String "com.elite.clinic"
```

The `run-as` command may return no useful files on a release build or may be restricted by the device. Treat an unavailable inventory as `blocked`, not `passed`; use the approved device-specific inspection procedure and record the limitation.

Verify `FLAG_SECURE` by attempting a screenshot, screen recording, and recents-thumbnail inspection while the doctor-document viewer is active. Do not retain screenshots containing document content. Record only whether capture was prevented and the sanitized evidence path.

## 6. Backup and replacement-Hub restore

Use the approved encrypted USB media and its independently verified second copy. Create the backup from synthetic data, record the manifest checksum and media label, then restore to a separate replacement-Hub directory or replacement workstation. Do not overwrite the source Hub during the first restore attempt.

The restore is passed only when the approved key opens the database, migration and integrity checks pass, table counts reconcile, vault hashes match, audit history remains intact, and the Admin explicitly approves replacement. Any plaintext artifact, key mismatch, unexplained count difference, or source mutation is a stop condition.

## 7. Status-aware readiness report

After all scenario records are updated and the record validator passes, generate the final status-aware report from the same record:

```powershell
$env:ELITE_PHYSICAL_RECORD = "artifacts/pilot-evidence-pack/physical-device-validation-record.json"
$env:ELITE_READINESS_REPORT = "artifacts/release-readiness/physical-signoff-gates.json"
pnpm release:readiness
Remove-Item Env:ELITE_PHYSICAL_RECORD
Remove-Item Env:ELITE_READINESS_REPORT
```

Use strict mode only after every required scenario is `passed` or formally approved as `not-applicable` with documented reasoning:

```powershell
$env:ELITE_PHYSICAL_RECORD = "artifacts/pilot-evidence-pack/physical-device-validation-record.json"
pnpm release:readiness -- --fail-on-blocked
Remove-Item Env:ELITE_PHYSICAL_RECORD
```

The real-clinic go decision requires the final record, checklist, hashes, recovery evidence, and two Admin approvals. Until then, the application remains a synthetic-data pre-pilot system.
