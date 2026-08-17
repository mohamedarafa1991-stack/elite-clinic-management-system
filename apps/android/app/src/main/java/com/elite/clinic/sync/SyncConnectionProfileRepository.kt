package com.elite.clinic.sync

import org.json.JSONArray
import java.time.Instant

class SyncConnectionProfileRepository(
    private val dao: SyncDao,
) {
    suspend fun getActive(
        deviceId: String,
        now: Instant = Instant.now(),
    ): ActiveSyncConnectionProfile? {
        val entity = dao.getConnectionProfile(deviceId) ?: return null
        if (entity.state != "active") return null
        val expiresAt = parseInstant(entity.expiresAt) ?: return null
        val offlineAccessUntil = parseInstant(entity.offlineAccessUntil) ?: return null
        if (!expiresAt.isAfter(now) || !offlineAccessUntil.isAfter(now)) return null
        val scopes = parseScopes(entity.allowedScopesJson)
        if (scopes.isEmpty() || scopes.size > 5) return null
        return ActiveSyncConnectionProfile(
            entity = entity,
            policy = SyncDevicePolicy(
                organizationId = entity.organizationId,
                enrollmentId = entity.enrollmentId,
                deviceId = entity.deviceId,
                userId = entity.userId,
                policyVersion = entity.policyVersion,
                allowedScopes = scopes,
                expiresAt = entity.expiresAt,
                offlineAccessUntil = entity.offlineAccessUntil,
                state = entity.state,
            ),
        )
    }

    suspend fun installEnrollment(
        response: EnrollmentResponseDescriptor,
        hubBaseUrl: String,
        hubTlsCertificatePem: String,
        hubTrustAnchorPem: String,
        now: Instant = Instant.now(),
    ) {
        val expiresAt = parseInstant(response.expiresAt)
            ?: throw IllegalArgumentException("SYNC_ENROLLMENT_EXPIRY_INVALID")
        val offlineAccessUntil = parseInstant(response.offlineAccessUntil)
            ?: throw IllegalArgumentException("SYNC_ENROLLMENT_OFFLINE_EXPIRY_INVALID")
        require(expiresAt.isAfter(now)) { "SYNC_ENROLLMENT_EXPIRED" }
        require(offlineAccessUntil.isAfter(now)) { "SYNC_ENROLLMENT_OFFLINE_EXPIRED" }
        save(
            SyncConnectionProfileEntity(
                deviceId = response.deviceId,
                organizationId = response.organizationId,
                enrollmentId = response.enrollmentId,
                userId = response.userId,
                hubBaseUrl = hubBaseUrl.trimEnd('/'),
                hubTlsCertificatePem = hubTlsCertificatePem,
                hubTrustAnchorPem = hubTrustAnchorPem,
                hubTrustAnchorId = response.hubTrustAnchorId,
                hubTrustAnchorVersion = response.hubTrustAnchorVersion,
                policyVersion = response.policyVersion,
                allowedScopesJson = JSONArray().apply {
                    response.allowedScopes.forEach(::put)
                }.toString(),
                state = "active",
                expiresAt = response.expiresAt,
                offlineAccessUntil = response.offlineAccessUntil,
                updatedAt = now.toString(),
            ),
        )
    }

    suspend fun save(profile: SyncConnectionProfileEntity) {
        require(profile.deviceId.isNotBlank()) { "SYNC_PROFILE_DEVICE_ID_REQUIRED" }
        require(profile.hubBaseUrl.startsWith("https://")) {
            "SYNC_PROFILE_HTTPS_REQUIRED"
        }
        require(profile.hubTlsCertificatePem.contains("BEGIN CERTIFICATE")) {
            "SYNC_PROFILE_TLS_CERTIFICATE_REQUIRED"
        }
        require(profile.hubTrustAnchorPem.contains("BEGIN PUBLIC KEY")) {
            "SYNC_PROFILE_TRUST_ANCHOR_REQUIRED"
        }
        require(parseScopes(profile.allowedScopesJson).isNotEmpty()) {
            "SYNC_PROFILE_SCOPES_REQUIRED"
        }
        dao.upsertConnectionProfile(profile)
    }

    suspend fun revoke(deviceId: String, now: Instant = Instant.now()) {
        dao.updateConnectionProfileState(deviceId, "revoked", now.toString())
    }

    private fun parseScopes(value: String): Set<String> {
        val array = JSONArray(value)
        return buildSet {
            for (index in 0 until array.length()) {
                val scope = array.optString(index, "").trim()
                if (scope.isNotEmpty()) add(scope)
            }
        }
    }

    private fun parseInstant(value: String): Instant? = try {
        Instant.parse(value)
    } catch (_: Exception) {
        null
    }
}

data class ActiveSyncConnectionProfile(
    val entity: SyncConnectionProfileEntity,
    val policy: SyncDevicePolicy,
)
