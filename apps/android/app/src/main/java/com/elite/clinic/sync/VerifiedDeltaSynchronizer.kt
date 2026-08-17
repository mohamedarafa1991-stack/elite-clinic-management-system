package com.elite.clinic.sync

import com.elite.clinic.data.EliteDatabase
import org.json.JSONObject
import java.time.Instant

class VerifiedDeltaSynchronizer(
    database: EliteDatabase,
    private val expectedOrganizationId: String,
    private val expectedDeviceId: String,
    private val expectedNonce: String,
    private val trustedPublicKeyPem: String,
) {
    private val repository = SyncRepository(database)

    suspend fun requestAndApply(
        session: SecureSession,
        request: JSONObject,
        now: Instant = Instant.now(),
    ): SyncVerificationResult {
        val response = session.requestDelta(request)
        val result = repository.applyDelta(
            responseJson = response.toString(),
            expectedOrganizationId = expectedOrganizationId,
            expectedDeviceId = expectedDeviceId,
            expectedNonce = expectedNonce,
            trustedPublicKeyPem = trustedPublicKeyPem,
            now = now,
        )
        if (result is SyncVerificationResult.Rejected) {
            throw SecurityException(result.reasonCode)
        }
        return result
    }
}
