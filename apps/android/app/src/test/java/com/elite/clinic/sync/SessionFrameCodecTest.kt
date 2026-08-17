package com.elite.clinic.sync

import android.util.Base64
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionFrameCodecTest {
    private val sessionId = "session-frame-01"
    private val noncePrefix = hex("01020304")
    private val clientKey = ByteArray(32) { 0x11 }
    private val hubKey = ByteArray(32) { 0x22 }

    @Test
    fun encryptsAndDecryptsAesGcmFrameWithCounterNonce() {
        val client = clientCodec()
        val hub = hubCodec()
        val frame = client.encrypt(
            "sync-request",
            "{\"scope\":\"appointments\"}".toByteArray(),
        )
        assertEquals(
            Base64.encodeToString(hex("010203040000000000000000"), Base64.NO_WRAP),
            frame.getString("nonceBase64"),
        )
        assertEquals(
            "{\"scope\":\"appointments\"}",
            String(hub.decrypt(frame)),
        )
        assertEquals(1L, hub.nextReceiveCounter())
    }

    @Test
    fun rejectsReplayCounterGapNonceAndAuthenticationTampering() {
        val client = clientCodec()
        val hub = hubCodec()
        val first = client.encrypt("sync-request", "first-session-payload".toByteArray())
        expectFailure("ELITE_SESSION_COUNTER_GAP") {
            hub.decrypt(JSONObject(first.toString()).put("counter", 1L))
        }
        assertEquals("first-session-payload", String(hub.decrypt(first)))
        expectFailure("ELITE_SESSION_REPLAY_REJECTED") { hub.decrypt(first) }

        val second = client.encrypt("sync-request", "second-session-payload".toByteArray())
        expectFailure("ELITE_SESSION_NONCE_MISMATCH") {
            hub.decrypt(JSONObject(second.toString()).put("nonceBase64", "AAAAAAAAAAAAAAAA"))
        }
        expectFailure("ELITE_SESSION_AUTHENTICATION_FAILED") {
            hub.decrypt(
                JSONObject(second.toString()).put(
                    "ciphertextBase64",
                    Base64.encodeToString("tampered-ciphertext".toByteArray(), Base64.NO_WRAP),
                ),
            )
        }
    }

    @Test
    fun closesAndRejectsFurtherUse() {
        val client = clientCodec()
        client.close()
        try {
            client.encrypt("sync-request", "closed".toByteArray())
            throw AssertionError("expected ELITE_SESSION_CLOSED")
        } catch (error: SecurityException) {
            assertTrue(error.message?.contains("ELITE_SESSION_CLOSED") == true)
        }
    }

    @Test
    fun derivesAndVerifiesKeyConfirmationMac() {
        val keys = SessionKeyDerivation.deriveSessionKeys(ByteArray(32) { 3 }, ByteArray(32) { 7 })
        val mac = SessionKeyDerivation.keyConfirmationMac(
            keys.keyConfirmationKey,
            "session-frame-01",
            "a".repeat(64),
            "client",
        )
        assertTrue(
            SessionKeyDerivation.verifyKeyConfirmation(
                mac,
                SessionKeyDerivation.keyConfirmationMac(
                    keys.keyConfirmationKey,
                    "session-frame-01",
                    "a".repeat(64),
                    "client",
                ),
            ),
        )
    }

    private fun clientCodec() = SessionFrameCodec(
        sessionId = sessionId,
        noncePrefix = noncePrefix,
        sendKey = clientKey.copyOf(),
        receiveKey = hubKey.copyOf(),
        sendDirection = "client-to-hub",
        receiveDirection = "hub-to-client",
    )

    private fun hubCodec() = SessionFrameCodec(
        sessionId = sessionId,
        noncePrefix = noncePrefix,
        sendKey = hubKey.copyOf(),
        receiveKey = clientKey.copyOf(),
        sendDirection = "hub-to-client",
        receiveDirection = "client-to-hub",
    )

    private fun expectFailure(code: String, block: () -> Unit) {
        try {
            block()
            throw AssertionError("expected $code")
        } catch (error: IllegalArgumentException) {
            assertTrue(error.message?.contains(code) == true)
        }
    }

    private fun hex(value: String): ByteArray = value.chunked(2)
        .map { it.toInt(16).toByte() }
        .toByteArray()
}
