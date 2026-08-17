# Step 19 Research Notes

## Android offline-first architecture

The official Android architecture guidance defines an offline-first app as one that keeps all or a critical subset of core functionality usable without network access. It recommends a local data source for every repository that uses network resources, with the local source acting as the canonical source for reads. Network operations should be isolated behind repositories, and higher layers should observe local state rather than communicate directly with the network source [1].

The guidance identifies pull-based, push-based, and hybrid synchronization approaches. Pull-based refresh is simple but can repeatedly fetch unchanged data. Push-based synchronization reduces data use but makes versioning and conflict resolution more difficult. For queued or deferred work, Android recommends persistent work such as WorkManager, with retry policies that distinguish transient connectivity failures from authorization or permanent errors [1].

For Elite Clinic, the Step 19 status-package consumer should therefore be a **local-first verifier**. It should read the locally imported status snapshot immediately, retain the previous trusted snapshot when a new import fails, and treat synchronization as an explicit repository operation. The mobile app should not receive the private signing key or become an issuer.

## Mobile storage and import security

OWASP MASVS identifies secure storage as a dedicated mobile security area and includes risks such as unencrypted sensitive data, keys stored outside the platform keystore, sensitive data in logs, and sensitive data included in backups [2]. The MASVS catalogue also includes signature-generation and signature-verification risks, key rotation and access restrictions, authentication and authorization failures, unsafe deserialization, sensitive UI exposure, screenshot capture, and insecure app-to-app communication [3].

Step 19 should apply these controls to the status-package import path:

| Area                 | Step 19 requirement                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage              | Store only the minimum status metadata locally; encrypt the local database or file store and exclude it from backups where appropriate.                                 |
| Keys                 | Distribute trusted public verification keys or a signed key manifest only; never distribute the Windows private signing key.                                            |
| Import               | Validate file size, archive member names, schema version, sequence, issuer identity, key ID/version, hashes, and signature before replacing the trusted local snapshot. |
| Replay               | Reject lower sequence numbers, stale validity windows, unexpected issuers, and duplicate package IDs unless an explicit recovery workflow permits them.                 |
| UI                   | Minimize exposure of patient identifiers and avoid logging package content, signatures, or sensitive import errors.                                                     |
| IPC and file sharing | Use explicit Android file-selection/import boundaries and treat every imported file as untrusted input.                                                                 |
| Backup               | Decide whether status metadata is exportable and ensure private or sensitive material is excluded from automatic backup.                                                |

## Planning implication

The highest-value Step 19 focus is **Android-compatible signed status-package consumption and governance synchronization**. This closes the gap between the Windows Hub issuer and the offline Android verifier while preserving the local-first and no-private-key-distribution constraints. Policy administration and the full governance history view should be included only where they support safe status import and receipt verification; broad clinical-data synchronization should remain out of scope for this step.

## References

[1]: https://developer.android.com/topic/architecture/data-layer/offline-first "Android Developers — Build an offline-first app"
[2]: https://mas.owasp.org/MASVS/05-MASVS-STORAGE/ "OWASP MASVS — Storage"
[3]: https://mas.owasp.org/MASVS/ "OWASP Mobile Application Security Verification Standard"
