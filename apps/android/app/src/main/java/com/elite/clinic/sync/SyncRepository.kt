package com.elite.clinic.sync

import androidx.room.withTransaction
import com.elite.clinic.data.EliteDatabase
import kotlinx.coroutines.flow.Flow
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

class SyncRepository(
    private val database: EliteDatabase,
) {
    fun observeCursors(deviceId: String): Flow<List<SyncCursorEntity>> =
        database.syncDao().observeCursors(deviceId)

    fun observeScope(deviceId: String, scope: String): Flow<List<SyncResourceMetadataEntity>> =
        database.syncDao().observeResources(deviceId, scope)

    suspend fun applyDelta(
        responseJson: String,
        expectedOrganizationId: String,
        expectedDeviceId: String,
        expectedNonce: String,
        trustedPublicKeyPem: String,
        now: Instant = Instant.now(),
    ): SyncVerificationResult {
        val verification = SyncResponseVerifier.verifyDelta(
            responseJson = responseJson,
            expectedOrganizationId = expectedOrganizationId,
            expectedDeviceId = expectedDeviceId,
            expectedNonce = expectedNonce,
            trustedPublicKeyPem = trustedPublicKeyPem,
            now = now,
        )
        if (verification !is SyncVerificationResult.Accepted) {
            return verification
        }
        val response = JSONObject(responseJson)
        if (response.optBoolean("fullSyncRequired", false)) {
            return SyncVerificationResult.Rejected("SYNC_FULL_SYNC_REQUIRED")
        }
        val changes = response.optJSONArray("changes") ?: org.json.JSONArray()
        val dao = database.syncDao()
        database.withTransaction {
            for (index in 0 until changes.length()) {
                val change = changes.getJSONObject(index)
                val payload = change.optJSONObject("payload")
                dao.upsertResourceMetadata(
                    SyncResourceMetadataEntity(
                        deviceId = verification.deviceId,
                        scope = verification.scope,
                        resourceType = change.getString("resourceType"),
                        resourceId = change.getString("resourceId"),
                        version = change.getLong("version"),
                        updatedAt = change.getString("updatedAt"),
                        payloadHash = change.getString("payloadHash"),
                        operation = change.getString("operation"),
                        redacted = change.getString("operation") == "redact" || payload == null,
                    ),
                )
            }
            dao.upsertCursor(
                SyncCursorEntity(
                    deviceId = verification.deviceId,
                    scope = verification.scope,
                    cursor = verification.nextCursor,
                    serverSequence = verification.serverSequence,
                    acceptedAt = now.toString(),
                ),
            )
            dao.insertImportEvent(
                SyncImportEventEntity(
                    id = UUID.randomUUID().toString(),
                    deviceId = verification.deviceId,
                    scope = verification.scope,
                    result = "accepted",
                    reasonCode = "SYNC_DELTA_APPLIED",
                    serverSequence = verification.serverSequence,
                    changeCount = verification.changeCount,
                    occurredAt = now.toString(),
                ),
            )
        }
        return verification
    }

}
