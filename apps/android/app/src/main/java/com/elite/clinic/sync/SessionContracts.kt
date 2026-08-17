package com.elite.clinic.sync

data class EnrollmentChallengeDescriptor(
    val protocolVersion: Int,
    val messageType: String,
    val challengeId: String,
    val organizationId: String,
    val intendedUserId: String,
    val intendedRole: String,
    val requestedPolicyVersion: Long,
    val requestedScopes: List<String>,
    val issuedAt: String,
    val expiresAt: String,
    val responseNonce: String,
)

data class EnrollmentChallenge(
    val descriptor: EnrollmentChallengeDescriptor,
    val responseHash: String,
    val signatureAlgorithm: String,
    val signatureBase64: String,
    val signerKeyId: String,
    val signerKeyVersion: Long,
)

data class EnrollmentDeviceRequestDescriptor(
    val protocolVersion: Int,
    val messageType: String,
    val requestId: String,
    val challengeId: String,
    val organizationId: String,
    val deviceId: String,
    val deviceName: String,
    val devicePublicKeySpkiBase64: String,
    val devicePublicKeyFingerprint: String,
    val appVersion: String,
    val apiLevel: Int?,
    val requestedAt: String,
    val requestNonce: String,
)

data class EnrollmentDeviceRequest(
    val descriptor: EnrollmentDeviceRequestDescriptor,
    val deviceSignatureAlgorithm: String,
    val deviceSignatureBase64: String,
)

data class EnrollmentResponseDescriptor(
    val protocolVersion: Int,
    val messageType: String,
    val enrollmentId: String,
    val challengeId: String,
    val organizationId: String,
    val deviceId: String,
    val userId: String,
    val role: String,
    val deviceName: String,
    val devicePublicKeyFingerprint: String,
    val policyVersion: Long,
    val allowedScopes: List<String>,
    val patientScope: Map<String, Any?>?,
    val responseNonce: String,
    val issuedAt: String,
    val expiresAt: String,
    val offlineAccessUntil: String,
    val hubTrustAnchorId: String,
    val hubTrustAnchorVersion: Long,
    val responseHash: String,
)

data class EnrollmentResponse(
    val descriptor: EnrollmentResponseDescriptor,
    val signatureAlgorithm: String,
    val signatureBase64: String,
    val signerKeyId: String,
    val signerKeyVersion: Long,
)

data class EnrollmentAcknowledgmentDescriptor(
    val protocolVersion: Int,
    val messageType: String,
    val enrollmentId: String,
    val responseHash: String,
    val deviceId: String,
    val acceptedAt: String,
    val acknowledgmentNonce: String,
)

data class EnrollmentAcknowledgment(
    val descriptor: EnrollmentAcknowledgmentDescriptor,
    val deviceSignatureAlgorithm: String,
    val deviceSignatureBase64: String,
)

data class SessionInitDescriptor(
    val protocolVersion: Int,
    val messageType: String,
    val organizationId: String,
    val enrollmentId: String,
    val deviceId: String,
    val userId: String,
    val sessionId: String,
    val requestNonce: String,
    val clientCounter: Long,
    val deviceIdentityKeyFingerprint: String,
    val deviceEphemeralPublicKeySpkiBase64: String,
    val deviceEphemeralKeyFingerprint: String,
    val requestedScopes: List<String>,
    val requestedAt: String,
)

data class SessionInitRequest(
    val descriptor: SessionInitDescriptor,
    val deviceSignatureAlgorithm: String,
    val deviceSignatureBase64: String,
)

data class SessionGrantDescriptor(
    val protocolVersion: Int,
    val messageType: String,
    val organizationId: String,
    val enrollmentId: String,
    val deviceId: String,
    val userId: String,
    val sessionId: String,
    val requestNonce: String,
    val clientCounter: Long,
    val serverEphemeralPublicKeySpkiBase64: String,
    val serverEphemeralKeyFingerprint: String,
    val grantedScopes: List<String>,
    val issuedAt: String,
    val validUntil: String,
    val transcriptHash: String,
    val keyConfirmationMacBase64: String,
    val noncePrefixBase64: String,
)

data class SessionGrant(
    val descriptor: SessionGrantDescriptor,
    val signatureAlgorithm: String,
    val signatureBase64: String,
    val signerKeyId: String,
    val signerKeyVersion: Long,
)

data class SessionFrame(
    val protocolVersion: Int,
    val messageType: String,
    val sessionId: String,
    val direction: String,
    val counter: Long,
    val nonceBase64: String,
    val aadHash: String,
    val ciphertextBase64: String,
    val tagBase64: String,
    val deviceSignatureAlgorithm: String? = null,
    val deviceSignatureBase64: String? = null,
)
