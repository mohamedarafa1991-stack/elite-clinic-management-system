package com.elite.clinic.sync

import java.util.Base64
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.spec.X509EncodedKeySpec
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object SessionKeyDerivation {
    private const val HASH_ALGORITHM = "HmacSHA256"
    private const val HASH_LENGTH = 32
    private const val SESSION_INFO = "elite-clinic/session-key/v1"
    private const val CLIENT_TO_HUB_INFO = "client-to-hub"
    private const val HUB_TO_CLIENT_INFO = "hub-to-client"
    private const val KEY_CONFIRMATION_INFO = "key-confirmation"

    fun deriveSharedSecret(
        privateKey: PrivateKey,
        peerPublicKeySpkiBase64: String,
    ): ByteArray {
        val peerEncoded = Base64.getDecoder().decode(peerPublicKeySpkiBase64)
        val peerPublicKey = try {
            KeyFactory.getInstance("EC").generatePublic(
                X509EncodedKeySpec(peerEncoded),
            )
        } finally {
            peerEncoded.fill(0)
        }
        return KeyAgreement.getInstance("ECDH").run {
            init(privateKey)
            doPhase(peerPublicKey, true)
            generateSecret()
        }
    }

    fun deriveSessionKeys(
        sharedSecret: ByteArray,
        transcriptHash: ByteArray,
    ): DerivedSessionKeys {
        val rootKey = hkdfSha256(
            ikm = sharedSecret,
            salt = transcriptHash,
            info = SESSION_INFO.toByteArray(Charsets.UTF_8),
            length = HASH_LENGTH,
        )
        var clientToHubKey: ByteArray? = null
        var hubToClientKey: ByteArray? = null
        var keyConfirmationKey: ByteArray? = null
        var transferred = false
        try {
            clientToHubKey = hkdfSha256(
                ikm = rootKey,
                salt = ByteArray(0),
                info = CLIENT_TO_HUB_INFO.toByteArray(Charsets.UTF_8),
                length = HASH_LENGTH,
            )
            hubToClientKey = hkdfSha256(
                ikm = rootKey,
                salt = ByteArray(0),
                info = HUB_TO_CLIENT_INFO.toByteArray(Charsets.UTF_8),
                length = HASH_LENGTH,
            )
            keyConfirmationKey = hkdfSha256(
                ikm = rootKey,
                salt = ByteArray(0),
                info = KEY_CONFIRMATION_INFO.toByteArray(Charsets.UTF_8),
                length = HASH_LENGTH,
            )
            val result = DerivedSessionKeys(
                rootKey = rootKey,
                clientToHubKey = clientToHubKey,
                hubToClientKey = hubToClientKey,
                keyConfirmationKey = keyConfirmationKey,
            )
            transferred = true
            return result
        } finally {
            if (!transferred) {
                rootKey.fill(0)
                clientToHubKey?.fill(0)
                hubToClientKey?.fill(0)
                keyConfirmationKey?.fill(0)
            }
        }
    }

    fun keyConfirmationMac(
        key: ByteArray,
        sessionId: String,
        transcriptHashHex: String,
        role: String,
    ): ByteArray {
        val descriptor = "{\"messageType\":\"session-key-confirmation\",\"protocolVersion\":1,\"role\":\"$role\",\"sessionId\":\"$sessionId\",\"transcriptHash\":\"$transcriptHashHex\"}"
        val descriptorBytes = descriptor.toByteArray(Charsets.UTF_8)
        return try {
            Mac.getInstance(HASH_ALGORITHM).run {
                init(SecretKeySpec(key, HASH_ALGORITHM))
                doFinal(descriptorBytes)
            }
        } finally {
            descriptorBytes.fill(0)
        }
    }

    fun verifyKeyConfirmation(expected: ByteArray, actual: ByteArray): Boolean =
        expected.size == actual.size && MessageDigest.isEqual(expected, actual)

    fun hkdfSha256(
        ikm: ByteArray,
        salt: ByteArray,
        info: ByteArray,
        length: Int,
    ): ByteArray {
        require(length in 0..(255 * HASH_LENGTH)) {
            "ELITE_HKDF_LENGTH_INVALID: output length exceeds HKDF-SHA-256 limit"
        }
        val clearsSalt = salt.isEmpty()
        val actualSalt = if (clearsSalt) ByteArray(HASH_LENGTH) else salt
        try {
            val extractMac = Mac.getInstance(HASH_ALGORITHM)
            extractMac.init(SecretKeySpec(actualSalt, HASH_ALGORITHM))
            val prk = extractMac.doFinal(ikm)
            try {
                if (length == 0) return ByteArray(0)

                val output = ByteArray(length)
                var previous = ByteArray(0)
                try {
                    var outputOffset = 0
                    var counter = 1
                    while (outputOffset < length) {
                        val expandMac = Mac.getInstance(HASH_ALGORITHM)
                        expandMac.init(SecretKeySpec(prk, HASH_ALGORITHM))
                        expandMac.update(previous)
                        expandMac.update(info)
                        expandMac.update(counter.toByte())
                        val next = expandMac.doFinal()
                        previous.fill(0)
                        previous = next
                        val copyLength = minOf(previous.size, length - outputOffset)
                        previous.copyInto(output, outputOffset, 0, copyLength)
                        outputOffset += copyLength
                        counter += 1
                    }
                    return output
                } finally {
                    previous.fill(0)
                }
            } finally {
                prk.fill(0)
            }
        } finally {
            if (clearsSalt) {
                actualSalt.fill(0)
            }
        }
    }
}

data class DerivedSessionKeys(
    val rootKey: ByteArray,
    val clientToHubKey: ByteArray,
    val hubToClientKey: ByteArray,
    val keyConfirmationKey: ByteArray,
) : AutoCloseable {
    override fun close() {
        rootKey.fill(0)
        clientToHubKey.fill(0)
        hubToClientKey.fill(0)
        keyConfirmationKey.fill(0)
    }
}
