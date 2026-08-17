package com.elite.clinic.sync

import android.util.Base64
import com.elite.clinic.data.LocalOutboxEvent
import com.elite.clinic.security.AndroidIdentityKeyStore
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.PublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.time.Instant
import java.util.UUID

/** Establishes a short-lived, transcript-bound encrypted LAN session. */
class LanSyncSessionFactory(
    private val baseUrl: String,
    private val identityKeyStore: AndroidIdentityKeyStore,
    private val trustedHubPublicKeyPem: String,
    private val policy: SyncDevicePolicy,
    private val outboxScopeResolver: (LocalOutboxEvent) -> String,
    private val outboxReason: String = "offline-local-operation",
    private val connectTimeoutMillis: Int = 10_000,
    private val readTimeoutMillis: Int = 20_000,
) {
    fun createSession(
        requestedScopes: List<String> = policy.allowedScopes.toList(),
        sessionId: String = "lan-${UUID.randomUUID()}",
        requestNonce: String = LanSyncRequestFactory.newRequestNonce(),
        requestedAt: String = Instant.now().toString(),
    ): LanSyncHttpSession {
        require(requestedScopes.isNotEmpty() && requestedScopes.size <= 5) {
            "ELITE_LAN_SESSION_SCOPES_INVALID"
        }
        require(requestedScopes.all { it in policy.allowedScopes }) {
            "ELITE_LAN_SESSION_SCOPE_DENIED"
        }
        val identity = identityKeyStore.ensureIdentityKey()
        val ephemeral = generateEphemeralKeyPair()
        val ephemeralSpki = Base64.encodeToString(
            ephemeral.public.encoded,
            Base64.NO_WRAP,
        )
        val descriptor = JSONObject().apply {
            put("protocolVersion", 1)
            put("messageType", "session-init")
            put("organizationId", policy.organizationId)
            put("enrollmentId", policy.enrollmentId)
            put("deviceId", policy.deviceId)
            put("userId", policy.userId)
            put("sessionId", sessionId)
            put("requestNonce", requestNonce)
            put("clientCounter", 0)
            put("deviceIdentityKeyFingerprint", identity.publicKeyFingerprint)
            put("deviceEphemeralPublicKeySpkiBase64", ephemeralSpki)
            put(
                "deviceEphemeralKeyFingerprint",
                SessionProtocolCrypto.sha256Hex(ephemeral.public.encoded),
            )
            put("requestedScopes", org.json.JSONArray(requestedScopes))
            put("requestedAt", requestedAt)
        }
        val request = JSONObject(descriptor.toString()).apply {
            put("deviceSignatureAlgorithm", "sha256with-ecdsa")
            put(
                "deviceSignatureBase64",
                identityKeyStore.signCanonical(
                    SessionProtocolCrypto.canonicalWithoutSignatures(descriptor),
                ),
            )
        }
        val grant = postSessionInit(request)
        verifyGrantBindings(grant, sessionId, requestNonce, requestedScopes)
        verifyHubSignature(grant)

        val serverEphemeralSpki = grant.getString("serverEphemeralPublicKeySpkiBase64")
        val sharedSecret = SessionKeyDerivation.deriveSharedSecret(
            ephemeral.private,
            serverEphemeralSpki,
        )
        val transcriptHash = buildTranscriptHash(
            descriptor = descriptor,
            grant = grant,
        )
        if (transcriptHash != grant.getString("transcriptHash")) {
            throw SecurityException("ELITE_LAN_SESSION_TRANSCRIPT_MISMATCH")
        }
        val keys = SessionKeyDerivation.deriveSessionKeys(
            sharedSecret,
            hexToBytes(transcriptHash),
        )
        val expectedMac = SessionKeyDerivation.keyConfirmationMac(
            keys.keyConfirmationKey,
            sessionId,
            transcriptHash,
            "hub",
        )
        val actualMac = Base64.decode(
            grant.getString("keyConfirmationMacBase64"),
            Base64.DEFAULT,
        )
        if (!SessionKeyDerivation.verifyKeyConfirmation(expectedMac, actualMac)) {
            throw SecurityException("ELITE_LAN_SESSION_KEY_CONFIRMATION_INVALID")
        }
        val noncePrefix = Base64.decode(
            grant.getString("noncePrefixBase64"),
            Base64.DEFAULT,
        )
        require(noncePrefix.size == 4) { "ELITE_LAN_SESSION_NONCE_PREFIX_INVALID" }
        val frameCodec = SessionFrameCodec(
            sessionId = sessionId,
            noncePrefix = noncePrefix,
            sendKey = keys.clientToHubKey,
            receiveKey = keys.hubToClientKey,
            sendDirection = "client-to-hub",
            receiveDirection = "hub-to-client",
        )
        val validUntil = Instant.parse(grant.getString("validUntil"))
        if (!validUntil.isAfter(Instant.parse(requestedAt))) {
            throw SecurityException("ELITE_LAN_SESSION_EXPIRED")
        }
        return LanSyncHttpSession(
            baseUrl = baseUrl.trimEnd('/'),
            frameCodec = frameCodec,
            sessionId = sessionId,
            validUntil = validUntil,
            outboxRequestFactory = { event ->
                LanSyncRequestFactory.buildOutboxRequest(
                    policy = policy,
                    event = event,
                    scope = outboxScopeResolver(event),
                    reason = outboxReason,
                )
            },
            connectTimeoutMillis = connectTimeoutMillis,
            readTimeoutMillis = readTimeoutMillis,
        )
    }

    private fun postSessionInit(request: JSONObject): JSONObject {
        val connection = (URL("${baseUrl.trimEnd('/')}/sync/session-init")
            .openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = connectTimeoutMillis
            readTimeout = readTimeoutMillis
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }
        try {
            connection.outputStream.use { output ->
                output.write(request.toString().toByteArray(StandardCharsets.UTF_8))
            }
            val status = connection.responseCode
            if (status !in 200..299) {
                throw SecurityException("ELITE_LAN_SESSION_INIT_REJECTED_$status")
            }
            return JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        } finally {
            connection.disconnect()
        }
    }

    private fun verifyGrantBindings(
        grant: JSONObject,
        sessionId: String,
        requestNonce: String,
        requestedScopes: List<String>,
    ) {
        require(grant.getInt("protocolVersion") == 1)
        require(grant.getString("messageType") == "session-grant")
        require(grant.getString("organizationId") == policy.organizationId)
        require(grant.getString("enrollmentId") == policy.enrollmentId)
        require(grant.getString("deviceId") == policy.deviceId)
        require(grant.getString("userId") == policy.userId)
        require(grant.getString("sessionId") == sessionId)
        require(grant.getString("requestNonce") == requestNonce)
        val scopes = grant.getJSONArray("grantedScopes").let { array ->
            (0 until array.length()).map { array.getString(it) }
        }
        require(scopes == requestedScopes)
    }

    private fun verifyHubSignature(grant: JSONObject) {
        require(grant.getString("signatureAlgorithm") == "ed25519")
        val verifier = Signature.getInstance("Ed25519")
        verifier.initVerify(parseHubPublicKey(trustedHubPublicKeyPem))
        verifier.update(
            SessionProtocolCrypto.canonicalWithoutSignatures(grant)
                .toByteArray(StandardCharsets.UTF_8),
        )
        if (!verifier.verify(
                Base64.decode(grant.getString("signatureBase64"), Base64.DEFAULT),
            )
        ) {
            throw SecurityException("ELITE_LAN_SESSION_HUB_SIGNATURE_INVALID")
        }
    }

    private fun buildTranscriptHash(
        descriptor: JSONObject,
        grant: JSONObject,
    ): String {
        val transcript = JSONObject().apply {
            put("protocolVersion", 1)
            put("messageType", "session-transcript")
            put("init", descriptor)
            put(
                "serverEphemeralPublicKeySpkiBase64",
                grant.getString("serverEphemeralPublicKeySpkiBase64"),
            )
            put(
                "serverEphemeralKeyFingerprint",
                grant.getString("serverEphemeralKeyFingerprint"),
            )
            put("grantedScopes", grant.getJSONArray("grantedScopes"))
            put("issuedAt", grant.getString("issuedAt"))
            put("validUntil", grant.getString("validUntil"))
            put("noncePrefixBase64", grant.getString("noncePrefixBase64"))
        }
        return SessionProtocolCrypto.sha256Hex(CanonicalJson.encode(transcript))
    }

    private fun generateEphemeralKeyPair(): KeyPair =
        KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"))
        }.generateKeyPair()

    private fun parseHubPublicKey(pem: String): PublicKey {
        val encoded = pem
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace(Regex("\\s"), "")
        return KeyFactory.getInstance("Ed25519").generatePublic(
            X509EncodedKeySpec(Base64.decode(encoded, Base64.DEFAULT)),
        )
    }

    private fun hexToBytes(hex: String): ByteArray {
        require(hex.length % 2 == 0)
        return ByteArray(hex.length / 2) { index ->
            hex.substring(index * 2, index * 2 + 2).toInt(16).toByte()
        }
    }
}
