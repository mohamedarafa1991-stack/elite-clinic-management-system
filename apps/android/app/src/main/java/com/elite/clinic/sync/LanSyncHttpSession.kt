package com.elite.clinic.sync

import java.util.Base64
import com.elite.clinic.data.LocalOutboxEvent
import com.elite.clinic.security.withZeroizedBytes
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

class LanSyncHttpSession(
    private val baseUrl: String,
    private val hubTlsCertificatePem: String,
    private val frameCodec: SessionFrameCodec,
    override val sessionId: String,
    override val validUntil: Instant,
    private val outboxRequestFactory: (LocalOutboxEvent) -> JSONObject,
    private val connectTimeoutMillis: Int = 10_000,
    private val readTimeoutMillis: Int = 20_000,
) : SecureSession {
    private val closed = AtomicBoolean(false)

    override suspend fun submitOutbox(event: LocalOutboxEvent): SecureOperationResult =
        withSyncFailureClassification(
            securityFallback = "SECURE_SESSION_SECURITY_FAILURE",
            retryableFallback = "SECURE_LAN_TRANSIENT_FAILURE",
        ) {
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
        }

    override suspend fun requestDelta(request: JSONObject): JSONObject =
        withSyncFailureClassification(
            securityFallback = "SECURE_SESSION_SECURITY_FAILURE",
            retryableFallback = "SECURE_LAN_TRANSIENT_FAILURE",
        ) {
            withContext(Dispatchers.IO) {
                val envelope = postEncrypted("sync-request", request)
                envelope.optJSONObject("response") ?: envelope
            }
        }

    override suspend fun requestDoctorDocumentBytes(documentId: String): ByteArray =
        withSyncFailureClassification(
            securityFallback = "SECURE_SESSION_SECURITY_FAILURE",
            retryableFallback = "SECURE_LAN_TRANSIENT_FAILURE",
        ) {
            withContext(Dispatchers.IO) {
                postEncryptedPayload(
                    "document-request",
                    JSONObject().put("documentId", documentId),
                )
            }
        }

    suspend fun uploadDoctorDocument(request: JSONObject): JSONObject =
        withSyncFailureClassification(
            securityFallback = "SECURE_SESSION_SECURITY_FAILURE",
            retryableFallback = "SECURE_LAN_TRANSIENT_FAILURE",
        ) {
            withContext(Dispatchers.IO) {
                val envelope = postEncrypted("document-upload-request", request)
                envelope.optJSONObject("response") ?: envelope
            }
        }

    override suspend fun close() {
        closed.set(true)
        frameCodec.close()
    }

    private fun ensureUsable() {
        if (closed.get()) throw SecurityException("SECURE_SESSION_CLOSED")
        if (!validUntil.isAfter(Instant.now())) {
            closed.set(true)
            frameCodec.close()
            throw SecurityException("SECURE_SESSION_EXPIRED")
        }
    }

    private fun postEncrypted(messageType: String, request: JSONObject): JSONObject =
        withZeroizedBytes(postEncryptedPayload(messageType, request)) { bytes ->
            JSONObject(String(bytes, StandardCharsets.UTF_8))
        }

    private fun postEncryptedPayload(messageType: String, request: JSONObject): ByteArray {
        ensureUsable()
        val requestPlaintext = JSONObject()
            .put("request", request)
            .toString()
            .toByteArray(StandardCharsets.UTF_8)
        val frame = try {
            frameCodec.encrypt(
                messageType = messageType,
                plaintext = requestPlaintext,
            )
        } finally {
            requestPlaintext.fill(0)
        }
        val endpoint = URL("$baseUrl/sync/lan")
        LanTlsConnection.requireHttps(endpoint)
        val connection = (endpoint.openConnection() as javax.net.ssl.HttpsURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = connectTimeoutMillis
            readTimeout = readTimeoutMillis
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }
        try {
            LanTlsConnection.configure(
                connection = connection,
                certificatePem = hubTlsCertificatePem,
                expectedHost = endpoint.host,
            )
            connection.instanceFollowRedirects = false
            val frameBytes = frame.toString().toByteArray(StandardCharsets.UTF_8)
            try {
                connection.outputStream.use { output ->
                    output.write(frameBytes)
                }
            } finally {
                frameBytes.fill(0)
            }
            val status = connection.responseCode
            if (status in 300..399) {
                throw SecurityException("SECURE_LAN_REDIRECT_REJECTED")
            }
            if (status == HttpURLConnection.HTTP_UNAUTHORIZED ||
                status == HttpURLConnection.HTTP_FORBIDDEN
            ) {
                throw SecurityException("SECURE_SESSION_REJECTED")
            }
            if (status == HttpURLConnection.HTTP_CLIENT_TIMEOUT ||
                status == 429 ||
                status >= 500
            ) {
                throw IOException("SECURE_LAN_TRANSIENT_HTTP_$status")
            }
            if (status !in 200..299) {
                throw IllegalStateException("SECURE_LAN_HTTP_REJECTED_$status")
            }
            val responseFrameBytes = connection.inputStream.use { input ->
                input.readBytes()
            }
            try {
                val responseFrame = withZeroizedBytes(responseFrameBytes) { bytes ->
                    JSONObject(String(bytes, StandardCharsets.UTF_8))
                }
                return frameCodec.decrypt(responseFrame)
            } finally {
                responseFrameBytes.fill(0)
            }
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
