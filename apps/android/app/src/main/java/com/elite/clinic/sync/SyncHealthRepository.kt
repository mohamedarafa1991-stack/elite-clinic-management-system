package com.elite.clinic.sync

import java.time.Instant
import kotlinx.coroutines.flow.Flow

class SyncHealthRepository(
    private val dao: SyncDao,
    private val deviceId: String,
) {
    suspend fun markAttempt(now: Instant = Instant.now()) {
        val current = dao.getHealth(deviceId)
        dao.upsertHealth(
            SyncHealthEntity(
                deviceId = deviceId,
                state = SyncHealthState.RUNNING.storedValue,
                reasonCode = null,
                retryable = false,
                lastAttemptAt = now.toString(),
                lastSuccessAt = current?.lastSuccessAt,
                nextRetryAt = null,
                updatedAt = now.toString(),
                attemptCount = (current?.attemptCount ?: 0) + 1,
                lastFailureAt = current?.lastFailureAt,
                terminalAt = null,
                lastCompletedAt = current?.lastCompletedAt,
            ),
        )
    }

    suspend fun markSuccess(now: Instant = Instant.now()) {
        val current = dao.getHealth(deviceId)
        dao.upsertHealth(
            SyncHealthEntity(
                deviceId = deviceId,
                state = SyncHealthState.READY.storedValue,
                reasonCode = null,
                retryable = false,
                lastAttemptAt = current?.lastAttemptAt ?: now.toString(),
                lastSuccessAt = now.toString(),
                nextRetryAt = null,
                updatedAt = now.toString(),
                attemptCount = current?.attemptCount ?: 0,
                lastFailureAt = current?.lastFailureAt,
                terminalAt = null,
                lastCompletedAt = now.toString(),
            ),
        )
    }

    suspend fun markFailure(
        failure: SyncFailureException,
        now: Instant = Instant.now(),
    ) {
        val current = dao.getHealth(deviceId)
        val nextRetryAt = if (failure.retryable) {
            now.plusSeconds(RETRY_DELAY_SECONDS).toString()
        } else {
            null
        }
        dao.upsertHealth(
            SyncHealthEntity(
                deviceId = deviceId,
                state = if (failure.retryable) {
                    SyncHealthState.RETRY_SCHEDULED.storedValue
                } else {
                    SyncHealthState.BLOCKED.storedValue
                },
                reasonCode = failure.reasonCode,
                retryable = failure.retryable,
                lastAttemptAt = current?.lastAttemptAt ?: now.toString(),
                lastSuccessAt = current?.lastSuccessAt,
                nextRetryAt = nextRetryAt,
                updatedAt = now.toString(),
                attemptCount = current?.attemptCount ?: 0,
                lastFailureAt = now.toString(),
                terminalAt = if (failure.retryable) null else now.toString(),
                lastCompletedAt = current?.lastCompletedAt,
            ),
        )
    }

    suspend fun get(): SyncHealthEntity? = dao.getHealth(deviceId)

    fun observe(): Flow<SyncHealthEntity?> = dao.observeHealth(deviceId)

    companion object {
        private const val RETRY_DELAY_SECONDS = 30L
    }
}
