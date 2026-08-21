package com.elite.clinic.sync

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.time.Instant
import java.security.MessageDigest

sealed interface SyncVerificationResult {
    data class Accepted(
        val organizationId: String,
        val deviceId: String,
        val scope: String,
        val serverSequence: Long,
        val nextCursor: String,
        val hasMore: Boolean,
        val changeCount: Int,
    ) : SyncVerificationResult

    data class Rejected(val code: String) : SyncVerificationResult
}

object SyncResponseVerifier {
    fun verifyDelta(
        responseJson: String,
        expectedOrganizationId: String,
        expectedDeviceId: String,
        expectedNonce: String,
        trustedPublicKeyPem: String,
        now: Instant = Instant.now(),
    ): SyncVerificationResult {
        val json = try {
            JSONObject(responseJson)
        } catch (_: Exception) {
            return SyncVerificationResult.Rejected("SYNC_JSON_INVALID")
        }
        fun requiredString(name: String): String? {
            if (!json.has(name) || json.isNull(name)) return null
            val value = json.opt(name)
            return if (value == null || value == JSONObject.NULL) null else value.toString()
        }

        if (json.optInt("protocolVersion", -1) != 1) {
            return SyncVerificationResult.Rejected("SYNC_PROTOCOL_UNSUPPORTED")
        }
        if (requiredString("organizationId") != expectedOrganizationId) {
            return SyncVerificationResult.Rejected("SYNC_ORGANIZATION_MISMATCH")
        }
        if (requiredString("deviceId") != expectedDeviceId) {
            return SyncVerificationResult.Rejected("SYNC_DEVICE_MISMATCH")
        }
        if (requiredString("responseNonce") != expectedNonce) {
            return SyncVerificationResult.Rejected("SYNC_NONCE_MISMATCH")
        }

        val generatedAt = parseInstant(requiredString("generatedAt"))
            ?: return SyncVerificationResult.Rejected("SYNC_TIMESTAMP_INVALID")
        val validUntil = parseInstant(requiredString("validUntil"))
            ?: return SyncVerificationResult.Rejected("SYNC_TIMESTAMP_INVALID")
        if (validUntil.isBefore(generatedAt)) {
            return SyncVerificationResult.Rejected("SYNC_VALIDITY_WINDOW_INVALID")
        }
        if (now.isAfter(validUntil)) {
            return SyncVerificationResult.Rejected("SYNC_RESPONSE_EXPIRED")
        }

        val responseIntegrity = requiredString("responseIntegrity")
            ?: return SyncVerificationResult.Rejected("SYNC_INTEGRITY_MISSING")
        val integrityDescriptor = CanonicalJson.copyWithout(
            json,
            "responseIntegrity",
            "signatureAlgorithm",
            "signatureBase64",
            "signerKeyId",
            "signerKeyVersion",
        )
        if (sha256(CanonicalJson.encode(integrityDescriptor)) != responseIntegrity) {
            return SyncVerificationResult.Rejected("SYNC_RESPONSE_INTEGRITY_INVALID")
        }

        val changes = json.optJSONArray("changes")
            ?: return SyncVerificationResult.Rejected("SYNC_CHANGES_INVALID")
        val payloadResult = verifyPayloadHashes(changes)
        if (payloadResult != null) return SyncVerificationResult.Rejected(payloadResult)

        val signatureBase64 = requiredString("signatureBase64")
            ?: return SyncVerificationResult.Rejected("SYNC_SIGNATURE_MISSING")
        val signatureAlgorithm = requiredString("signatureAlgorithm")
        if (signatureAlgorithm != "ed25519") {
            return SyncVerificationResult.Rejected("SYNC_SIGNATURE_ALGORITHM_UNSUPPORTED")
        }
        val signedDescriptor = CanonicalJson.copyWithout(
            json,
            "signatureAlgorithm",
            "signatureBase64",
            "signerKeyId",
            "signerKeyVersion",
        )
        val signatureValid = try {
            val verifier = Signature.getInstance("Ed25519")
            verifier.initVerify(parsePublicKey(trustedPublicKeyPem))
            verifier.update(CanonicalJson.encode(signedDescriptor).toByteArray(Charsets.UTF_8))
            verifier.verify(Base64.decode(signatureBase64, Base64.DEFAULT))
        } catch (_: Exception) {
            false
        }
        if (!signatureValid) {
            return SyncVerificationResult.Rejected("SYNC_SIGNATURE_INVALID")
        }

        return SyncVerificationResult.Accepted(
            organizationId = expectedOrganizationId,
            deviceId = expectedDeviceId,
            scope = requiredString("scope") ?: return SyncVerificationResult.Rejected("SYNC_SCOPE_MISSING"),
            serverSequence = json.optLong("serverSequence", -1L),
            nextCursor = requiredString("nextCursor") ?: return SyncVerificationResult.Rejected("SYNC_CURSOR_MISSING"),
            hasMore = if (!json.has("hasMore")) {
                return SyncVerificationResult.Rejected("SYNC_PAGINATION_FLAG_MISSING")
            } else {
                json.optBoolean("hasMore")
            },
            changeCount = changes.length(),
        )
    }

    private fun verifyPayloadHashes(changes: JSONArray): String? {
        for (index in 0 until changes.length()) {
            val change = changes.optJSONObject(index) ?: return "SYNC_CHANGE_INVALID"
            val payload = change.optJSONObject("payload") ?: return "SYNC_PAYLOAD_MISSING"
            val expected = change.optString("payloadHash", "")
            if (expected != sha256(CanonicalJson.encode(payload))) {
                return "SYNC_PAYLOAD_HASH_INVALID"
            }
        }
        return null
    }

    private fun parseInstant(value: String?): Instant? = try {
        value?.let(Instant::parse)
    } catch (_: Exception) {
        null
    }

    private fun parsePublicKey(pem: String): PublicKey {
        val encoded = pem
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace(Regex("\\s"), "")
        return KeyFactory.getInstance("Ed25519")
            .generatePublic(X509EncodedKeySpec(Base64.decode(encoded, Base64.DEFAULT)))
    }

    private fun sha256(value: String): String = MessageDigest
        .getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }
}
