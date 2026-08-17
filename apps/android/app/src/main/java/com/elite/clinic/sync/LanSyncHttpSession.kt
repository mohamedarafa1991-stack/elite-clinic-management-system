package com.elite.clinic.sync

import android.util.Base64
import com.elite.clinic.data.LocalOutboxEvent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

class LanSyncHttpSession(
    private val baseUrl: String,
    private val frameCodec: SessionFrameCodec,
    override val sessionId: String,
    override val validUntil: Instant,
    private val outboxRequestFactory: (LocalOutboxEvent) -> JSONObject,
    private val connectTimeoutMillis: Int = 10_000,
    private val readTimeoutMillis: Int = 20_000,
) : SecureSession {
    override suspend fun submitOutbox(event: LocalOutboxEvent): SecureOperationResult =
        withContext(Dispatchers.IO) {
            val response = postEncrypted(
                messageType = "outbox-request",
                request = outboxRequestFactory(event),
            )
            val operationId = response.optString("operationId", event.id)
            when (response.optString("state")) {
                "accepted" -> SecureOperationResult.Accepted
                "already-applied" -> SecureOperationResult.AlreadyApplied
                "conflict" -> SecureOperationResult.Conflict(
                    response.optString("reasonCode", "SYNC_CONFLICT"),
                )
                "rejected" -> SecureOperationResult.Rejected(
                    response.optString("reasonCode", "SYNC_REJECTED"),
                )
                else -> SecureOperationResult.RetryableFailure(
                    "SYNC_ACKNOWLEDGMENT_UNRECOGNIZED",
                )
            }.let { result ->
                // The operation ID is carried in the encrypted response and is
                // intentionally not logged or copied into an external store.
                result.withOperationId(operationId)
            }
        }

    suspend fun requestDelta(request: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val envelope = postEncrypted("sync-request", request)
        envelope.optJSONObject("response") ?: envelope
    }

    override suspend fun close() {
        // HTTP is request-scoped. Session keys are discarded by the owner after close.
    }

    private fun postEncrypted(messageType: String, request: JSONObject): JSONObject {
        val frame = frameCodec.encrypt(
            messageType = messageType,
            plaintext = JSONObject().put("request", request).toString().toByteArray(),
        )
        val connection = (URL("$baseUrl/sync/lan").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = connectTimeoutMillis
            readTimeout = readTimeoutMillis
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }
        try {
            connection.outputStream.use { output ->
                output.write(frame.toString().toByteArray())
            }
            val status = connection.responseCode
            if (status == HttpURLConnection.HTTP_UNAUTHORIZED ||
                status == HttpURLConnection.HTTP_FORBIDDEN
            ) {
                throw SecurityException("SECURE_SESSION_REJECTED")
            }
            if (status == HttpURLConnection.HTTP_REQUEST_TIMEOUT ||
                status == 429 ||
                status >= 500
            ) {
                throw IOException("SECURE_LAN_TRANSIENT_HTTP_$status")
            }
            if (status !in 200..299) {
                throw IllegalStateException("SECURE_LAN_HTTP_REJECTED_$status")
            }
            val responseFrame = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            val plaintext = frameCodec.decrypt(responseFrame)
            return JSONObject(String(plaintext))
        } finally {
            connection.disconnect()
        }
    }

    private fun SecureOperationResult.withOperationId(operationId: String): SecureOperationResult = when (this) {
        SecureOperationResult.Accepted -> SecureOperationResult.Accepted
        SecureOperationResult.AlreadyApplied -> SecureOperationResult.AlreadyApplied
        is SecureOperationResult.Conflict -> this
        is SecureOperationResult.Rejected -> this
        is SecureOperationResult.RetryableFailure -> this
    }
}
