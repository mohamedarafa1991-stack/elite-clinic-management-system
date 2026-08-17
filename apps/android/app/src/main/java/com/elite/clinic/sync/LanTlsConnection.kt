package com.elite.clinic.sync

import java.io.ByteArrayInputStream
import java.net.URL
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

object LanTlsConnection {
    fun configure(
        connection: HttpsURLConnection,
        certificatePem: String,
        expectedHost: String,
    ) {
        require(expectedHost.isNotBlank()) { "ELITE_LAN_TLS_HOST_REQUIRED" }
        val certificate = parseCertificate(certificatePem)
        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null)
            setCertificateEntry("elite-hub", certificate)
        }
        val trustManagerFactory = TrustManagerFactory.getInstance(
            TrustManagerFactory.getDefaultAlgorithm(),
        ).apply {
            init(keyStore)
        }
        val trustManager = trustManagerFactory.trustManagers
            .filterIsInstance<X509TrustManager>()
            .singleOrNull()
            ?: throw IllegalStateException("ELITE_LAN_TLS_TRUST_MANAGER_UNAVAILABLE")
        val sslContext = SSLContext.getInstance("TLS").apply {
            init(null, arrayOf(trustManager), SecureRandom())
        }
        connection.sslSocketFactory = sslContext.socketFactory
        connection.hostnameVerifier = HostnameVerifier { host, session ->
            host == expectedHost && session.peerCertificates.any { peer ->
                peer is X509Certificate && peer.encoded.contentEquals(certificate.encoded)
            }
        }
    }

    fun requireHttps(url: URL) {
        require(url.protocol == "https") { "ELITE_LAN_HTTPS_REQUIRED" }
    }

    private fun parseCertificate(pem: String): X509Certificate {
        val normalized = pem
            .replace("-----BEGIN CERTIFICATE-----", "")
            .replace("-----END CERTIFICATE-----", "")
            .replace(Regex("\\s"), "")
        val der = try {
            android.util.Base64.decode(normalized, android.util.Base64.DEFAULT)
        } catch (_: Exception) {
            throw IllegalArgumentException("ELITE_LAN_TLS_CERTIFICATE_INVALID")
        }
        return CertificateFactory.getInstance("X.509")
            .generateCertificate(ByteArrayInputStream(der)) as X509Certificate
    }
}
