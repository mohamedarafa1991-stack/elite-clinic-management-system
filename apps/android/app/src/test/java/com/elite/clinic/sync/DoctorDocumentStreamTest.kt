package com.elite.clinic.sync

import java.security.MessageDigest
import java.util.Base64
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class DoctorDocumentStreamTest {
    @Test
    fun parsesAndClearsAnInMemoryDocument() {
        val bytes = "synthetic doctor cv".toByteArray()
        val payload = response(bytes, "application/pdf")
        val document = DoctorDocumentStreamParser.parse(payload)

        assertEquals("doctor-doc-01", document.documentId)
        assertEquals(bytes.size, document.sizeBytes)
        document.useViewerCopy { copy ->
            assertArrayEquals(bytes, copy)
        }
        assertTrue(!document.isCleared)

        document.clear()
        document.clear()

        assertTrue(document.isCleared)
        assertEquals(bytes.size, document.sizeBytes)
        val error = assertThrows(IllegalStateException::class.java) {
            document.useViewerCopy { error("cleared content must not be readable") }
        }
        assertEquals("SECURE_BYTES_CLEARED", error.message)
        payload.fill(0)
    }

    @Test
    fun parsesWrappedResponseFromRawBytes() {
        val bytes = "synthetic wrapped doctor document".toByteArray()
        val payload = JSONObject()
            .put("response", JSONObject(String(response(bytes, "application/pdf"))))
            .toString()
            .toByteArray()
        val document = try {
            DoctorDocumentStreamParser.parse(payload)
        } finally {
            payload.fill(0)
        }

        assertEquals("doctor-doc-01", document.documentId)
        document.useViewerCopy { copy -> assertArrayEquals(bytes, copy) }
        document.clear()
    }

    @Test
    fun viewerCopyIsClearedWhenTheViewerCallbackThrows() {
        val payload = response("synthetic doctor cv".toByteArray(), "application/pdf")
        val document = DoctorDocumentStreamParser.parse(payload)
        payload.fill(0)

        val error = assertThrows(IllegalStateException::class.java) {
            document.useViewerCopy { copy ->
                assertTrue(copy.any { it != 0.toByte() })
                throw IllegalStateException("synthetic viewer failure")
            }
        }
        assertEquals("synthetic viewer failure", error.message)
        assertTrue(!document.isCleared)
        document.clear()
    }

    @Test
    fun rejectsHashTampering() {
        val response = JSONObject(String(response("synthetic doctor license".toByteArray(), "application/pdf")))
            .put("contentSha256", "a".repeat(64))
            .toString()
            .toByteArray()

        val error = assertThrows(IllegalArgumentException::class.java) {
            DoctorDocumentStreamParser.parse(response)
        }
        assertEquals("SYNC_DOCTOR_DOCUMENT_INTEGRITY_FAILURE", error.message)
        response.fill(0)
    }

    @Test
    fun rejectsUnsupportedMimeAndSizeMismatch() {
        val bytes = "synthetic image".toByteArray()
        val unsupported = response(bytes, "text/plain")
        assertThrows(IllegalArgumentException::class.java) {
            DoctorDocumentStreamParser.parse(unsupported)
        }
        unsupported.fill(0)

        val mismatch = JSONObject(String(response(bytes, "image/png")))
            .put("sizeBytes", bytes.size + 1)
            .toString()
            .toByteArray()
        assertThrows(IllegalArgumentException::class.java) {
            DoctorDocumentStreamParser.parse(mismatch)
        }
        mismatch.fill(0)
    }

    private fun response(bytes: ByteArray, mimeType: String): ByteArray {
        val hash = MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { byte -> "%02x".format(byte) }
        return JSONObject()
            .put("documentId", "doctor-doc-01")
            .put("displayName", "Synthetic doctor document")
            .put("fileName", "synthetic-doctor-document.pdf")
            .put("mimeType", mimeType)
            .put("sizeBytes", bytes.size)
            .put("contentSha256", hash)
            .put("version", 1)
            .put("contentBase64", Base64.getEncoder().encodeToString(bytes))
            .toString()
            .toByteArray()
    }
}
