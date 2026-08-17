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

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertConnectionProfile(profile: SyncConnectionProfileEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertHealth(health: SyncHealthEntity)

    @Query("SELECT * FROM sync_health WHERE deviceId = :deviceId LIMIT 1")
    suspend fun getHealth(deviceId: String): SyncHealthEntity?

    @Query("SELECT * FROM sync_health WHERE deviceId = :deviceId LIMIT 1")
    fun observeHealth(deviceId: String): Flow<SyncHealthEntity?>

    @Query("SELECT * FROM sync_connection_profiles WHERE deviceId = :deviceId LIMIT 1")
    suspend fun getConnectionProfile(deviceId: String): SyncConnectionProfileEntity?

    @Query("UPDATE sync_connection_profiles SET state = :state, updatedAt = :updatedAt WHERE deviceId = :deviceId")
    suspend fun updateConnectionProfileState(deviceId: String, state: String, updatedAt: String): Int

    @Query("SELECT * FROM sync_cursors WHERE deviceId = :deviceId AND scope = :scope LIMIT 1")
    suspend fun getCursor(deviceId: String, scope: String): SyncCursorEntity?

    @Query("SELECT * FROM sync_cursors WHERE deviceId = :deviceId ORDER BY scope")
    fun observeCursors(deviceId: String): Flow<List<SyncCursorEntity>>

    @Query("SELECT * FROM sync_resource_metadata WHERE deviceId = :deviceId AND scope = :scope ORDER BY updatedAt DESC")
    fun observeResources(deviceId: String, scope: String): Flow<List<SyncResourceMetadataEntity>>

    @Query("DELETE FROM sync_resource_metadata WHERE deviceId = :deviceId AND scope = :scope")
    suspend fun deleteScope(deviceId: String, scope: String)
}
