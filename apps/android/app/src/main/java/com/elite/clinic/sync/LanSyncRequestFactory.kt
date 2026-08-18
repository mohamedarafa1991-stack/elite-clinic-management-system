package com.elite.clinic.sync

import com.elite.clinic.data.LocalOutboxEvent
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/** The signed enrollment policy used to constrain every LAN request. */
data class SyncDevicePolicy(
    val organizationId: String,
    val enrollmentId: String,
    val deviceId: String,
    val userId: String,
    val policyVersion: Long,
    val allowedScopes: Set<String>,
    val expiresAt: String,
    val offlineAccessUntil: String,
    val state: String = "active",
)

object LanSyncRequestFactory {
    private val supportedScopes = setOf(
        "appointments",
        "patient-summary",
        "encounter-summary",
        "clinical-notes",
        "export-governance",
        "billing-summary",
    )
    private val supportedResourceTypes = setOf(
        "Appointment",
        "Patient",
        "Encounter",
        "Composition",
        "Condition",
        "ExportPackage",
        "BillingInvoice",
    )
    private val supportedOperations = setOf(
        "appointment-acknowledge",
        "appointment-arrival",
        "queue-note",
    )

    fun newSyncSessionId(): String = "sync-${UUID.randomUUID()}"

    fun newRequestNonce(): String = UUID.randomUUID().toString().replace("-", "") +
        UUID.randomUUID().toString().replace("-", "")

    fun buildDeltaRequest(
        policy: SyncDevicePolicy,
        scope: String,
        cursor: String?,
        syncSessionId: String = newSyncSessionId(),
        requestNonce: String = newRequestNonce(),
        requestedAt: String = Instant.now().toString(),
        clientBaseVersion: Long = 0,
        maxChanges: Int = 500,
    ): JSONObject {
        assertActive(policy)
        assertScope(policy, scope)
        require(requestNonce.length in 16..128) { "SYNC_REQUEST_NONCE_INVALID" }
        require(maxChanges in 1..5000) { "SYNC_MAX_CHANGES_INVALID" }
        return JSONObject().apply {
            put("protocolVersion", 1)
            put("organizationId", policy.organizationId)
            put("deviceId", policy.deviceId)
            put("userId", policy.userId)
            put("syncSessionId", syncSessionId)
            put("scope", scope)
            if (cursor != null) put("cursor", cursor)
            put("clientBaseVersion", clientBaseVersion)
            put("knownPolicyVersion", policy.policyVersion)
            put("requestNonce", requestNonce)
            put("requestedAt", requestedAt)
            put("maxChanges", maxChanges)
        }
    }

    fun scopeForEvent(event: LocalOutboxEvent): String = when (event.entityType) {
        "Appointment" -> "appointments"
        "Patient" -> "patient-summary"
        "Encounter", "Composition", "Condition" -> "clinical-notes"
        "ExportPackage" -> "export-governance"
        else -> throw IllegalArgumentException("SYNC_OUTBOX_SCOPE_UNSUPPORTED")
    }

    fun buildOutboxRequest(
        policy: SyncDevicePolicy,
        event: LocalOutboxEvent,
        scope: String,
        reason: String = "offline-local-operation",
    ): JSONObject {
        assertActive(policy)
        assertScope(policy, scope)
        require(event.deviceId == policy.deviceId) { "SYNC_OUTBOX_DEVICE_MISMATCH" }
        require(event.userId == policy.userId) { "SYNC_OUTBOX_USER_MISMATCH" }
        require(event.entityType in supportedResourceTypes) { "SYNC_OUTBOX_RESOURCE_TYPE_INVALID" }
        require(event.operation in supportedOperations) { "SYNC_OUTBOX_OPERATION_INVALID" }
        require(reason.trim().length in 3..500) { "SYNC_OUTBOX_REASON_INVALID" }
        val payload = JSONObject(event.payloadJson)
        return JSONObject().apply {
            put("operationId", event.id)
            put("organizationId", policy.organizationId)
            put("deviceId", event.deviceId)
            put("userId", event.userId)
            put("scope", scope)
            put("operation", event.operation)
            put("resourceType", event.entityType)
            put("resourceId", event.entityId)
            put("baseVersion", event.baseVersion)
            put("payload", payload)
            put("reason", reason.trim())
            put("createdAt", event.occurredAt)
        }
    }

    private fun assertActive(policy: SyncDevicePolicy) {
        require(policy.state == "active") { "SYNC_DEVICE_POLICY_NOT_ACTIVE" }
    }

    private fun assertScope(policy: SyncDevicePolicy, scope: String) {
        require(scope in supportedScopes) { "SYNC_SCOPE_INVALID" }
        require(scope in policy.allowedScopes) { "SYNC_SCOPE_DENIED" }
    }
}
