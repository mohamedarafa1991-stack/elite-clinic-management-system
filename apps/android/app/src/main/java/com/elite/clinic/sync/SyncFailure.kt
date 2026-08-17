package com.elite.clinic.sync

import kotlinx.coroutines.CancellationException
import java.io.IOException
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLPeerUnverifiedException

class SyncFailureException(
    val reasonCode: String,
    val retryable: Boolean,
    cause: Throwable? = null,
) : Exception(reasonCode, cause)

object SyncFailureClassifier {
    fun security(reasonCode: String, cause: Throwable? = null): SyncFailureException =
        SyncFailureException(normalizeReasonCode(reasonCode, "SYNC_SECURITY_FAILURE"), false, cause)

    fun retryable(reasonCode: String, cause: Throwable? = null): SyncFailureException =
        SyncFailureException(normalizeReasonCode(reasonCode, "SYNC_TRANSIENT_FAILURE"), true, cause)

    fun from(
        error: Throwable,
        securityFallback: String,
        retryableFallback: String = "SYNC_TRANSIENT_FAILURE",
    ): SyncFailureException {
        if (error is SyncFailureException) return error
        if (error is CancellationException) throw error
        if (error is SSLHandshakeException || error is SSLPeerUnverifiedException) {
            return security("SYNC_TLS_CERTIFICATE_FAILURE", error)
        }
        if (error is IOException) return retryable(retryableFallback, error)
        if (error is SecurityException) {
            return security(reasonFromMessage(error.message, securityFallback), error)
        }
        if (error is IllegalArgumentException) return security(securityFallback, error)
        return security(securityFallback, error)
    }

    private fun normalizeReasonCode(value: String, fallback: String): String {
        val normalized = value.trim().uppercase()
        return if (normalized.matches(REASON_CODE)) normalized else fallback
    }

    private fun reasonFromMessage(message: String?, fallback: String): String {
        val candidate = message.orEmpty().substringBefore(':').trim()
        return if (candidate.matches(REASON_CODE)) candidate else fallback
    }

    private val REASON_CODE = Regex("[A-Z][A-Z0-9_]{2,127}")
}

suspend fun <T> withSyncFailureClassification(
    securityFallback: String,
    retryableFallback: String = "SYNC_TRANSIENT_FAILURE",
    block: suspend () -> T,
): T = try {
    block()
} catch (error: CancellationException) {
    throw error
} catch (error: SyncFailureException) {
    throw error
} catch (error: Throwable) {
    throw SyncFailureClassifier.from(error, securityFallback, retryableFallback)
}
