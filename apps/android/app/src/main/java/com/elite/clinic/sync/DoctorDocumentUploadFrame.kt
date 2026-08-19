package com.elite.clinic.sync

import java.nio.charset.StandardCharsets
import org.json.JSONObject

object DoctorDocumentUploadFrame {
    private val magic = "ELITE-DOC-UPLOAD-V1".toByteArray(StandardCharsets.US_ASCII)
    private const val HEADER_BYTES = 4
    private const val MAX_METADATA_BYTES = 4096
    private const val MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

    fun encode(metadata: JSONObject, content: ByteArray): ByteArray {
        require(content.isNotEmpty() && content.size <= MAX_DOCUMENT_BYTES) {
            "ELITE_DOCTOR_DOCUMENT_SIZE_INVALID"
        }
        val metadataBytes = CanonicalJson.encode(metadata).toByteArray(StandardCharsets.UTF_8)
        try {
            require(metadataBytes.isNotEmpty() && metadataBytes.size <= MAX_METADATA_BYTES) {
                "ELITE_DOCTOR_DOCUMENT_METADATA_INVALID"
            }
            val frame = ByteArray(magic.size + HEADER_BYTES + metadataBytes.size + content.size)
            magic.copyInto(frame, destinationOffset = 0)
            writeInt(metadataBytes.size, frame, magic.size)
            metadataBytes.copyInto(frame, destinationOffset = magic.size + HEADER_BYTES)
            content.copyInto(
                frame,
                destinationOffset = magic.size + HEADER_BYTES + metadataBytes.size,
            )
            return frame
        } finally {
            metadataBytes.fill(0)
        }
    }

    fun clear(frame: ByteArray) {
        frame.fill(0)
    }

    private fun writeInt(value: Int, target: ByteArray, offset: Int) {
        target[offset] = (value ushr 24).toByte()
        target[offset + 1] = (value ushr 16).toByte()
        target[offset + 2] = (value ushr 8).toByte()
        target[offset + 3] = value.toByte()
    }
}
