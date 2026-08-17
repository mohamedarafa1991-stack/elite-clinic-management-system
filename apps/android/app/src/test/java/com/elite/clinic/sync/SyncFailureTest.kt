package com.elite.clinic.sync

import java.io.IOException
import javax.net.ssl.SSLHandshakeException
import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncFailureTest {
    @Test
    fun classifiesIoAsRetryable() {
        val failure = SyncFailureClassifier.from(
            IOException("connection refused"),
            securityFallback = "SYNC_SECURITY_FAILURE",
            retryableFallback = "SYNC_NETWORK_UNAVAILABLE",
        )
        assertTrue(failure.retryable)
        assertEquals("SYNC_NETWORK_UNAVAILABLE", failure.reasonCode)
    }

    @Test
    fun classifiesSecurityAsTerminalAndPreservesSafeReasonCode() {
        val failure = SyncFailureClassifier.from(
            SecurityException("ELITE_LAN_TLS_CERTIFICATE_INVALID: hidden detail"),
            securityFallback = "SYNC_SECURITY_FAILURE",
        )
        assertFalse(failure.retryable)
        assertEquals("ELITE_LAN_TLS_CERTIFICATE_INVALID", failure.reasonCode)
    }

    @Test
    fun classifiesTlsHandshakeAsTerminal() {
        val failure = SyncFailureClassifier.from(
            SSLHandshakeException("certificate pin mismatch"),
            securityFallback = "SYNC_SECURITY_FAILURE",
            retryableFallback = "SYNC_NETWORK_UNAVAILABLE",
        )
        assertFalse(failure.retryable)
        assertEquals("SYNC_TLS_CERTIFICATE_FAILURE", failure.reasonCode)
    }

    @Test
    fun replacesUntrustedReasonWithFallback() {
        val failure = SyncFailureClassifier.from(
            IllegalArgumentException("certificate path=C:\\private\\hub-key.pem"),
            securityFallback = "SYNC_PROFILE_INVALID",
        )
        assertFalse(failure.retryable)
        assertEquals("SYNC_PROFILE_INVALID", failure.reasonCode)
    }

    @Test
    fun preservesCancellation() {
        try {
            SyncFailureClassifier.from(
                CancellationException("cancelled"),
                securityFallback = "SYNC_SECURITY_FAILURE",
            )
            throw AssertionError("expected cancellation")
        } catch (_: CancellationException) {
            // Expected: cancellation must not become a retry or terminal sync failure.
        }
    }
}
