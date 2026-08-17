package com.elite.clinic.sync

import org.json.JSONObject
import com.elite.clinic.data.EliteDatabase
import com.elite.clinic.data.LocalOutboxEvent
import java.time.Instant

interface SecureSessionTransport {
    suspend fun openSession(): SecureSession
}

interface SecureSession {
    val sessionId: String
    val validUntil: Instant

    suspend fun requestDelta(request: JSONObject): JSONObject

    suspend fun submitOutbox(event: LocalOutboxEvent): SecureOperationResult

    suspend fun close()
}

sealed interface SecureOperationResult {
    data object Accepted : SecureOperationResult
    data object AlreadyApplied : SecureOperationResult
    data class Conflict(val reasonCode: String) : SecureOperationResult
    data class Rejected(val reasonCode: String) : SecureOperationResult
    data class RetryableFailure(val reasonCode: String) : SecureOperationResult
}

data class SyncRunResult(
    val submitted: Int,
    val acknowledged: Int,
    val conflicts: Int,
    val rejected: Int,
    val retry: Boolean,
)

class SecureSyncCoordinator(
    private val database: EliteDatabase,
    private val deviceId: String,
    private val transportFactory: suspend () -> SecureSessionTransport?,
    private val batchSize: Int = DEFAULT_BATCH_SIZE,
) {
    suspend fun runOnce(): SyncRunResult {
        require(batchSize in 1..MAX_BATCH_SIZE) {
            "ELITE_SYNC_BATCH_SIZE_INVALID: batch size is outside the safe bound"
        }
        val foundationDao = database.foundationDao()
        val pending = foundationDao.pendingEvents(batchSize)
        if (pending.isEmpty()) {
            return SyncRunResult(0, 0, 0, 0, retry = false)
        }
        val transport = transportFactory() ?: return SyncRunResult(
            submitted = 0,
            acknowledged = 0,
            conflicts = 0,
            rejected = 0,
            retry = true,
        )
        val session = try {
            transport.openSession()
        } catch (_: Exception) {
            return SyncRunResult(0, 0, 0, 0, retry = true)
        }

        var submitted = 0
        var acknowledged = 0
        var conflicts = 0
        var rejected = 0
        var retry = false
        try {
            for (event in pending) {
                if (event.deviceId != deviceId) {
                    continue
                }
                val claimed = foundationDao.transitionEventState(
                    id = event.id,
                    expectedState = "pending",
                    state = "sending",
                )
                if (claimed != 1) continue
                submitted += 1
                when (val result = session.submitOutbox(event)) {
                    SecureOperationResult.Accepted,
                    SecureOperationResult.AlreadyApplied,
                    -> {
                        foundationDao.transitionEventState(
                            id = event.id,
                            expectedState = "sending",
                            state = "acknowledged",
                        )
                        acknowledged += 1
                    }
                    is SecureOperationResult.Conflict -> {
                        foundationDao.transitionEventState(
                            id = event.id,
                            expectedState = "sending",
                            state = "conflict",
                        )
                        conflicts += 1
                    }
                    is SecureOperationResult.Rejected -> {
                        foundationDao.transitionEventState(
                            id = event.id,
                            expectedState = "sending",
                            state = "rejected",
                        )
                        rejected += 1
                    }
                    is SecureOperationResult.RetryableFailure -> {
                        foundationDao.transitionEventState(
                            id = event.id,
                            expectedState = "sending",
                            state = "pending",
                        )
                        retry = true
                        break
                    }
                }
            }
        } finally {
            session.close()
        }
        return SyncRunResult(submitted, acknowledged, conflicts, rejected, retry)
    }

    companion object {
        const val DEFAULT_BATCH_SIZE = 50
        const val MAX_BATCH_SIZE = 200
    }
}
