package com.elite.clinic.sync

import kotlinx.coroutines.flow.Flow
import java.time.Instant

class SyncHealthRepository(
    private val dao: SyncDao,
    private val deviceId: String,
) {
    suspend fun markAttempt(now: Instant = Instant.now()) {
        val current = dao.getHealth(deviceId)
        dao.upsertHealth(
            SyncHealthEntity(
                deviceId = deviceId,
                state = "running",
                reasonCode = null,
                retryable = false,
                lastAttemptAt = now.toString(),
                lastSuccessAt = current?.lastSuccessAt,
                nextRetryAt = null,
                updatedAt = now.toString(),
            ),
        )
    }

    suspend fun markSuccess(now: Instant = Instant.now()) {
        dao.upsertHealth(
            SyncHealthEntity(
                deviceId = deviceId,
                state = "ready",
                reasonCode = null,
                retryable = false,
                lastAttemptAt = now.toString(),
                lastSuccessAt = now.toString(),
                nextRetryAt = null,
                updatedAt = now.toString(),
            ),
        )
    }

    suspend fun markFailure(
        failure: SyncFailureException,
        now: Instant = Instant.now(),
    ) {
        val nextRetryAt = if (failure.retryable) {
            now.plusSeconds(RETRY_DELAY_SECONDS).toString()
        } else {
            null
        }
        val current = dao.getHealth(deviceId)
        dao.upsertHealth(
            SyncHealthEntity(
                deviceId = deviceId,
                state = if (failure.retryable) "retry-scheduled" else "blocked",
                reasonCode = failure.reasonCode,
                retryable = failure.retryable,
                lastAttemptAt = current?.lastAttemptAt ?: now.toString(),
                lastSuccessAt = current?.lastSuccessAt,
                nextRetryAt = nextRetryAt,
                updatedAt = now.toString(),
            ),
        )
    }

    suspend fun get(): SyncHealthEntity? = dao.getHealth(deviceId)

    fun observe(): Flow<SyncHealthEntity?> = dao.observeHealth(deviceId)

    companion object {
        private const val RETRY_DELAY_SECONDS = 30L
    }
}
