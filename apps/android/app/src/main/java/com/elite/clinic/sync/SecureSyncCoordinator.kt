package com.elite.clinic.sync

import com.elite.clinic.data.EliteDatabase
import com.elite.clinic.data.LocalOutboxEvent
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

interface SecureSessionTransport {
    suspend fun openSession(): SecureSession
}

interface SecureSession {
    val sessionId: String
    val validUntil: Instant

    suspend fun requestDelta(request: JSONObject): JSONObject

    /** Returns the decrypted document response bytes for a scoped in-memory parser. */
    suspend fun requestDoctorDocumentBytes(documentId: String): ByteArray

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
    private val now: () -> Instant = { Instant.now() },
) {
    suspend fun runOnce(): SyncRunResult {
        require(batchSize in 1..MAX_BATCH_SIZE) {
            "ELITE_SYNC_BATCH_SIZE_INVALID: batch size is outside the safe bound"
        }
        val foundationDao = database.foundationDao()
        val recoveredAt = now()
        foundationDao.recoverExpiredSendingEvents(deviceId, recoveredAt.toString())
        val pending = foundationDao.pendingEvents(deviceId, batchSize)
        val profile = try {
            profileProvider()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            val failure = SyncFailureClassifier.from(
                error = error,
                securityFallback = SyncHealthReasonCodes.PROFILE_INVALID,
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
                retryableFallback = SyncHealthReasonCodes.TRANSPORT_UNAVAILABLE,
            )
            safeMarkFailure(failure)
            if (failure.retryable) return retryResult()
            throw failure
        }
        if (transport == null) {
            val failure = SyncFailureClassifier.retryable(
                SyncHealthReasonCodes.TRANSPORT_NOT_PROVISIONED,
            )
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
                retryableFallback = SyncHealthReasonCodes.SESSION_OPEN_UNAVAILABLE,
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
                        requestedAt = now().toString(),
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
                            retryableFallback = SyncHealthReasonCodes.DELTA_TRANSIENT_FAILURE,
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
                    val claimToken = UUID.randomUUID().toString()
                    val claimedAt = now()
                    val claimExpiresAt = OutboxClaimLease.expiresAt(claimedAt)
                    val claimed = foundationDao.claimPendingEvent(
                        id = event.id,
                        deviceId = deviceId,
                        claimToken = claimToken,
                        claimedAt = claimedAt.toString(),
                        claimExpiresAt = claimExpiresAt.toString(),
                    )
                    if (claimed != 1) continue
                    submitted += 1

                    val result = try {
                        session.submitOutbox(event)
                    } catch (error: CancellationException) {
                        foundationDao.releaseClaimedEvent(
                            id = event.id,
                            deviceId = deviceId,
                            claimToken = claimToken,
                            failureCode = "SYNC_CANCELLED",
                            failureAt = now().toString(),
                        )
                        throw error
                    } catch (error: Throwable) {
                        val failure = SyncFailureClassifier.from(
                            error = error,
                            securityFallback = "SECURE_OUTBOX_SECURITY_FAILURE",
                            retryableFallback = SyncHealthReasonCodes.OUTBOX_TRANSIENT_FAILURE,
                        )
                        val released = foundationDao.releaseClaimedEvent(
                            id = event.id,
                            deviceId = deviceId,
                            claimToken = claimToken,
                            failureCode = failure.reasonCode,
                            failureAt = now().toString(),
                        )
                        if (released != 1) {
                            retryFailure = SyncFailureClassifier.retryable(
                                SyncHealthReasonCodes.OUTBOX_CLAIM_LOST,
                            )
                            retry = true
                            break
                        }
                        if (!failure.retryable) {
                            safeMarkFailure(failure)
                            throw failure
                        }
                        retryFailure = failure
                        retry = true
                        break
                    }

                    val finalState = when (result) {
                        SecureOperationResult.Accepted,
                        SecureOperationResult.AlreadyApplied,
                        -> "acknowledged"
                        is SecureOperationResult.Conflict -> "conflict"
                        is SecureOperationResult.Rejected -> "rejected"
                        is SecureOperationResult.RetryableFailure -> "pending"
                    }
                    if (result is SecureOperationResult.RetryableFailure) {
                        val released = foundationDao.releaseClaimedEvent(
                            id = event.id,
                            deviceId = deviceId,
                            claimToken = claimToken,
                            failureCode = result.reasonCode,
                            failureAt = now().toString(),
                        )
                        if (released != 1) {
                            retryFailure = SyncFailureClassifier.retryable(
                                SyncHealthReasonCodes.OUTBOX_CLAIM_LOST,
                            )
                        } else {
                            retryFailure = SyncFailureClassifier.retryable(result.reasonCode)
                        }
                        retry = true
                        break
                    }

                    val reasonCode = when (result) {
                        is SecureOperationResult.Conflict -> result.reasonCode
                        is SecureOperationResult.Rejected -> result.reasonCode
                        else -> null
                    }
                    val finalized = foundationDao.finalizeClaimedEvent(
                        id = event.id,
                        deviceId = deviceId,
                        claimToken = claimToken,
                        finalState = finalState,
                        failureCode = reasonCode,
                        failureAt = if (reasonCode == null) null else now().toString(),
                    )
                    if (finalized != 1) {
                        retryFailure = SyncFailureClassifier.retryable(
                            SyncHealthReasonCodes.OUTBOX_CLAIM_LOST,
                        )
                        retry = true
                        break
                    }
                    when (result) {
                        SecureOperationResult.Accepted,
                        SecureOperationResult.AlreadyApplied,
                        -> acknowledged += 1
                        is SecureOperationResult.Conflict -> conflicts += 1
                        is SecureOperationResult.Rejected -> rejected += 1
                        is SecureOperationResult.RetryableFailure -> Unit
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
                retryFailure ?: SyncFailureClassifier.retryable(SyncHealthReasonCodes.TRANSIENT_FAILURE),
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

    private suspend fun retryResult(): SyncRunResult =
        SyncRunResult(0, 0, 0, 0, retry = true)

    private suspend fun safeMarkAttempt() {
        try {
            healthRepository?.markAttempt(now())
        } catch (_: Throwable) {
            // Health telemetry must not block local-first synchronization.
        }
    }

    private suspend fun safeMarkSuccess() {
        try {
            healthRepository?.markSuccess(now())
        } catch (_: Throwable) {
            // Health telemetry must not replace a successful sync result.
        }
    }

    private suspend fun safeMarkFailure(failure: SyncFailureException) {
        try {
            healthRepository?.markFailure(failure, now())
        } catch (_: Throwable) {
            // Health telemetry must not replace the original sync failure.
        }
    }

    companion object {
        const val DEFAULT_BATCH_SIZE = 50
        const val MAX_BATCH_SIZE = 200
    }
}
