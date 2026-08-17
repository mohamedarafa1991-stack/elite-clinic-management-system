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
    private val batchSize: Int = DEFAULT_BATCH_SIZE,
) {
    suspend fun runOnce(): SyncRunResult {
        require(batchSize in 1..MAX_BATCH_SIZE) {
            "ELITE_SYNC_BATCH_SIZE_INVALID: batch size is outside the safe bound"
        }
        val foundationDao = database.foundationDao()
        val pending = foundationDao.pendingEvents(batchSize)
        val profile = profileProvider()
        if (pending.isEmpty() && profile == null) {
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
        } catch (_: CancellationException) {
            throw CancellationException()
        } catch (_: Exception) {
            return SyncRunResult(0, 0, 0, 0, retry = true)
        }

        var submitted = 0
        var acknowledged = 0
        var conflicts = 0
        var rejected = 0
        var pulledScopes = 0
        var retry = false
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
                    } catch (_: CancellationException) {
                        throw CancellationException()
                    } catch (_: SecurityException) {
                        throw SecurityException("SECURE_DELTA_VERIFICATION_FAILED")
                    } catch (_: Exception) {
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
                    } catch (_: CancellationException) {
                        foundationDao.transitionEventState(
                            id = event.id,
                            expectedState = "sending",
                            state = "pending",
                        )
                        throw CancellationException()
                    } catch (_: SecurityException) {
                        foundationDao.transitionEventState(
                            id = event.id,
                            expectedState = "sending",
                            state = "pending",
                        )
                        throw SecurityException("SECURE_SESSION_REJECTED")
                    } catch (_: Exception) {
                        foundationDao.transitionEventState(
                            id = event.id,
                            expectedState = "sending",
                            state = "pending",
                        )
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
                            retry = true
                            break
                        }
                    }
                }
            }
        } finally {
            session.close()
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

    companion object {
        const val DEFAULT_BATCH_SIZE = 50
        const val MAX_BATCH_SIZE = 200
    }
}
