package com.elite.clinic.sync

import java.util.Base64
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class SessionFrameVectorTest {
    @Test
    fun matchesRepositoryAesGcmVectorExactly() {
        val fixture = JSONObject(
            javaClass.classLoader!!
                .getResourceAsStream("session-frame-vectors.json")!!
                .bufferedReader()
                .use { it.readText() },
        )
        val vector = fixture.getJSONArray("vectors").getJSONObject(0)
        val frameDefinition = vector.getJSONObject("frame")
        val key = hex(vector.getString("keyHex"))
        val noncePrefix = hex(vector.getString("noncePrefixHex"))
        val channel = SessionFrameCodec(
            sessionId = frameDefinition.getString("sessionId"),
            noncePrefix = noncePrefix,
            sendKey = key,
            receiveKey = ByteArray(32) { 0x22 },
            sendDirection = "client-to-hub",
            receiveDirection = "hub-to-client",
        )
        val actual = channel.encrypt(
            frameDefinition.getString("messageType"),
            Base64.getDecoder().decode(vector.getString("plaintextBase64")),
        )
        assertEquals(frameDefinition.getString("nonceBase64"), actual.getString("nonceBase64"))
        assertEquals(frameDefinition.getString("aadHash"), actual.getString("aadHash"))
        assertEquals(frameDefinition.getString("ciphertextBase64"), actual.getString("ciphertextBase64"))
        assertEquals(frameDefinition.getString("tagBase64"), actual.getString("tagBase64"))
    }

    private fun hex(value: String): ByteArray = value.chunked(2)
        .map { it.toInt(16).toByte() }
        .toByteArray()
}
