package com.elite.clinic.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class DeviceKeyStore(private val context: Context) {
    private val alias = "elite.device.local-store.wrap-key.v1"
    private val keyStoreType = "AndroidKeyStore"

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(keyStoreType).apply { load(null) }
        val existing = keyStore.getKey(alias, null)
        if (existing is SecretKey) {
            return existing
        }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, keyStoreType)
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    fun encrypt(value: String): EncryptedValue {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return EncryptedValue(
            iv = cipher.iv,
            ciphertext = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8)),
        )
    }

    fun decrypt(value: EncryptedValue): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, value.iv))
        return cipher.doFinal(value.ciphertext).toString(StandardCharsets.UTF_8)
    }
}

data class EncryptedValue(
    val iv: ByteArray,
    val ciphertext: ByteArray,
)
