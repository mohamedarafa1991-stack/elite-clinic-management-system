package com.elite.clinic.security

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ZeroizableBytesTest {
    @Test
    fun closeOverwritesOwnedBytesAndIsIdempotent() {
        val original = byteArrayOf(1, 2, 3, 4)
        val owned = ZeroizableBytes.adopt(original)

        assertEquals(4, owned.size)
        assertFalse(owned.isCleared)
        assertArrayEquals(byteArrayOf(1, 2, 3, 4), owned.copyForUse())

        owned.close()
        owned.close()

        assertTrue(owned.isCleared)
        assertEquals(0, owned.size)
        assertArrayEquals(byteArrayOf(0, 0, 0, 0), original)
    }

    @Test
    fun accessAfterCloseIsRejected() {
        val owned = ZeroizableBytes.adopt(byteArrayOf(7, 8, 9))
        owned.close()

        assertSecurityFailure("SECURE_BYTES_CLEARED") {
            owned.use { it[0] }
        }
        assertSecurityFailure("SECURE_BYTES_CLEARED") {
            owned.copyForUse()
        }
    }

    @Test
    fun scopedBorrowIsClearedWhenCallbackSucceedsOrThrows() {
        val successful = byteArrayOf(11, 12, 13)
        val result = withZeroizedBytes(successful) { bytes ->
            bytes.sum()
        }
        assertEquals(36, result)
        assertArrayEquals(byteArrayOf(0, 0, 0), successful)

        val failing = byteArrayOf(21, 22, 23)
        assertSecurityFailure("expected failure") {
            withZeroizedBytes(failing) {
                throw IllegalStateException("expected failure")
            }
        }
        assertArrayEquals(byteArrayOf(0, 0, 0), failing)
    }

    @Test
    fun boundedBufferSealsContentsAndRejectsReuse() {
        val buffer = ZeroizableByteBuffer(maxSize = 8, initialCapacity = 2)
        buffer.append(byteArrayOf(1, 2, 3), offset = 0, count = 3)
        buffer.append(byteArrayOf(4, 5), offset = 0, count = 2)

        val sealed = buffer.seal()
        assertEquals(5, sealed.size)
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5), sealed.copyForUse())
        assertSecurityFailure("SECURE_BUFFER_CLOSED") {
            buffer.append(byteArrayOf(6))
        }

        sealed.close()
    }

    @Test
    fun bufferCloseClearsStorageAndOverflowClosesIt() {
        val source = byteArrayOf(31, 32, 33, 34)
        val buffer = ZeroizableByteBuffer(maxSize = 8, initialCapacity = 4)
        buffer.append(source)
        buffer.close()
        assertEquals(0, buffer.size)
        assertSecurityFailure("SECURE_BUFFER_CLOSED") {
            buffer.seal()
        }

        val overflow = ZeroizableByteBuffer(maxSize = 3, initialCapacity = 2)
        assertSecurityFailure("SECURE_BUFFER_SIZE_EXCEEDED") {
            overflow.append(byteArrayOf(41, 42, 43, 44))
        }
        assertSecurityFailure("SECURE_BUFFER_CLOSED") {
            overflow.append(byteArrayOf(45))
        }
    }

    @Test
    fun bufferSealTransfersOnlyTheUsedBytes() {
        val buffer = ZeroizableByteBuffer(maxSize = 16, initialCapacity = 8)
        buffer.append(byteArrayOf(51, 52, 53))

        val sealed = buffer.seal()
        assertEquals(3, sealed.size)
        assertArrayEquals(byteArrayOf(51, 52, 53), sealed.copyForUse())
        sealed.close()
    }

    private fun assertSecurityFailure(expectedMessage: String, block: () -> Unit) {
        try {
            block()
            throw AssertionError("Expected failure: $expectedMessage")
        } catch (error: IllegalStateException) {
            assertEquals(expectedMessage, error.message)
        } catch (error: IllegalArgumentException) {
            assertEquals(expectedMessage, error.message)
        }
    }
}
