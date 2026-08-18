package com.elite.clinic.sync

import android.util.Base64
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
 * The byte array must be cleared when the viewer is closed and is never passed to Room or a file API.
 */
class InMemoryDoctorDocument(
    val documentId: String,
    val displayName: String,
    val fileName: String,
    val mimeType: String,
    val version: Int,
    private val bytes: ByteArray,
) {
    val sizeBytes: Int get() = bytes.size

    fun copyBytesForViewer(): ByteArray = bytes.copyOf()

    fun clear() {
        bytes.fill(0)
    }
}

object DoctorDocumentStreamParser {
    fun parse(response: JSONObject): InMemoryDoctorDocument {
        val contentBase64 = response.getString("contentBase64")
        val bytes = try {
            Base64.decode(contentBase64, Base64.DEFAULT)
        } catch (error: IllegalArgumentException) {
            throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_BASE64_INVALID", error)
        }
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
        val actualHash = MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { byte -> "%02x".format(byte) }
        require(actualHash == expectedHash) {
            "SYNC_DOCTOR_DOCUMENT_INTEGRITY_FAILURE"
        }
        return InMemoryDoctorDocument(
            documentId = response.getString("documentId"),
            displayName = response.getString("displayName"),
            fileName = response.getString("fileName"),
            mimeType = mimeType,
            version = response.getInt("version"),
            bytes = bytes,
        )
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
