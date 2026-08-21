package com.elite.clinic.sync

import java.util.Base64
import com.elite.clinic.data.LocalOutboxEvent
import com.elite.clinic.security.AndroidIdentityKeyStore
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CancellationException
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
    private val hubTlsCertificatePem: String,
    private val trustedHubPublicKeyPem: String,
    private val policy: SyncDevicePolicy,
    private val outboxScopeResolver: (LocalOutboxEvent) -> String,
    private val outboxReason: String = "offline-local-operation",
    private val connectTimeoutMillis: Int = 10_000,
    private val readTimeoutMillis: Int = 20_000,
) {
    init {
        require(baseUrl.startsWith("https://")) { "ELITE_LAN_HTTPS_REQUIRED" }
        require(connectTimeoutMillis > 0 && readTimeoutMillis > 0) {
            "ELITE_LAN_TIMEOUT_INVALID"
        }
    }

    fun createSession(
        requestedScopes: List<String> = policy.allowedScopes.toList(),
        sessionId: String = "lan-${UUID.randomUUID()}",
        requestNonce: String = LanSyncRequestFactory.newRequestNonce(),
        requestedAt: String = Instant.now().toString(),
    ): LanSyncHttpSession = try {
        createSessionInternal(requestedScopes, sessionId, requestNonce, requestedAt)
    } catch (error: CancellationException) {
        throw error
    } catch (error: SyncFailureException) {
        throw error
    } catch (error: Throwable) {
        throw SyncFailureClassifier.from(
            error = error,
            securityFallback = "ELITE_LAN_SESSION_SECURITY_FAILURE",
            retryableFallback = "ELITE_LAN_SESSION_UNAVAILABLE",
        )
    }

    private fun createSessionInternal(
        requestedScopes: List<String>,
        sessionId: String,
        requestNonce: String,
        requestedAt: String,
    ): LanSyncHttpSession {
        require(sessionId.isNotBlank()) { "ELITE_LAN_SESSION_ID_INVALID" }
        require(requestNonce.length in 16..128) {
            "ELITE_LAN_SESSION_NONCE_INVALID"
        }
        val requestedInstant = parseInstant(requestedAt)
        require(!requestedInstant.isAfter(Instant.now().plusSeconds(30))) {
            "ELITE_LAN_SESSION_REQUESTED_AT_IN_FUTURE"
        }
        require(requestedScopes.isNotEmpty() && requestedScopes.size <= 7) {
            "ELITE_LAN_SESSION_SCOPES_INVALID"
        }
        require(requestedScopes.distinct().size == requestedScopes.size) {
            "ELITE_LAN_SESSION_SCOPES_DUPLICATE"
        }
        require(requestedScopes.all { it in policy.allowedScopes }) {
            "ELITE_LAN_SESSION_SCOPE_DENIED"
        }
        val identity = identityKeyStore.ensureIdentityKey()
        val ephemeral = generateEphemeralKeyPair()
        val ephemeralSpki = Base64.getEncoder().encodeToString(ephemeral.public.encoded)
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
        val serverEphemeralBytes = Base64.getDecoder().decode(serverEphemeralSpki)
        try {
            require(
                SessionProtocolCrypto.sha256Hex(serverEphemeralBytes) ==
                    grant.getString("serverEphemeralKeyFingerprint"),
            ) { "ELITE_LAN_SESSION_SERVER_KEY_FINGERPRINT_INVALID" }
        } finally {
            serverEphemeralBytes.fill(0)
        }

        val sharedSecret = SessionKeyDerivation.deriveSharedSecret(
            ephemeral.private,
            serverEphemeralSpki,
        )
        var keys: DerivedSessionKeys? = null
        var noncePrefix: ByteArray? = null
        var frameCodec: SessionFrameCodec? = null
        var handedOff = false
        try {
            val transcriptHash = buildTranscriptHash(
                descriptor = descriptor,
                grant = grant,
            )
            if (transcriptHash != grant.getString("transcriptHash")) {
                throw SecurityException("ELITE_LAN_SESSION_TRANSCRIPT_MISMATCH")
            }
            val transcriptHashBytes = hexToBytes(transcriptHash)
            try {
                keys = SessionKeyDerivation.deriveSessionKeys(
                    sharedSecret,
                    transcriptHashBytes,
                )
            } finally {
                transcriptHashBytes.fill(0)
            }
            val derivedKeys = keys ?: error("ELITE_LAN_SESSION_KEYS_UNAVAILABLE")

            val expectedMac = SessionKeyDerivation.keyConfirmationMac(
                derivedKeys.keyConfirmationKey,
                sessionId,
                transcriptHash,
                "hub",
            )
            val actualMac = Base64.getDecoder().decode(grant.getString("keyConfirmationMacBase64"))
            try {
                if (!SessionKeyDerivation.verifyKeyConfirmation(expectedMac, actualMac)) {
                    throw SecurityException("ELITE_LAN_SESSION_KEY_CONFIRMATION_INVALID")
                }
            } finally {
                expectedMac.fill(0)
                actualMac.fill(0)
            }

            noncePrefix = Base64.getDecoder().decode(grant.getString("noncePrefixBase64"))
            require(noncePrefix?.size == 4) { "ELITE_LAN_SESSION_NONCE_PREFIX_INVALID" }
            val now = Instant.now()
            val issuedAt = parseInstant(grant.getString("issuedAt"))
            val validUntil = parseInstant(grant.getString("validUntil"))
            val enrollmentExpiresAt = parseInstant(policy.expiresAt)
            val offlineAccessUntil = parseInstant(policy.offlineAccessUntil)
            require(!issuedAt.isAfter(now.plusSeconds(30))) {
                "ELITE_LAN_SESSION_ISSUED_IN_FUTURE"
            }
            require(validUntil.isAfter(now)) { "ELITE_LAN_SESSION_EXPIRED" }
            require(!validUntil.isAfter(issuedAt.plusSeconds(5 * 60))) {
                "ELITE_LAN_SESSION_WINDOW_TOO_LONG"
            }
            require(!validUntil.isAfter(enrollmentExpiresAt)) {
                "ELITE_LAN_SESSION_ENROLLMENT_WINDOW_INVALID"
            }
            require(!validUntil.isAfter(offlineAccessUntil)) {
                "ELITE_LAN_SESSION_OFFLINE_WINDOW_INVALID"
            }
            frameCodec = SessionFrameCodec(
                sessionId = sessionId,
                noncePrefix = noncePrefix ?: error("ELITE_LAN_SESSION_NONCE_PREFIX_UNAVAILABLE"),
                sendKey = derivedKeys.clientToHubKey,
                receiveKey = derivedKeys.hubToClientKey,
                sendDirection = "client-to-hub",
                receiveDirection = "hub-to-client",
            )
            val session = LanSyncHttpSession(
                baseUrl = baseUrl.trimEnd('/'),
                hubTlsCertificatePem = hubTlsCertificatePem,
                frameCodec = frameCodec ?: error("ELITE_LAN_SESSION_CODEC_UNAVAILABLE"),
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
            handedOff = true
            return session
        } finally {
            sharedSecret.fill(0)
            keys?.close()
            noncePrefix?.fill(0)
            if (!handedOff) {
                frameCodec?.close()
            }
        }
    }

    private fun postSessionInit(request: JSONObject): JSONObject {
        val endpoint = URL("${baseUrl.trimEnd('/')}/sync/session-init")
        LanTlsConnection.requireHttps(endpoint)
        val connection = (endpoint.openConnection() as javax.net.ssl.HttpsURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = connectTimeoutMillis
            readTimeout = readTimeoutMillis
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }
        try {
            LanTlsConnection.configure(
                connection = connection,
                certificatePem = hubTlsCertificatePem,
                expectedHost = endpoint.host,
            )
            connection.instanceFollowRedirects = false
            connection.outputStream.use { output ->
                output.write(request.toString().toByteArray(StandardCharsets.UTF_8))
            }
            val status = connection.responseCode
            if (status in 300..399) {
                throw SyncFailureClassifier.security("ELITE_LAN_SESSION_REDIRECT_REJECTED")
            }
            if (status == HttpURLConnection.HTTP_CLIENT_TIMEOUT ||
                status == 429 ||
                status >= 500
            ) {
                throw SyncFailureClassifier.retryable(
                    "ELITE_LAN_SESSION_INIT_TRANSIENT_HTTP_$status",
                )
            }
            if (status !in 200..299) {
                throw SyncFailureClassifier.security("ELITE_LAN_SESSION_INIT_REJECTED_$status")
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
                Base64.getDecoder().decode(grant.getString("signatureBase64")),
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

    private fun parseInstant(value: String): Instant = try {
        Instant.parse(value)
    } catch (_: Exception) {
        throw SecurityException("ELITE_LAN_SESSION_TIMESTAMP_INVALID")
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
            X509EncodedKeySpec(Base64.getDecoder().decode(encoded)),
        )
    }

    private fun hexToBytes(hex: String): ByteArray {
        require(hex.length % 2 == 0)
        return ByteArray(hex.length / 2) { index ->
            hex.substring(index * 2, index * 2 + 2).toInt(16).toByte()
        }
    }
}
