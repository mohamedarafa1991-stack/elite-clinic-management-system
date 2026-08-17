package com.elite.clinic.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.elite.clinic.sync.SessionProtocolCrypto
import java.nio.charset.StandardCharsets
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * Owns the non-exportable Android device identity key.
 *
 * The private key never leaves Android Keystore. Only the DER-encoded SPKI
 * public key, its fingerprint, and signatures are exported to the protocol.
 */
class AndroidIdentityKeyStore(
    private val alias: String = DEFAULT_ALIAS,
) {
    private val keyStoreType = "AndroidKeyStore"

    fun ensureIdentityKey(): DeviceIdentityPublicInfo {
        val existing = loadKeyPair()
        val keyPair = existing ?: generateKeyPair()
        return publicInfo(keyPair)
    }

    fun hasIdentityKey(): Boolean {
        val keyStore = KeyStore.getInstance(keyStoreType).apply { load(null) }
        return keyStore.containsAlias(alias)
    }

    fun publicInfo(): DeviceIdentityPublicInfo = publicInfo(
        loadKeyPair() ?: throw IllegalStateException(
            "ELITE_ANDROID_IDENTITY_KEY_MISSING: identity key is not enrolled",
        ),
    )

    fun signCanonical(canonicalDescriptor: String): String {
        val keyPair = loadKeyPair() ?: throw IllegalStateException(
            "ELITE_ANDROID_IDENTITY_KEY_MISSING: identity key is not enrolled",
        )
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(keyPair.private)
        signer.update(canonicalDescriptor.toByteArray(StandardCharsets.UTF_8))
        return Base64.encodeToString(signer.sign(), Base64.NO_WRAP)
    }

    fun deleteIdentityKey() {
        KeyStore.getInstance(keyStoreType).apply {
            load(null)
            if (containsAlias(alias)) {
                deleteEntry(alias)
            }
        }
    }

    private fun generateKeyPair(): KeyPair {
        val generator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            keyStoreType,
        )
        generator.initialize(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
            )
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build(),
        )
        return generator.generateKeyPair()
    }

    private fun loadKeyPair(): KeyPair? {
        val keyStore = KeyStore.getInstance(keyStoreType).apply { load(null) }
        val privateKey = keyStore.getKey(alias, null) as? java.security.PrivateKey
            ?: return null
        val publicKey = keyStore.getCertificate(alias)?.publicKey ?: return null
        return KeyPair(publicKey, privateKey)
    }

    private fun publicInfo(keyPair: KeyPair): DeviceIdentityPublicInfo {
        val spki = keyPair.public.encoded
        return DeviceIdentityPublicInfo(
            publicKeySpkiBase64 = Base64.encodeToString(spki, Base64.NO_WRAP),
            publicKeyFingerprint = SessionProtocolCrypto.sha256Hex(spki),
        )
    }

    companion object {
        const val DEFAULT_ALIAS = "elite.android.device-identity.p256.v1"
    }
}

data class DeviceIdentityPublicInfo(
    val publicKeySpkiBase64: String,
    val publicKeyFingerprint: String,
)
