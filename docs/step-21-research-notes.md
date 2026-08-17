# Step 21 Research Notes

## FHIR R4 synchronization and versioning

FHIR R4 defines granular resource interactions such as read, version-specific read, update, patch, history, batch, and transaction. A FHIR server should publish a CapabilityStatement that declares supported resources and interactions [1]. FHIR resource metadata includes logical IDs, version IDs, and last-updated timestamps; version-aware clients can use ETags and conditional requests to prevent overwriting a newer resource version [1].

The FHIR specification does not itself define application authentication, authorization, or audit collection. Those controls must be provided by the clinic’s Hub protocol and governance layer. Production healthcare-data exchange should use protected transport, role/attribute-based authorization, and consent where applicable [1].

For Elite Clinic, Step 21 should not expose a general-purpose FHIR server to Android. It should implement a narrow, Hub-owned synchronization protocol that returns allow-listed patient and clinical records, a server sequence/cursor, resource version metadata, and explicit conflict responses. FHIR R4 JSON may be used as the transport representation for clinical resources, but the Hub remains responsible for authorization and audit.

## Mobile-health data minimization

FTC mobile-health guidance recommends minimizing collection and retention, limiting access and permissions, protecting retained data, using strong authentication, applying security by design, and maintaining an inventory of what data the app stores and where it goes [2]. It also emphasizes secure transport, strong encryption at rest, secure password storage, least privilege, update planning, and clear user communication for sensitive collection and sharing [2].

The Step 21 sync scope should therefore be least-privilege and role-aware. A nurse or receptionist should not receive unrestricted clinical notes merely because the device is enrolled. Patient lists, demographics, appointments, encounter summaries, and full clinical notes should be distinct sync classes, each gated by capability and purpose. The Android client should retain only the records needed for its assigned workflow and should log synchronization metadata without logging clinical content.

OWASP’s mobile privacy testing guidance treats health data as sensitive and expects testing of data exposure through storage, logs, UI, screenshots, backups, and inter-process boundaries [3]. Step 21 should include adversarial tests for unauthorized synchronization, stale local records, queued writes, background leakage, and de-enrollment cleanup.

## Planning implication

Once Step 20 provides a secure Android session and encrypted local store, the highest-value Step 21 focus is **minimum-necessary, conflict-safe clinical synchronization between the Windows Hub and Android**. The first increment should prioritize read-only patient and appointment synchronization, then add a tightly bounded outbox for low-conflict operational writes. Clinical encounter note editing should remain behind explicit version-aware amendments rather than last-write-wins replacement.

## References

[1]: https://www.hl7.org/fhir/R4/http.html "HL7 FHIR R4 — RESTful API"
[2]: https://www.ftc.gov/business-guidance/resources/mobile-health-app-developers-ftc-best-practices "FTC — Mobile Health App Developers: Best Practices"
[3]: https://mas.owasp.org/MASTG/0x04i-Testing-User-Privacy-Protection/ "OWASP MASTG — Mobile App User Privacy Protection"
