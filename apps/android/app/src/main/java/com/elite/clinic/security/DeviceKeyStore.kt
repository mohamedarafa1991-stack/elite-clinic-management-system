package com.elite.clinic.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.SecureRandom
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

    fun encrypt(value: String): EncryptedValue = encryptBytes(
        value.toByteArray(StandardCharsets.UTF_8),
    )

    fun decrypt(value: EncryptedValue): String = decryptBytes(value)
        .toString(StandardCharsets.UTF_8)

    fun databasePassphrase(): ByteArray {
        val preferences = context.getSharedPreferences(
            DATABASE_KEY_PREFERENCES,
            Context.MODE_PRIVATE,
        )
        val storedIv = preferences.getString(DATABASE_KEY_IV, null)
        val storedCiphertext = preferences.getString(DATABASE_KEY_CIPHERTEXT, null)
        if (storedIv != null && storedCiphertext != null) {
            return decryptBytes(
                EncryptedValue(
                    iv = Base64.decode(storedIv, Base64.NO_WRAP),
                    ciphertext = Base64.decode(storedCiphertext, Base64.NO_WRAP),
                ),
            )
        }
        val passphrase = ByteArray(32).also(SecureRandom()::nextBytes)
        val encrypted = encryptBytes(passphrase)
        check(
            preferences.edit()
                .putString(DATABASE_KEY_IV, Base64.encodeToString(encrypted.iv, Base64.NO_WRAP))
                .putString(
                    DATABASE_KEY_CIPHERTEXT,
                    Base64.encodeToString(encrypted.ciphertext, Base64.NO_WRAP),
                )
                .commit(),
        ) { "ELITE_ANDROID_DATABASE_KEY_PERSIST_FAILED" }
        return passphrase
    }

    private fun encryptBytes(value: ByteArray): EncryptedValue {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return EncryptedValue(
            iv = cipher.iv,
            ciphertext = cipher.doFinal(value),
        )
    }

    private fun decryptBytes(value: EncryptedValue): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, value.iv))
        return cipher.doFinal(value.ciphertext)
    }

    companion object {
        private const val DATABASE_KEY_PREFERENCES = "elite.android.database-key.v1"
        private const val DATABASE_KEY_IV = "iv"
        private const val DATABASE_KEY_CIPHERTEXT = "ciphertext"
    }
}

data class EncryptedValue(
    val iv: ByteArray,
    val ciphertext: ByteArray,
)
