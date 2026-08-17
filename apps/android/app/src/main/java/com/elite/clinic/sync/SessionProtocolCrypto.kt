package com.elite.clinic.sync

import android.util.Base64
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

object SessionProtocolCrypto {
    private val signatureFields = arrayOf(
        "deviceSignatureAlgorithm",
        "deviceSignatureBase64",
        "signatureAlgorithm",
        "signatureBase64",
        "signerKeyId",
        "signerKeyVersion",
    )

    fun canonicalWithoutSignatures(descriptor: JSONObject): String =
        CanonicalJson.encode(CanonicalJson.copyWithout(descriptor, *signatureFields))

    fun sha256Hex(value: String): String = sha256Hex(
        value.toByteArray(StandardCharsets.UTF_8),
    )

    fun sha256Hex(value: ByteArray): String = MessageDigest
        .getInstance("SHA-256")
        .digest(value)
        .joinToString(separator = "") { byte -> "%02x".format(byte) }

    fun hashWithoutField(descriptor: JSONObject, fieldName: String): String {
        val copy = CanonicalJson.copyWithout(
            descriptor,
            *signatureFields,
            fieldName,
        )
        return sha256Hex(CanonicalJson.encode(copy))
    }

    fun verifyDeviceSignature(
        descriptor: JSONObject,
        publicKeySpkiBase64: String,
        signatureBase64: String,
    ): Boolean {
        return try {
            val publicKey = KeyFactory.getInstance("EC").generatePublic(
                X509EncodedKeySpec(
                    Base64.decode(publicKeySpkiBase64, Base64.DEFAULT),
                ),
            )
            val verifier = Signature.getInstance("SHA256withECDSA")
            verifier.initVerify(publicKey)
            verifier.update(
                canonicalWithoutSignatures(descriptor)
                    .toByteArray(StandardCharsets.UTF_8),
            )
            verifier.verify(Base64.decode(signatureBase64, Base64.DEFAULT))
        } catch (_: Exception) {
            false
        }
    }
}
