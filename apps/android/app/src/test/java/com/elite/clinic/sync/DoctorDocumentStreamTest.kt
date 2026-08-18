package com.elite.clinic.sync

import android.util.Base64
import java.security.MessageDigest
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class DoctorDocumentStreamTest {
    @Test
    fun parsesAndClearsAnInMemoryDocument() {
        val bytes = "synthetic doctor cv".toByteArray()
        val response = response(bytes, "application/pdf")
        val document = DoctorDocumentStreamParser.parse(response)

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
    }

    @Test
    fun viewerCopyIsClearedWhenTheViewerCallbackThrows() {
        val document = DoctorDocumentStreamParser.parse(
            response("synthetic doctor cv".toByteArray(), "application/pdf"),
        )

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
        val response = response("synthetic doctor license".toByteArray(), "application/pdf")
            .put("contentSha256", "a".repeat(64))

        val error = assertThrows(IllegalArgumentException::class.java) {
            DoctorDocumentStreamParser.parse(response)
        }
        assertEquals("SYNC_DOCTOR_DOCUMENT_INTEGRITY_FAILURE", error.message)
    }

    @Test
    fun rejectsUnsupportedMimeAndSizeMismatch() {
        val bytes = "synthetic image".toByteArray()
        val unsupported = response(bytes, "text/plain")
        assertThrows(IllegalArgumentException::class.java) {
            DoctorDocumentStreamParser.parse(unsupported)
        }
        val mismatch = response(bytes, "image/png").put("sizeBytes", bytes.size + 1)
        assertThrows(IllegalArgumentException::class.java) {
            DoctorDocumentStreamParser.parse(mismatch)
        }
    }

    private fun response(bytes: ByteArray, mimeType: String): JSONObject {
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
            .put("contentBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
    }
}
