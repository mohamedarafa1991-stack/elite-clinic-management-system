package com.elite.clinic.sync

import android.util.Base64
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class SessionFrameCodec(
    private val sessionId: String,
    noncePrefix: ByteArray,
    sendKey: ByteArray,
    receiveKey: ByteArray,
    private val sendDirection: String,
    private val receiveDirection: String,
) {
    private val noncePrefix = noncePrefix.copyOf()
    private val sendKey = sendKey.copyOf()
    private val receiveKey = receiveKey.copyOf()
    private var sendCounter = 0L
    private var receiveCounter = 0L
    private var closed = false

    init {
        require(noncePrefix.size == NONCE_PREFIX_BYTES) {
            "ELITE_SESSION_NONCE_PREFIX_INVALID: nonce prefix must be 4 bytes"
        }
        require(sendKey.size == AES_KEY_BYTES && receiveKey.size == AES_KEY_BYTES) {
            "ELITE_SESSION_KEY_INVALID: AES-256 session keys are required"
        }
        require(sendDirection != receiveDirection) {
            "ELITE_SESSION_DIRECTION_INVALID: directions must be distinct"
        }
    }

    fun encrypt(messageType: String, plaintext: ByteArray): JSONObject {
        ensureOpen()
        if (sendCounter == Long.MAX_VALUE) throw IllegalStateException(
            "ELITE_SESSION_COUNTER_EXHAUSTED: session send counter is exhausted",
        )
        val counter = sendCounter
        val nonce = deriveNonce(noncePrefix, counter)
        try {
            val nonceBase64 = Base64.encodeToString(nonce, Base64.NO_WRAP)
            val unsigned = JSONObject()
                .put("protocolVersion", 1)
                .put("messageType", messageType)
                .put("sessionId", sessionId)
                .put("direction", sendDirection)
                .put("counter", counter)
                .put("nonceBase64", nonceBase64)
            val aad = canonicalAad(unsigned)
            try {
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(
                    Cipher.ENCRYPT_MODE,
                    SecretKeySpec(sendKey, "AES"),
                    GCMParameterSpec(TAG_BITS, nonce),
                )
                cipher.updateAAD(aad)
                val encrypted = cipher.doFinal(plaintext)
                try {
                    val ciphertextLength = encrypted.size - TAG_BYTES
                    val ciphertext = encrypted.copyOfRange(0, ciphertextLength)
                    val tag = encrypted.copyOfRange(ciphertextLength, encrypted.size)
                    try {
                        val frame = JSONObject(unsigned.toString())
                            .put("aadHash", sha256Hex(aad))
                            .put("ciphertextBase64", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                            .put("tagBase64", Base64.encodeToString(tag, Base64.NO_WRAP))
                        sendCounter += 1
                        return frame
                    } finally {
                        ciphertext.fill(0)
                        tag.fill(0)
                    }
                } finally {
                    encrypted.fill(0)
                }
            } finally {
                aad.fill(0)
            }
        } finally {
            nonce.fill(0)
        }
    }

    fun decrypt(frame: JSONObject): ByteArray {
        ensureOpen()
        val version = frame.getInt("protocolVersion")
        if (version != 1) throw IllegalArgumentException(
            "ELITE_SESSION_PROTOCOL_UNSUPPORTED: unsupported frame version",
        )
        if (frame.getString("sessionId") != sessionId) throw IllegalArgumentException(
            "ELITE_SESSION_ID_MISMATCH: frame belongs to another session",
        )
        if (frame.getString("direction") != receiveDirection) throw IllegalArgumentException(
            "ELITE_SESSION_DIRECTION_MISMATCH: frame direction is invalid",
        )
        val counter = frame.getLong("counter")
        if (receiveCounter == Long.MAX_VALUE) throw IllegalArgumentException(
            "ELITE_SESSION_COUNTER_EXHAUSTED: session receive counter is exhausted",
        )
        if (counter != receiveCounter) {
            throw IllegalArgumentException(
                if (counter < receiveCounter) {
                    "ELITE_SESSION_REPLAY_REJECTED: frame counter was already accepted"
                } else {
                    "ELITE_SESSION_COUNTER_GAP: frame counter is not the next expected counter"
                },
            )
        }
        val nonce = deriveNonce(noncePrefix, counter)
        try {
            val nonceBase64 = Base64.encodeToString(nonce, Base64.NO_WRAP)
            if (frame.getString("nonceBase64") != nonceBase64) throw IllegalArgumentException(
                "ELITE_SESSION_NONCE_MISMATCH: frame nonce is invalid",
            )
            val unsigned = JSONObject()
                .put("protocolVersion", version)
                .put("messageType", frame.getString("messageType"))
                .put("sessionId", sessionId)
                .put("direction", receiveDirection)
                .put("counter", counter)
                .put("nonceBase64", nonceBase64)
            val aad = canonicalAad(unsigned)
            try {
                if (sha256Hex(aad) != frame.getString("aadHash")) throw IllegalArgumentException(
                    "ELITE_SESSION_AAD_TAMPERED: frame AAD hash is invalid",
                )
                val ciphertext = Base64.decode(frame.getString("ciphertextBase64"), Base64.DEFAULT)
                try {
                    val tag = Base64.decode(frame.getString("tagBase64"), Base64.DEFAULT)
                    try {
                        if (tag.size != TAG_BYTES) throw IllegalArgumentException(
                            "ELITE_SESSION_TAG_INVALID: AES-GCM tag length is not 16 bytes",
                        )
                        val encrypted = ByteArray(ciphertext.size + tag.size)
                        try {
                            ciphertext.copyInto(encrypted)
                            tag.copyInto(encrypted, ciphertext.size)
                            return try {
                                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                                cipher.init(
                                    Cipher.DECRYPT_MODE,
                                    SecretKeySpec(receiveKey, "AES"),
                                    GCMParameterSpec(TAG_BITS, nonce),
                                )
                                cipher.updateAAD(aad)
                                val plaintext = cipher.doFinal(encrypted)
                                receiveCounter += 1
                                plaintext
                            } catch (_: Exception) {
                                throw IllegalArgumentException(
                                    "ELITE_SESSION_AUTHENTICATION_FAILED: AES-GCM authentication failed",
                                )
                            }
                        } finally {
                            encrypted.fill(0)
                        }
                    } finally {
                        tag.fill(0)
                    }
                } finally {
                    ciphertext.fill(0)
                }
            } finally {
                aad.fill(0)
            }
        } finally {
            nonce.fill(0)
        }
    }

    fun nextSendCounter(): Long = sendCounter

    fun nextReceiveCounter(): Long = receiveCounter

    fun close() {
        if (closed) return
        closed = true
        noncePrefix.fill(0)
        sendKey.fill(0)
        receiveKey.fill(0)
    }

    private fun ensureOpen() {
        if (closed) throw SecurityException("ELITE_SESSION_CLOSED")
    }

    private fun canonicalAad(frame: JSONObject): ByteArray = CanonicalJson.encode(frame)
        .toByteArray(Charsets.UTF_8)

    companion object {
        private const val NONCE_PREFIX_BYTES = 4
        private const val NONCE_BYTES = 12
        private const val AES_KEY_BYTES = 32
        private const val TAG_BYTES = 16
        private const val TAG_BITS = TAG_BYTES * 8

        fun deriveNonce(noncePrefix: ByteArray, counter: Long): ByteArray {
            require(noncePrefix.size == NONCE_PREFIX_BYTES) {
                "ELITE_SESSION_NONCE_PREFIX_INVALID: nonce prefix must be 4 bytes"
            }
            require(counter >= 0) {
                "ELITE_SESSION_COUNTER_INVALID: counter must be nonnegative"
            }
            val nonce = ByteBuffer.allocate(NONCE_BYTES).order(ByteOrder.BIG_ENDIAN)
            nonce.put(noncePrefix)
            nonce.putLong(counter)
            return nonce.array()
        }

        private fun sha256Hex(value: ByteArray): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(value)
            return try {
                digest.joinToString(separator = "") { byte -> "%02x".format(byte) }
            } finally {
                digest.fill(0)
            }
        }
    }
}
