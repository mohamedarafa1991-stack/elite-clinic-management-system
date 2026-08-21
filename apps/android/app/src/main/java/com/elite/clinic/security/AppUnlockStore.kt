package com.elite.clinic.security

import android.content.Context
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom

/** Stores only an encrypted, salted PIN verifier; the plaintext PIN is never persisted. */
class AppUnlockStore(private val context: Context, private val keyStore: DeviceKeyStore) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun isPinConfigured(): Boolean = preferences.contains(VERIFIER)

    fun setPin(pin: String) {
        require(pin.length in 4..12 && pin.all(Char::isDigit)) {
            "ELITE_ANDROID_PIN_INVALID: PIN must contain 4 to 12 digits"
        }
        val salt = ByteArray(16).also(SecureRandom()::nextBytes)
        val verifier = digest(salt, pin)
        val payload = Base64.encodeToString(salt, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(verifier, Base64.NO_WRAP)
        val encrypted = keyStore.encrypt(payload)
        check(
            preferences.edit()
                .putString(IV, Base64.encodeToString(encrypted.iv, Base64.NO_WRAP))
                .putString(VERIFIER, Base64.encodeToString(encrypted.ciphertext, Base64.NO_WRAP))
                .commit(),
        ) { "ELITE_ANDROID_PIN_STORAGE_FAILED" }
    }

    fun verifyPin(pin: String): Boolean {
        if (pin.length !in 4..12 || !pin.all(Char::isDigit)) return false
        val iv = preferences.getString(IV, null) ?: return false
        val encrypted = preferences.getString(VERIFIER, null) ?: return false
        return runCatching {
            val payload = keyStore.decrypt(
                EncryptedValue(
                    iv = Base64.decode(iv, Base64.NO_WRAP),
                    ciphertext = Base64.decode(encrypted, Base64.NO_WRAP),
                ),
            )
            val parts = payload.split(":", limit = 2)
            if (parts.size != 2) return false
            val salt = Base64.decode(parts[0], Base64.NO_WRAP)
            val expected = Base64.decode(parts[1], Base64.NO_WRAP)
            MessageDigest.isEqual(expected, digest(salt, pin))
        }.getOrDefault(false)
    }

    private fun digest(salt: ByteArray, pin: String): ByteArray = MessageDigest.getInstance("SHA-256")
        .digest(salt + pin.toByteArray(StandardCharsets.UTF_8))

    private companion object {
        const val PREFERENCES = "elite.android.app-unlock.v1"
        const val IV = "iv"
        const val VERIFIER = "verifier"
    }
}
