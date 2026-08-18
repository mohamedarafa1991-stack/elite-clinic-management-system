package com.elite.clinic.sync

import androidx.room.ColumnInfo
import androidx.room.Entity

@Entity(
    tableName = "sync_cursors",
    primaryKeys = ["deviceId", "scope"],
)
data class SyncCursorEntity(
    val deviceId: String,
    val scope: String,
    val cursor: String,
    val serverSequence: Long,
    val acceptedAt: String,
)

@Entity(
    tableName = "sync_resource_metadata",
    primaryKeys = ["deviceId", "scope", "resourceType", "resourceId"],
)
data class SyncResourceMetadataEntity(
    val deviceId: String,
    val scope: String,
    val resourceType: String,
    val resourceId: String,
    val version: Long,
    val updatedAt: String,
    val payloadHash: String,
    val operation: String,
    val redacted: Boolean,
)

@Entity(
    tableName = "sync_billing_summaries",
    primaryKeys = ["deviceId", "invoiceId"],
)
data class BillingSummaryEntity(
    val deviceId: String,
    val invoiceId: String,
    val invoiceNumber: String,
    val patientId: String,
    val currency: String,
    val status: String,
    val subtotalEgp: Long,
    val discountEgp: Long,
    val totalEgp: Long,
    val paidEgp: Long,
    val balanceEgp: Long,
    val createdAt: String,
    val updatedAt: String,
    val version: Long,
    val payloadHash: String,
)

@Entity(tableName = "sync_import_events")
data class SyncImportEventEntity(
    @androidx.room.PrimaryKey val id: String,
    val deviceId: String,
    val scope: String,
    val result: String,
    val reasonCode: String,
    val serverSequence: Long,
    val changeCount: Int,
    val occurredAt: String,
)

@Entity(tableName = "sync_health")
data class SyncHealthEntity(
    @androidx.room.PrimaryKey val deviceId: String,
    val state: String,
    val reasonCode: String?,
    val retryable: Boolean,
    val lastAttemptAt: String?,
    val lastSuccessAt: String?,
    val nextRetryAt: String?,
    val updatedAt: String,
    @ColumnInfo(defaultValue = "0") val attemptCount: Int = 0,
    val lastFailureAt: String? = null,
    val terminalAt: String? = null,
    val lastCompletedAt: String? = null,
)

@Entity(tableName = "sync_connection_profiles")
data class SyncConnectionProfileEntity(
    @androidx.room.PrimaryKey val deviceId: String,
    val organizationId: String,
    val enrollmentId: String,
    val userId: String,
    val hubBaseUrl: String,
    val hubTlsCertificatePem: String,
    val hubTrustAnchorPem: String,
    val hubTrustAnchorId: String,
    val hubTrustAnchorVersion: Long,
    val policyVersion: Long,
    val allowedScopesJson: String,
    val state: String,
    val expiresAt: String,
    val offlineAccessUntil: String,
    val updatedAt: String,
)
