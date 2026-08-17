package com.elite.clinic.sync

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
