package com.elite.clinic.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import com.elite.clinic.security.DeviceKeyStore
import com.elite.clinic.sync.SyncCursorEntity
import com.elite.clinic.sync.SyncDao
import com.elite.clinic.sync.SyncImportEventEntity
import com.elite.clinic.sync.SyncResourceMetadataEntity

@Entity(tableName = "local_patients")
data class LocalPatient(
    @PrimaryKey val id: String,
    val patientId: String,
    val nameEn: String,
    val nameAr: String?,
    val dateOfBirth: String?,
    val phone: String,
    val status: String,
    val version: Long,
    val updatedAt: String,
)

@Entity(tableName = "local_outbox")
data class LocalOutboxEvent(
    @PrimaryKey val id: String,
    val deviceId: String,
    val userId: String,
    val entityType: String,
    val entityId: String,
    val baseVersion: Long,
    val newVersion: Long,
    val operation: String,
    val payloadJson: String,
    val payloadHash: String,
    val occurredAt: String,
    val state: String,
)

@Dao
interface LocalFoundationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPatient(patient: LocalPatient)

    @Query("SELECT * FROM local_patients WHERE status = 'active' ORDER BY nameEn LIMIT :limit")
    suspend fun activePatients(limit: Int): List<LocalPatient>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun enqueue(event: LocalOutboxEvent)

    @Query("SELECT * FROM local_outbox WHERE state = 'pending' ORDER BY occurredAt LIMIT :limit")
    suspend fun pendingEvents(limit: Int): List<LocalOutboxEvent>

    @Query("UPDATE local_outbox SET state = :state WHERE id = :id AND state = :expectedState")
    suspend fun transitionEventState(
        id: String,
        expectedState: String,
        state: String,
    ): Int
}

@Database(
    entities = [
        LocalPatient::class,
        LocalOutboxEvent::class,
        SyncCursorEntity::class,
        SyncResourceMetadataEntity::class,
        SyncImportEventEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
abstract class EliteDatabase : RoomDatabase() {
    abstract fun foundationDao(): LocalFoundationDao
    abstract fun syncDao(): SyncDao

    companion object {
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_cursors (
                        deviceId TEXT NOT NULL,
                        scope TEXT NOT NULL,
                        cursor TEXT NOT NULL,
                        serverSequence INTEGER NOT NULL,
                        acceptedAt TEXT NOT NULL,
                        PRIMARY KEY(deviceId, scope)
                    )
                    """.trimIndent(),
                )
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_resource_metadata (
                        deviceId TEXT NOT NULL,
                        scope TEXT NOT NULL,
                        resourceType TEXT NOT NULL,
                        resourceId TEXT NOT NULL,
                        version INTEGER NOT NULL,
                        updatedAt TEXT NOT NULL,
                        payloadHash TEXT NOT NULL,
                        operation TEXT NOT NULL,
                        redacted INTEGER NOT NULL,
                        PRIMARY KEY(deviceId, scope, resourceType, resourceId)
                    )
                    """.trimIndent(),
                )
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_import_events (
                        id TEXT NOT NULL PRIMARY KEY,
                        deviceId TEXT NOT NULL,
                        scope TEXT NOT NULL,
                        result TEXT NOT NULL,
                        reasonCode TEXT NOT NULL,
                        serverSequence INTEGER NOT NULL,
                        changeCount INTEGER NOT NULL,
                        occurredAt TEXT NOT NULL
                    )
                    """.trimIndent(),
                )
            }
        }
        fun create(
            context: Context,
            deviceKeyStore: DeviceKeyStore,
            encryptedFactory: SupportSQLiteOpenHelper.Factory? = null,
        ): EliteDatabase {
            requireNotNull(encryptedFactory) {
                "ELITE_ANDROID_DB_ENCRYPTION_REQUIRED: encrypted Room factory must be configured before local patient data is opened"
            }

            // The key provider is intentionally passed through the factory boundary.
            // The SQLCipher adapter will use a Keystore-wrapped database passphrase.
            check(deviceKeyStore != null) { "Device key store is required" }
            return Room.databaseBuilder(context, EliteDatabase::class.java, "elite-local.db")
                .openHelperFactory(encryptedFactory)
                .addMigrations(MIGRATION_1_2)
                .fallbackToDestructiveMigrationOnDowngrade(false)
                .build()
        }
    }
}
