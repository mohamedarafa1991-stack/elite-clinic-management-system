package com.elite.clinic.data

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
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
import com.elite.clinic.sync.BillingSummaryEntity
import com.elite.clinic.sync.SyncConnectionProfileEntity
import com.elite.clinic.sync.SyncCursorEntity
import com.elite.clinic.sync.SyncDao
import com.elite.clinic.sync.SyncHealthEntity
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

@Entity(
    tableName = "local_outbox",
    indices = [Index(value = ["deviceId", "state", "occurredAt", "id"])],
)
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
    @ColumnInfo(defaultValue = "0") val attemptCount: Int = 0,
    val claimToken: String? = null,
    val claimedAt: String? = null,
    val claimExpiresAt: String? = null,
    val lastFailureCode: String? = null,
    val lastFailureAt: String? = null,
)

@Dao
interface LocalFoundationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPatient(patient: LocalPatient)

    @Query("SELECT * FROM local_patients WHERE status = 'active' ORDER BY nameEn LIMIT :limit")
    suspend fun activePatients(limit: Int): List<LocalPatient>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun enqueue(event: LocalOutboxEvent)

    @Query("SELECT * FROM local_outbox WHERE deviceId = :deviceId AND state = 'pending' ORDER BY occurredAt, id LIMIT :limit")
    suspend fun pendingEvents(deviceId: String, limit: Int): List<LocalOutboxEvent>

    @Query(
        """
        UPDATE local_outbox
        SET state = 'pending', claimToken = NULL, claimedAt = NULL, claimExpiresAt = NULL,
            lastFailureCode = 'SYNC_CLAIM_EXPIRED', lastFailureAt = :recoveredAt
        WHERE deviceId = :deviceId AND state = 'sending' AND claimExpiresAt IS NOT NULL
          AND claimExpiresAt <= :recoveredAt
        """,
    )
    suspend fun recoverExpiredSendingEvents(deviceId: String, recoveredAt: String): Int

    @Query(
        """
        UPDATE local_outbox
        SET state = 'sending', attemptCount = attemptCount + 1,
            claimToken = :claimToken, claimedAt = :claimedAt, claimExpiresAt = :claimExpiresAt
        WHERE id = :id AND deviceId = :deviceId AND state = 'pending'
        """,
    )
    suspend fun claimPendingEvent(
        id: String,
        deviceId: String,
        claimToken: String,
        claimedAt: String,
        claimExpiresAt: String,
    ): Int

    @Query(
        """
        UPDATE local_outbox
        SET state = 'pending', claimToken = NULL, claimedAt = NULL, claimExpiresAt = NULL,
            lastFailureCode = :failureCode, lastFailureAt = :failureAt
        WHERE id = :id AND deviceId = :deviceId AND state = 'sending' AND claimToken = :claimToken
        """,
    )
    suspend fun releaseClaimedEvent(
        id: String,
        deviceId: String,
        claimToken: String,
        failureCode: String?,
        failureAt: String?,
    ): Int

    @Query(
        """
        UPDATE local_outbox
        SET state = :finalState, claimToken = NULL, claimedAt = NULL, claimExpiresAt = NULL,
            lastFailureCode = :failureCode, lastFailureAt = :failureAt
        WHERE id = :id AND deviceId = :deviceId AND state = 'sending' AND claimToken = :claimToken
        """,
    )
    suspend fun finalizeClaimedEvent(
        id: String,
        deviceId: String,
        claimToken: String,
        finalState: String,
        failureCode: String?,
        failureAt: String?,
    ): Int
}

@Database(
    entities = [
        LocalPatient::class,
        LocalOutboxEvent::class,
        SyncConnectionProfileEntity::class,
        SyncHealthEntity::class,
        SyncCursorEntity::class,
        SyncResourceMetadataEntity::class,
        BillingSummaryEntity::class,
        SyncImportEventEntity::class,
    ],
    version = 6,
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

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_connection_profiles (
                        deviceId TEXT NOT NULL PRIMARY KEY,
                        organizationId TEXT NOT NULL,
                        enrollmentId TEXT NOT NULL,
                        userId TEXT NOT NULL,
                        hubBaseUrl TEXT NOT NULL,
                        hubTlsCertificatePem TEXT NOT NULL,
                        hubTrustAnchorPem TEXT NOT NULL,
                        hubTrustAnchorId TEXT NOT NULL,
                        hubTrustAnchorVersion INTEGER NOT NULL,
                        policyVersion INTEGER NOT NULL,
                        allowedScopesJson TEXT NOT NULL,
                        state TEXT NOT NULL,
                        expiresAt TEXT NOT NULL,
                        offlineAccessUntil TEXT NOT NULL,
                        updatedAt TEXT NOT NULL
                    )
                    """.trimIndent(),
                )
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_health (
                        deviceId TEXT NOT NULL PRIMARY KEY,
                        state TEXT NOT NULL,
                        reasonCode TEXT,
                        retryable INTEGER NOT NULL,
                        lastAttemptAt TEXT,
                        lastSuccessAt TEXT,
                        nextRetryAt TEXT,
                        updatedAt TEXT NOT NULL
                    )
                    """.trimIndent(),
                )
            }
        }

        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE sync_health ADD COLUMN attemptCount INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE sync_health ADD COLUMN lastFailureAt TEXT")
                database.execSQL("ALTER TABLE sync_health ADD COLUMN terminalAt TEXT")
                database.execSQL("ALTER TABLE sync_health ADD COLUMN lastCompletedAt TEXT")
                database.execSQL("ALTER TABLE local_outbox ADD COLUMN attemptCount INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE local_outbox ADD COLUMN claimToken TEXT")
                database.execSQL("ALTER TABLE local_outbox ADD COLUMN claimedAt TEXT")
                database.execSQL("ALTER TABLE local_outbox ADD COLUMN claimExpiresAt TEXT")
                database.execSQL("ALTER TABLE local_outbox ADD COLUMN lastFailureCode TEXT")
                database.execSQL("ALTER TABLE local_outbox ADD COLUMN lastFailureAt TEXT")
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_local_outbox_deviceId_state_occurredAt_id ON local_outbox(deviceId, state, occurredAt, id)",
                )
            }
        }

        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_billing_summaries (
                        deviceId TEXT NOT NULL,
                        invoiceId TEXT NOT NULL,
                        invoiceNumber TEXT NOT NULL,
                        patientId TEXT NOT NULL,
                        currency TEXT NOT NULL,
                        status TEXT NOT NULL,
                        subtotalEgp INTEGER NOT NULL,
                        discountEgp INTEGER NOT NULL,
                        totalEgp INTEGER NOT NULL,
                        paidEgp INTEGER NOT NULL,
                        balanceEgp INTEGER NOT NULL,
                        createdAt TEXT NOT NULL,
                        updatedAt TEXT NOT NULL,
                        version INTEGER NOT NULL,
                        payloadHash TEXT NOT NULL,
                        PRIMARY KEY(deviceId, invoiceId)
                    )
                    """.trimIndent(),
                )
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_sync_billing_summaries_deviceId_updatedAt ON sync_billing_summaries(deviceId, updatedAt)",
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
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6)
                .fallbackToDestructiveMigrationOnDowngrade(false)
                .build()
        }
    }
}
