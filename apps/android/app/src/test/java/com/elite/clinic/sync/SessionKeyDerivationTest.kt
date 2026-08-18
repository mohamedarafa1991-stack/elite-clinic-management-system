package com.elite.clinic.sync

import android.util.Base64
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec

class SessionKeyDerivationTest {
    @Test
    fun hkdfMatchesRfc5869TestCaseOne() {
        val output = SessionKeyDerivation.hkdfSha256(
            ikm = ByteArray(22) { 0x0b },
            salt = hex("000102030405060708090a0b0c"),
            info = hex("f0f1f2f3f4f5f6f7f8f9"),
            length = 42,
        )
        assertEquals(
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
            output.toHex(),
        )
    }

    @Test
    fun derivedSessionKeysCloseOverwritesAllKeyArrays() {
        val keys = SessionKeyDerivation.deriveSessionKeys(
            sharedSecret = ByteArray(32) { 3 },
            transcriptHash = ByteArray(32) { 7 },
        )
        val root = keys.rootKey
        val clientToHub = keys.clientToHubKey
        val hubToClient = keys.hubToClientKey
        val confirmation = keys.keyConfirmationKey

        keys.close()

        assertArrayEquals(ByteArray(32), root)
        assertArrayEquals(ByteArray(32), clientToHub)
        assertArrayEquals(ByteArray(32), hubToClient)
        assertArrayEquals(ByteArray(32), confirmation)
    }

    @Test
    fun ecdhDerivesEqualSecretsAndSeparatedDirectionKeys() {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec("secp256r1"))
        val first = generator.generateKeyPair()
        val second = generator.generateKeyPair()
        val firstSecret = SessionKeyDerivation.deriveSharedSecret(
            first.private,
            Base64.encodeToString(second.public.encoded, Base64.NO_WRAP),
        )
        val secondSecret = SessionKeyDerivation.deriveSharedSecret(
            second.private,
            Base64.encodeToString(first.public.encoded, Base64.NO_WRAP),
        )
        assertArrayEquals(firstSecret, secondSecret)

        val keys = SessionKeyDerivation.deriveSessionKeys(firstSecret, ByteArray(32) { 7 })
        assertEquals(32, keys.rootKey.size)
        assertEquals(32, keys.clientToHubKey.size)
        assertEquals(32, keys.hubToClientKey.size)
        assertNotEquals(keys.clientToHubKey.toList(), keys.hubToClientKey.toList())
        assertTrue(keys.clientToHubKey.isNotEmpty())
    }

    private fun hex(value: String): ByteArray {
        return value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }

    private fun ByteArray.toHex(): String = joinToString(separator = "") { byte ->
        "%02x".format(byte)
    }
}
