# Release Signing and CI Activation

**Review date:** 21 August 2026

**Repository:** `mohamedarafa1991-stack/elite-clinic-management-system`

## Release-signing policy

Development builds are not production artifacts. A Windows installer and Android APK must be signed by release credentials held outside the source repository and outside pull-request jobs. The private keys must remain in the clinic’s controlled release environment or an approved signing service; only public certificates, checksums, and verification instructions may be published with a release.

| Artifact                   | Required control                                                                                                                             | Verification evidence                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Windows NSIS installer     | Authenticode signing with the clinic-approved code-signing certificate; timestamp the signature; verify on a clean Windows 10/11 workstation | `Get-AuthenticodeSignature`, certificate chain, signer identity, timestamp, SHA-256 checksum                                              |
| Android APK                | Release keystore held outside Git; deterministic version metadata; APK signature verification before direct installation                     | `apksigner verify --verbose`, signer certificate digest, SHA-256 checksum, install/upgrade result on API 29 and supported current Android |
| Update or rollback package | Verify signature and checksum before installation; retain the previous installer/APK and database backup                                     | Signed artifact record, backup manifest, rollback result                                                                                  |

Release keys must never be committed, placed in `.env` files, embedded in CI logs, or made available to untrusted pull-request jobs. The release operator should record the artifact name, version, commit, signing certificate fingerprint, checksum, timestamp, and approval identity in the release evidence pack.

## CI activation

The repository contains a local CI workflow draft under `.github/workflows/`. It is intentionally not committed while the active GitHub credential lacks the `workflow` permission required to create or update workflow files. This is a credential boundary, not a test failure. The workflow should be published only after an administrator deliberately authorizes a credential with workflow scope.

After permission is available, the operator should inspect the draft, commit it in a separate change, and confirm that GitHub displays the workflow under Actions. Pull requests should run the shared TypeScript tests, typecheck, canonical-JSON vectors, Android JVM tests, and release-readiness checks. Signing secrets must be configured only as protected environment secrets for a release job; pull-request jobs must not receive them.

The first activation should be verified with a harmless pull request that changes a test-only file. The evidence should include the workflow run URL, commit SHA, each required job’s result, and confirmation that no secret value appears in logs. If the credential still cannot update workflows, keep the workflow file local and continue running the equivalent commands through the local release harness.

## Local verification commands

```powershell
pnpm test
pnpm typecheck
pnpm desktop:build
pnpm release:readiness
cd apps/android
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

These commands establish build and test evidence; they do not sign production artifacts. Signing and physical validation remain workstation gates and must be recorded separately.

## References

[1]: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-authenticodesignature "Microsoft Learn — Get-AuthenticodeSignature"
[2]: https://developer.android.com/tools/apksigner "Android Developers — apksigner"
[3]: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions "GitHub Docs — Security hardening for GitHub Actions"
