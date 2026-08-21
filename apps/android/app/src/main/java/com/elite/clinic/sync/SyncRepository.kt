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

    fun observeBillingSummaries(deviceId: String): Flow<List<BillingSummaryEntity>> =
        database.syncDao().observeBillingSummaries(deviceId)

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
                val resourceType = change.getString("resourceType")
                val resourceId = change.getString("resourceId")
                val operation = change.getString("operation")
                dao.upsertResourceMetadata(
                    SyncResourceMetadataEntity(
                        deviceId = verification.deviceId,
                        scope = verification.scope,
                        resourceType = resourceType,
                        resourceId = resourceId,
                        version = change.getLong("version"),
                        updatedAt = change.getString("updatedAt"),
                        payloadHash = change.getString("payloadHash"),
                        operation = operation,
                        redacted = operation == "redact" || payload == null,
                        payloadJson = payload?.toString(),
                    ),
                )
                if (verification.scope == "billing-summary" && resourceType == "BillingInvoice") {
                    if (operation == "delete" || operation == "redact" || payload == null) {
                        dao.deleteBillingSummary(verification.deviceId, resourceId)
                    } else {
                        dao.upsertBillingSummary(parseBillingSummary(verification.deviceId, resourceId, change, payload))
                    }
                }
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

    private fun parseBillingSummary(
        deviceId: String,
        invoiceId: String,
        change: JSONObject,
        payload: JSONObject,
    ): BillingSummaryEntity {
        require(payload.getString("currency") == "EGP") { "SYNC_BILLING_CURRENCY_INVALID" }
        val subtotalEgp = payload.getLong("subtotalEgp")
        val discountEgp = payload.getLong("discountEgp")
        val totalEgp = payload.getLong("totalEgp")
        val paidEgp = payload.getLong("paidEgp")
        val balanceEgp = payload.getLong("balanceEgp")
        require(subtotalEgp >= 0 && discountEgp >= 0 && totalEgp >= 0) { "SYNC_BILLING_AMOUNT_INVALID" }
        require(discountEgp <= subtotalEgp && paidEgp >= 0 && balanceEgp >= 0) { "SYNC_BILLING_TOTAL_INVALID" }
        require(balanceEgp == maxOf(0L, totalEgp - paidEgp)) { "SYNC_BILLING_BALANCE_INVALID" }
        return BillingSummaryEntity(
            deviceId = deviceId,
            invoiceId = invoiceId,
            invoiceNumber = payload.getString("invoiceNumber"),
            patientId = payload.getString("patientId"),
            currency = "EGP",
            status = payload.getString("status"),
            subtotalEgp = subtotalEgp,
            discountEgp = discountEgp,
            totalEgp = totalEgp,
            paidEgp = paidEgp,
            balanceEgp = balanceEgp,
            createdAt = payload.getString("createdAt"),
            updatedAt = payload.getString("updatedAt"),
            version = change.getLong("version"),
            payloadHash = change.getString("payloadHash"),
        )
    }
}
