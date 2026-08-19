package com.elite.clinic.sync

import java.util.Base64
import com.elite.clinic.security.ZeroizableBytes
import com.elite.clinic.security.withZeroizedBytes
import java.security.MessageDigest
import org.json.JSONObject

private const val MAX_DOCTOR_DOCUMENT_BYTES = 20 * 1024 * 1024
private val ALLOWED_DOCTOR_DOCUMENT_MIME_TYPES = setOf(
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
)

/**
 * A document returned from the Hub for an in-memory viewer only.
 *
 * The content owner is never passed to Room or a file API. Call [clear] when
 * the viewer closes; subsequent content access is rejected.
 */
class InMemoryDoctorDocument(
    val documentId: String,
    val displayName: String,
    val fileName: String,
    val mimeType: String,
    val version: Int,
    val sizeBytes: Int,
    private val content: ZeroizableBytes,
) {
    val isCleared: Boolean
        get() = content.isCleared

    /**
     * Provides a temporary viewer copy and overwrites that copy before return,
     * including when the viewer callback throws or is cancelled.
     */
    fun <T> useViewerCopy(block: (ByteArray) -> T): T {
        val copy = content.copyForUse()
        return try {
            block(copy)
        } finally {
            copy.fill(0)
        }
    }

    fun clear() {
        content.close()
    }
}

object DoctorDocumentStreamParser {
    fun parse(response: JSONObject): InMemoryDoctorDocument {
        val contentBase64 = response.getString("contentBase64")
        val bytes = try {
            Base64.getDecoder().decode(contentBase64)
        } catch (error: IllegalArgumentException) {
            throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_BASE64_INVALID", error)
        }
        var ownershipTransferred = false
        try {
            require(bytes.isNotEmpty() && bytes.size <= MAX_DOCTOR_DOCUMENT_BYTES) {
                "SYNC_DOCTOR_DOCUMENT_SIZE_INVALID"
            }
            val mimeType = response.getString("mimeType")
            require(mimeType in ALLOWED_DOCTOR_DOCUMENT_MIME_TYPES) {
                "SYNC_DOCTOR_DOCUMENT_MIME_INVALID"
            }
            require(response.getInt("sizeBytes") == bytes.size) {
                "SYNC_DOCTOR_DOCUMENT_SIZE_MISMATCH"
            }
            val expectedHash = response.getString("contentSha256")
            require(expectedHash.matches(Regex("^[a-f0-9]{64}$"))) {
                "SYNC_DOCTOR_DOCUMENT_HASH_INVALID"
            }
            val actualHash = withZeroizedBytes(
                MessageDigest.getInstance("SHA-256").digest(bytes),
            ) { digest ->
                digest.joinToString("") { byte -> "%02x".format(byte) }
            }
            require(actualHash == expectedHash) {
                "SYNC_DOCTOR_DOCUMENT_INTEGRITY_FAILURE"
            }
            val document = InMemoryDoctorDocument(
                documentId = response.getString("documentId"),
                displayName = response.getString("displayName"),
                fileName = response.getString("fileName"),
                mimeType = mimeType,
                version = response.getInt("version"),
                sizeBytes = bytes.size,
                content = ZeroizableBytes.adopt(bytes),
            )
            ownershipTransferred = true
            return document
        } finally {
            if (!ownershipTransferred) {
                bytes.fill(0)
            }
        }
    }
}

class DoctorDocumentClient(private val session: SecureSession) {
    suspend fun view(documentId: String): InMemoryDoctorDocument =
        DoctorDocumentStreamParser.parse(session.requestDoctorDocument(documentId))

    suspend fun upload(request: JSONObject): JSONObject =
        session.requireLanDocumentUpload(request)
}

private suspend fun SecureSession.requireLanDocumentUpload(request: JSONObject): JSONObject {
    require(this is LanSyncHttpSession) {
        "SYNC_DOCTOR_DOCUMENT_UPLOAD_TRANSPORT_REQUIRED"
    }
    return uploadDoctorDocument(request)
}
