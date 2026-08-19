package com.elite.clinic.sync

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DoctorDocumentUploadFrameTest {
    @Test
    fun `encodes canonical metadata and raw document bytes`() {
        val content = "synthetic upload bytes".toByteArray(StandardCharsets.UTF_8)
        val metadata = metadata(content)
        val frame = DoctorDocumentUploadFrame.encode(metadata, content)
        val magic = "ELITE-DOC-UPLOAD-V1".toByteArray(StandardCharsets.US_ASCII)
        val metadataLength = readInt(frame, magic.size)
        val metadataStart = magic.size + 4
        val metadataEnd = metadataStart + metadataLength

        assertArrayEquals(magic, frame.copyOfRange(0, magic.size))
        assertEquals(
            CanonicalJson.encode(metadata),
            String(frame.copyOfRange(metadataStart, metadataEnd), StandardCharsets.UTF_8),
        )
        assertArrayEquals(content, frame.copyOfRange(metadataEnd, frame.size))

        DoctorDocumentUploadFrame.clear(frame)
        assertTrue(frame.all { it == 0.toByte() })
    }

    @Test
    fun `rejects an empty document`() {
        val empty = ByteArray(0)
        val metadata = metadata("synthetic upload bytes".toByteArray(StandardCharsets.UTF_8))
        try {
            DoctorDocumentUploadFrame.encode(metadata, empty)
            error("expected size rejection")
        } catch (error: IllegalArgumentException) {
            assertEquals("ELITE_DOCTOR_DOCUMENT_SIZE_INVALID", error.message)
        }
    }

    private fun metadata(content: ByteArray): JSONObject = JSONObject()
        .put("doctorId", "doctor-synthetic-01")
        .put("documentType", "cv")
        .put("displayName", "Synthetic CV")
        .put("fileName", "synthetic-cv.pdf")
        .put("mimeType", "application/pdf")
        .put("sizeBytes", content.size)
        .put("contentSha256", sha256(content))

    private fun sha256(content: ByteArray): String = MessageDigest
        .getInstance("SHA-256")
        .digest(content)
        .joinToString("") { byte -> "%02x".format(byte) }

    private fun readInt(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xff shl 24) or
            (bytes[offset + 1].toInt() and 0xff shl 16) or
            (bytes[offset + 2].toInt() and 0xff shl 8) or
            (bytes[offset + 3].toInt() and 0xff)
}
