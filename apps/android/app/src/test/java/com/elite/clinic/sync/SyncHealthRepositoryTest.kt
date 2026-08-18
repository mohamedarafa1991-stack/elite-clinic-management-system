package com.elite.clinic.sync

import java.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncHealthRepositoryTest {
    @Test
    fun attemptIncrementsAndSuccessRecordsCompletion() = kotlinx.coroutines.runBlocking {
        val dao = RecordingSyncDao(
            SyncHealthEntity(
                deviceId = "device-a",
                state = SyncHealthState.READY.storedValue,
                reasonCode = null,
                retryable = false,
                lastAttemptAt = "2026-01-01T00:00:00Z",
                lastSuccessAt = "2026-01-01T00:00:01Z",
                nextRetryAt = null,
                updatedAt = "2026-01-01T00:00:01Z",
                attemptCount = 2,
            ),
        )
        val repository = SyncHealthRepository(dao, "device-a")
        val attemptAt = Instant.parse("2026-01-01T00:01:00Z")
        repository.markAttempt(attemptAt)
        assertEquals(SyncHealthState.RUNNING.storedValue, dao.health?.state)
        assertEquals(3, dao.health?.attemptCount)

        val successAt = Instant.parse("2026-01-01T00:01:01Z")
        repository.markSuccess(successAt)
        assertEquals(SyncHealthState.READY.storedValue, dao.health?.state)
        assertEquals(successAt.toString(), dao.health?.lastSuccessAt)
        assertEquals(successAt.toString(), dao.health?.lastCompletedAt)
        assertNull(dao.health?.reasonCode)
    }

    @Test
    fun retryableFailureSchedulesRetryWithoutTerminalTimestamp() = kotlinx.coroutines.runBlocking {
        val dao = RecordingSyncDao()
        val repository = SyncHealthRepository(dao, "device-a")
        val failureAt = Instant.parse("2026-01-01T00:00:00Z")
        repository.markFailure(
            SyncFailureClassifier.retryable("SYNC_NETWORK_UNAVAILABLE"),
            failureAt,
        )
        assertEquals(SyncHealthState.RETRY_SCHEDULED.storedValue, dao.health?.state)
        assertTrue(dao.health?.retryable == true)
        assertEquals("2026-01-01T00:00:30Z", dao.health?.nextRetryAt)
        assertNull(dao.health?.terminalAt)
    }

    @Test
    fun terminalFailureBlocksAndRecordsFailureTime() = kotlinx.coroutines.runBlocking {
        val dao = RecordingSyncDao()
        val repository = SyncHealthRepository(dao, "device-a")
        val failureAt = Instant.parse("2026-01-01T00:00:00Z")
        repository.markFailure(
            SyncFailureClassifier.security("SYNC_TLS_CERTIFICATE_FAILURE"),
            failureAt,
        )
        assertEquals(SyncHealthState.BLOCKED.storedValue, dao.health?.state)
        assertFalse(dao.health?.retryable == true)
        assertEquals("SYNC_TLS_CERTIFICATE_FAILURE", dao.health?.reasonCode)
        assertEquals(failureAt.toString(), dao.health?.terminalAt)
        assertNotNull(dao.health?.lastFailureAt)
        assertNull(dao.health?.nextRetryAt)
    }

    private class RecordingSyncDao(
        initialHealth: SyncHealthEntity? = null,
    ) : SyncDao {
        var health: SyncHealthEntity? = initialHealth

        override suspend fun upsertCursor(cursor: SyncCursorEntity) = Unit
        override suspend fun upsertResourceMetadata(metadata: SyncResourceMetadataEntity) = Unit
        override suspend fun insertImportEvent(event: SyncImportEventEntity) = Unit
        override suspend fun upsertConnectionProfile(profile: SyncConnectionProfileEntity) = Unit
        override suspend fun upsertHealth(health: SyncHealthEntity) {
            this.health = health
        }
        override suspend fun getHealth(deviceId: String): SyncHealthEntity? = health
        override fun observeHealth(deviceId: String): Flow<SyncHealthEntity?> = flowOf(health)
        override suspend fun getConnectionProfile(deviceId: String): SyncConnectionProfileEntity? = null
        override suspend fun updateConnectionProfileState(
            deviceId: String,
            state: String,
            updatedAt: String,
        ): Int = 0
        override suspend fun getCursor(deviceId: String, scope: String): SyncCursorEntity? = null
        override fun observeCursors(deviceId: String): Flow<List<SyncCursorEntity>> = flowOf(emptyList())
        override fun observeResources(
            deviceId: String,
            scope: String,
        ): Flow<List<SyncResourceMetadataEntity>> = flowOf(emptyList())
        override suspend fun deleteScope(deviceId: String, scope: String) = Unit
    }
}
