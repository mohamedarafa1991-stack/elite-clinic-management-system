package com.elite.clinic.sync

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import org.json.JSONObject
import com.elite.clinic.security.ZeroizableBytes
import com.elite.clinic.security.withZeroizedBytes

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
 * the viewer closes; subsequent content access is rejected. The byte-oriented
 * transport parser decodes the Base64 field directly into mutable bytes and
 * does not create a document-bearing immutable Base64 String. This remains a
 * best-effort managed-runtime cleanup boundary, not a forensic erasure guarantee.
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
    /**
     * Parses the decrypted sync response without materializing contentBase64 as
     * an immutable String. The caller owns [payload] and must clear it after this
     * method returns or throws.
     */
    fun parse(payload: ByteArray): InMemoryDoctorDocument {
        val root = DocumentJsonReader(payload).readObject()
        val fields = when (val response = root.fields["response"]) {
            is DocumentJsonValue.ObjectValue -> response.fields
            null -> root.fields
            else -> throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_RESPONSE_INVALID")
        }
        val content = requiredBytes(fields, "contentBase64")
        var ownershipTransferred = false
        try {
            require(content.isNotEmpty() && content.size <= MAX_DOCTOR_DOCUMENT_BYTES) {
                "SYNC_DOCTOR_DOCUMENT_SIZE_INVALID"
            }
            val mimeType = requiredText(fields, "mimeType")
            require(mimeType in ALLOWED_DOCTOR_DOCUMENT_MIME_TYPES) {
                "SYNC_DOCTOR_DOCUMENT_MIME_INVALID"
            }
            require(requiredInt(fields, "sizeBytes") == content.size) {
                "SYNC_DOCTOR_DOCUMENT_SIZE_MISMATCH"
            }
            val expectedHash = requiredText(fields, "contentSha256")
            require(expectedHash.matches(Regex("^[a-f0-9]{64}$"))) {
                "SYNC_DOCTOR_DOCUMENT_HASH_INVALID"
            }
            val actualHash = withZeroizedBytes(
                MessageDigest.getInstance("SHA-256").digest(content),
            ) { digest ->
                digest.joinToString("") { byte -> "%02x".format(byte) }
            }
            require(actualHash == expectedHash) {
                "SYNC_DOCTOR_DOCUMENT_INTEGRITY_FAILURE"
            }
            val document = InMemoryDoctorDocument(
                documentId = requiredText(fields, "documentId"),
                displayName = requiredText(fields, "displayName"),
                fileName = requiredText(fields, "fileName"),
                mimeType = mimeType,
                version = requiredInt(fields, "version"),
                sizeBytes = content.size,
                content = ZeroizableBytes.adopt(content),
            )
            ownershipTransferred = true
            return document
        } finally {
            if (!ownershipTransferred) {
                content.fill(0)
            }
        }
    }

    private fun requiredText(
        fields: Map<String, DocumentJsonValue>,
        name: String,
    ): String = when (val value = fields[name]) {
        is DocumentJsonValue.Text -> value.value
        else -> throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_FIELD_INVALID_$name")
    }

    private fun requiredInt(
        fields: Map<String, DocumentJsonValue>,
        name: String,
    ): Int = when (val value = fields[name]) {
        is DocumentJsonValue.Number -> value.value.toInt().also {
            require(value.value in Int.MIN_VALUE..Int.MAX_VALUE) {
                "SYNC_DOCTOR_DOCUMENT_FIELD_RANGE_INVALID_$name"
            }
        }
        else -> throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_FIELD_INVALID_$name")
    }

    private fun requiredBytes(
        fields: Map<String, DocumentJsonValue>,
        name: String,
    ): ByteArray = when (val value = fields[name]) {
        is DocumentJsonValue.Bytes -> value.value
        else -> throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_FIELD_INVALID_$name")
    }
}

private sealed interface DocumentJsonValue {
    data class Text(val value: String) : DocumentJsonValue
    data class Number(val value: Long) : DocumentJsonValue
    data class ObjectValue(val fields: Map<String, DocumentJsonValue>) : DocumentJsonValue
    data class Bytes(val value: ByteArray) : DocumentJsonValue
    data object BooleanValue : DocumentJsonValue
    data object NullValue : DocumentJsonValue
}

private class DocumentJsonReader(private val input: ByteArray) {
    private var index = 0

    fun readObject(): DocumentJsonValue.ObjectValue {
        skipWhitespace()
        val result = readObjectValue()
        skipWhitespace()
        require(index == input.size) { "SYNC_DOCTOR_DOCUMENT_JSON_TRAILING_DATA" }
        return result
    }

    private fun readObjectValue(): DocumentJsonValue.ObjectValue {
        expect('{'.code)
        skipWhitespace()
        val fields = LinkedHashMap<String, DocumentJsonValue>()
        if (peek() == '}'.code) {
            index += 1
            return DocumentJsonValue.ObjectValue(fields)
        }
        while (true) {
            val key = readString()
            require(fields[key] == null) { "SYNC_DOCTOR_DOCUMENT_JSON_DUPLICATE_KEY" }
            skipWhitespace()
            expect(':'.code)
            skipWhitespace()
            fields[key] = if (key == "contentBase64") {
                DocumentJsonValue.Bytes(readBase64Bytes())
            } else {
                readValue()
            }
            skipWhitespace()
            when (peek()) {
                ','.code -> {
                    index += 1
                    skipWhitespace()
                }
                '}'.code -> {
                    index += 1
                    return DocumentJsonValue.ObjectValue(fields)
                }
                else -> throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_JSON_OBJECT_INVALID")
            }
        }
    }

    private fun readValue(): DocumentJsonValue {
        return when (peek()) {
            '"'.code -> DocumentJsonValue.Text(readString())
            '{'.code -> readObjectValue()
            '-'.code, in '0'.code..'9'.code -> DocumentJsonValue.Number(readNumber())
            't'.code -> {
                expectLiteral("true")
                DocumentJsonValue.BooleanValue
            }
            'f'.code -> {
                expectLiteral("false")
                DocumentJsonValue.BooleanValue
            }
            'n'.code -> {
                expectLiteral("null")
                DocumentJsonValue.NullValue
            }
            else -> throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_JSON_VALUE_INVALID")
        }
    }

    private fun readNumber(): Long {
        val start = index
        if (peek() == '-'.code) index += 1
        require(peek() in '0'.code..'9'.code) {
            "SYNC_DOCTOR_DOCUMENT_JSON_NUMBER_INVALID"
        }
        while (peek() in '0'.code..'9'.code) index += 1
        return try {
            String(input, start, index - start, StandardCharsets.US_ASCII).toLong()
        } catch (error: NumberFormatException) {
            throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_JSON_NUMBER_INVALID", error)
        }
    }

    private fun readString(): String {
        expect('"'.code)
        val accumulator = MutableByteAccumulator()
        try {
            while (index < input.size) {
                when (val current = input[index++].toInt() and 0xff) {
                    '"'.code -> return String(accumulator.toByteArray(), StandardCharsets.UTF_8)
                    '\\'.code -> readEscape(accumulator)
                    else -> {
                        require(current >= 0x20) {
                            "SYNC_DOCTOR_DOCUMENT_JSON_CONTROL_CHARACTER"
                        }
                        accumulator.append(current.toByte())
                    }
                }
            }
            throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_JSON_STRING_UNTERMINATED")
        } finally {
            accumulator.clear()
        }
    }

    private fun readBase64Bytes(): ByteArray {
        expect('"'.code)
        val accumulator = MutableByteAccumulator()
        try {
            while (index < input.size) {
                val current = input[index++].toInt() and 0xff
                if (current == '"'.code) {
                    val encoded = accumulator.toByteArray()
                    return try {
                        Base64.getDecoder().decode(encoded)
                    } catch (error: IllegalArgumentException) {
                        throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_BASE64_INVALID", error)
                    } finally {
                        encoded.fill(0)
                    }
                }
                require(current in BASE64_ASCII) {
                    "SYNC_DOCTOR_DOCUMENT_BASE64_ESCAPED_UNSUPPORTED"
                }
                accumulator.append(current.toByte())
            }
            throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_JSON_STRING_UNTERMINATED")
        } finally {
            accumulator.clear()
        }
    }

    private fun readEscape(accumulator: MutableByteAccumulator) {
        require(index < input.size) { "SYNC_DOCTOR_DOCUMENT_JSON_ESCAPE_INVALID" }
        when (val escaped = input[index++].toInt() and 0xff) {
            '"'.code, '\\'.code, '/'.code -> accumulator.append(escaped.toByte())
            'b'.code -> accumulator.append('\b'.code.toByte())
            'f'.code -> accumulator.append('\u000c'.code.toByte())
            'n'.code -> accumulator.append('\n'.code.toByte())
            'r'.code -> accumulator.append('\r'.code.toByte())
            't'.code -> accumulator.append('\t'.code.toByte())
            'u'.code -> {
                require(index + 4 <= input.size) {
                    "SYNC_DOCTOR_DOCUMENT_JSON_UNICODE_ESCAPE_INVALID"
                }
                var codePoint = 0
                repeat(4) {
                    codePoint = (codePoint shl 4) or hexValue(input[index++].toInt() and 0xff)
                }
                accumulator.append(
                    codePoint.toChar().toString().toByteArray(StandardCharsets.UTF_8),
                )
            }
            else -> throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_JSON_ESCAPE_INVALID")
        }
    }

    private fun hexValue(value: Int): Int = when (value) {
        in '0'.code..'9'.code -> value - '0'.code
        in 'a'.code..'f'.code -> value - 'a'.code + 10
        in 'A'.code..'F'.code -> value - 'A'.code + 10
        else -> throw IllegalArgumentException("SYNC_DOCTOR_DOCUMENT_JSON_UNICODE_ESCAPE_INVALID")
    }

    private fun expectLiteral(literal: String) {
        require(index + literal.length <= input.size) {
            "SYNC_DOCTOR_DOCUMENT_JSON_LITERAL_INVALID"
        }
        repeat(literal.length) { offset ->
            require(input[index + offset].toInt().toChar() == literal[offset]) {
                "SYNC_DOCTOR_DOCUMENT_JSON_LITERAL_INVALID"
            }
        }
        index += literal.length
    }

    private fun skipWhitespace() {
        while (index < input.size && input[index].toInt() and 0xff in WHITESPACE_ASCII) {
            index += 1
        }
    }

    private fun expect(expected: Int) {
        require(index < input.size && input[index].toInt() and 0xff == expected) {
            "SYNC_DOCTOR_DOCUMENT_JSON_SYNTAX_INVALID"
        }
        index += 1
    }

    private fun peek(): Int = if (index < input.size) input[index].toInt() and 0xff else -1

    companion object {
        private val WHITESPACE_ASCII = setOf(0x20, 0x09, 0x0a, 0x0d)
        private val BASE64_ASCII = ("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
            .map(Char::code)
            .toSet())
    }
}

private class MutableByteAccumulator(initialCapacity: Int = 256) {
    private var buffer = ByteArray(initialCapacity)
    private var size = 0

    fun append(value: Byte) {
        ensureCapacity(1)
        buffer[size++] = value
    }

    fun append(values: ByteArray) {
        ensureCapacity(values.size)
        values.copyInto(buffer, size)
        size += values.size
    }

    fun toByteArray(): ByteArray = buffer.copyOf(size)

    fun clear() {
        buffer.fill(0)
        size = 0
    }

    private fun ensureCapacity(additional: Int) {
        if (additional <= buffer.size - size) return
        var nextCapacity = buffer.size.coerceAtLeast(1)
        while (nextCapacity - size < additional) {
            nextCapacity = nextCapacity.coerceAtMost(Int.MAX_VALUE / 2) * 2
        }
        val next = buffer.copyOf(nextCapacity)
        buffer.fill(0)
        buffer = next
    }
}

class DoctorDocumentClient(private val session: SecureSession) {
    suspend fun view(documentId: String): InMemoryDoctorDocument {
        val payload = session.requestDoctorDocumentBytes(documentId)
        return try {
            DoctorDocumentStreamParser.parse(payload)
        } finally {
            payload.fill(0)
        }
    }

    suspend fun upload(request: JSONObject): JSONObject =
        session.requireLanDocumentUpload(request)
}

private suspend fun SecureSession.requireLanDocumentUpload(request: JSONObject): JSONObject {
    require(this is LanSyncHttpSession) {
        "SYNC_DOCTOR_DOCUMENT_UPLOAD_TRANSPORT_REQUIRED"
    }
    return uploadDoctorDocument(request)
}
