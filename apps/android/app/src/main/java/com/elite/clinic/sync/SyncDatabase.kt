package com.elite.clinic.sync

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertCursor(cursor: SyncCursorEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertResourceMetadata(metadata: SyncResourceMetadataEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertImportEvent(event: SyncImportEventEntity)

    @Query("SELECT * FROM sync_cursors WHERE deviceId = :deviceId ORDER BY scope")
    fun observeCursors(deviceId: String): Flow<List<SyncCursorEntity>>

    @Query("SELECT * FROM sync_resource_metadata WHERE deviceId = :deviceId AND scope = :scope ORDER BY updatedAt DESC")
    fun observeResources(deviceId: String, scope: String): Flow<List<SyncResourceMetadataEntity>>

    @Query("DELETE FROM sync_resource_metadata WHERE deviceId = :deviceId AND scope = :scope")
    suspend fun deleteScope(deviceId: String, scope: String)
}
