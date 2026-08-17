package com.elite.clinic.sync

import com.elite.clinic.data.EliteDatabase
import com.elite.clinic.data.LocalOutboxEvent
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
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
    val pulledScopes: Int = 0,
)

class SecureSyncCoordinator(
    private val database: EliteDatabase,
    private val deviceId: String,
    private val transportFactory: suspend () -> SecureSessionTransport?,
    private val profileProvider: suspend () -> ActiveSyncConnectionProfile? = { null },
    private val healthRepository: SyncHealthRepository? = null,
    private val batchSize: Int = DEFAULT_BATCH_SIZE,
) {
    suspend fun runOnce(): SyncRunResult {
        require(batchSize in 1..MAX_BATCH_SIZE) {
            "ELITE_SYNC_BATCH_SIZE_INVALID: batch size is outside the safe bound"
        }
        val foundationDao = database.foundationDao()
        val pending = foundationDao.pendingEvents(batchSize)
        val profile = try {
            profileProvider()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            val failure = SyncFailureClassifier.from(
                error = error,
                securityFallback = "SYNC_PROFILE_INVALID",
                retryableFallback = "SYNC_PROFILE_UNAVAILABLE",
            )
            safeMarkFailure(failure)
            if (failure.retryable) return retryResult()
            throw failure
        }
        if (pending.isEmpty() && profile == null) {
            return SyncRunResult(0, 0, 0, 0, retry = false)
        }
        safeMarkAttempt()

        val transport = try {
            transportFactory()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            val failure = SyncFailureClassifier.from(
                error = error,
                securityFallback = "SYNC_TRANSPORT_SECURITY_FAILURE",
                retryableFallback = "SYNC_TRANSPORT_UNAVAILABLE",
            )
            safeMarkFailure(failure)
            if (failure.retryable) return retryResult()
            throw failure
        }
        if (transport == null) {
            val failure = SyncFailureClassifier.retryable("SYNC_TRANSPORT_NOT_PROVISIONED")
            safeMarkFailure(failure)
            return retryResult()
        }

        val session = try {
            transport.openSession()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            val failure = SyncFailureClassifier.from(
                error = error,
                securityFallback = "SYNC_SESSION_OPEN_SECURITY_FAILURE",
                retryableFallback = "SYNC_SESSION_OPEN_UNAVAILABLE",
            )
            safeMarkFailure(failure)
            if (failure.retryable) return retryResult()
            throw failure
        }

        var submitted = 0
        var acknowledged = 0
        var conflicts = 0
        var rejected = 0
        var pulledScopes = 0
        var retry = false
        var retryFailure: SyncFailureException? = null
        try {
            if (profile != null) {
                val deltaSynchronizer = VerifiedDeltaSynchronizer(
                    database = database,
                    expectedOrganizationId = profile.policy.organizationId,
                    expectedDeviceId = deviceId,
                    trustedPublicKeyPem = profile.entity.hubTrustAnchorPem,
                )
                for (scope in profile.policy.allowedScopes.sorted()) {
                    val requestNonce = LanSyncRequestFactory.newRequestNonce()
                    val cursor = database.syncDao().getCursor(deviceId, scope)
                    val request = LanSyncRequestFactory.buildDeltaRequest(
                        policy = profile.policy,
                        scope = scope,
                        cursor = cursor?.cursor,
                        syncSessionId = LanSyncRequestFactory.newSyncSessionId(),
                        requestNonce = requestNonce,
                        requestedAt = Instant.now().toString(),
                        clientBaseVersion = cursor?.serverSequence ?: 0,
                        maxChanges = batchSize,
                    )
                    try {
                        deltaSynchronizer.requestAndApply(
                            session = session,
                            request = request,
                            expectedNonce = requestNonce,
                        )
                        pulledScopes += 1
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Throwable) {
                        val failure = SyncFailureClassifier.from(
                            error = error,
                            securityFallback = "SECURE_DELTA_VERIFICATION_FAILED",
                            retryableFallback = "SECURE_DELTA_TRANSIENT_FAILURE",
                        )
                        if (!failure.retryable) {
                            safeMarkFailure(failure)
                            throw failure
                        }
                        retryFailure = failure
                        retry = true
                        break
                    }
                }
            }

            if (!retry) {
                for (event in pending) {
                    if (event.deviceId != deviceId) continue
                    val claimed = foundationDao.transitionEventState(
                        id = event.id,
                        expectedState = "pending",
                        state = "sending",
                    )
                    if (claimed != 1) continue
                    submitted += 1
                    val result = try {
                        session.submitOutbox(event)
                    } catch (error: CancellationException) {
                        foundationDao.transitionEventState(
                            id = event.id,
                            expectedState = "sending",
                            state = "pending",
                        )
                        throw error
                    } catch (error: Throwable) {
                        foundationDao.transitionEventState(
                            id = event.id,
                            expectedState = "sending",
                            state = "pending",
                        )
                        val failure = SyncFailureClassifier.from(
                            error = error,
                            securityFallback = "SECURE_OUTBOX_SECURITY_FAILURE",
                            retryableFallback = "SECURE_OUTBOX_TRANSIENT_FAILURE",
                        )
                        if (!failure.retryable) {
                            safeMarkFailure(failure)
                            throw failure
                        }
                        retryFailure = failure
                        retry = true
                        break
                    }
                    when (result) {
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
                            retryFailure = SyncFailureClassifier.retryable(result.reasonCode)
                            retry = true
                            break
                        }
                    }
                }
            }
        } finally {
            try {
                session.close()
            } catch (_: Throwable) {
                // Cleanup must never replace the synchronization result.
            }
        }

        if (retry) {
            safeMarkFailure(
                retryFailure ?: SyncFailureClassifier.retryable("SYNC_TRANSIENT_FAILURE"),
            )
        } else {
            safeMarkSuccess()
        }
        return SyncRunResult(
            submitted = submitted,
            acknowledged = acknowledged,
            conflicts = conflicts,
            rejected = rejected,
            retry = retry,
            pulledScopes = pulledScopes,
        )
    }

    private suspend fun retryResult(): SyncRunResult {
        return SyncRunResult(0, 0, 0, 0, retry = true)
    }

    private suspend fun safeMarkAttempt() {
        try {
            healthRepository?.markAttempt()
        } catch (_: Throwable) {
            // Health telemetry must not block local-first synchronization.
        }
    }

    private suspend fun safeMarkSuccess() {
        try {
            healthRepository?.markSuccess()
        } catch (_: Throwable) {
            // Health telemetry must not replace a successful sync result.
        }
    }

    private suspend fun safeMarkFailure(failure: SyncFailureException) {
        try {
            healthRepository?.markFailure(failure)
        } catch (_: Throwable) {
            // Health telemetry must not replace the original sync failure.
        }
    }

    companion object {
        const val DEFAULT_BATCH_SIZE = 50
        const val MAX_BATCH_SIZE = 200
    }
}
