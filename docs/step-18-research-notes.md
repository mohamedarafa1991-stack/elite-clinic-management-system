# Step 18 Research Notes

## Sources reviewed

1. HL7 FHIR R4 Provenance: https://hl7.org/fhir/R4/provenance.html

   FHIR R4 describes Provenance as a record of the entities and processes involved in producing, delivering, or influencing a resource. It tracks the activity that created, revised, deleted, or signed a resource and identifies the agents and entities involved. The page distinguishes Provenance from AuditEvent: Provenance is a record-keeping assertion about how a resource came to be, while AuditEvent records events as they occur for security and audit purposes. Provenance targets should be uniquely and unambiguously identifiable, with version information when necessary.

2. HL7 FHIR R4 AuditEvent: https://hl7.org/fhir/R4/auditevent.html

   FHIR R4 defines AuditEvent as a record of an event maintained for security logging, including intrusion detection and inappropriate-use monitoring. It identifies security-relevant events such as login/logout, access-control decisions, configuration changes, software installation, and data manipulation. AuditEvent access is typically limited to security, privacy, and system-administration personnel, and servers generally should not accept update/delete operations that compromise audit integrity.

3. HL7 FHIR R4 Consent: https://hl7.org/fhir/R4/consent.html

   FHIR R4 Consent expresses a healthcare consumer’s choices that permit or deny identified recipients or roles to perform actions for specific purposes and periods. Privacy consent may govern collection, access, use, and disclosure. The specification states that enforcement details are outside the base Consent resource and require an access-control policy model; this means the clinic should use Consent as authorization evidence, not as a complete enforcement engine by itself.

4. HL7 FHIR R4 Security Labels: https://hl7.org/fhir/R4/security-labels.html

   FHIR R4 security labels attach security metadata to resources or bundles so an access-control decision engine can approve operations, determine returned resources, and convey handling caveats. Labels depend on a wider policy and consent framework and are most effective where trading partners share a mutual trust framework. Purpose-of-use, confidentiality, sensitivity, integrity, and handling-caveat labels are relevant to clinical exports.

## Planning implications

Step 18 should prioritize FHIR Provenance and AuditEvent resources for signed exports, then add a narrow recipient/purpose/consent reference model with explicit enforcement rules. It should not claim that security labels alone enforce confidentiality or that a FHIR Consent resource automatically authorizes disclosure. The existing local audit ledger should remain append-only and authoritative; exported AuditEvent resources should be projections of the ledger rather than replacements for it.
