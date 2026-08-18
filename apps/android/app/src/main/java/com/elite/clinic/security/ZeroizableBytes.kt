package com.elite.clinic.security

/**
 * Owns a mutable byte array and overwrites it when closed.
 *
 * This is best-effort cleanup for mutable JVM memory; it is not a forensic
 * erasure guarantee for managed-runtime or native copies.
 */
class ZeroizableBytes private constructor(
    private var value: ByteArray?,
) : AutoCloseable {
    val size: Int
        get() = value?.size ?: 0

    val isCleared: Boolean
        get() = value == null

    fun <T> use(block: (ByteArray) -> T): T = block(requireOpen())

    fun copyForUse(): ByteArray = use { it.copyOf() }

    override fun close() {
        val bytes = value ?: return
        bytes.fill(0)
        value = null
    }

    private fun requireOpen(): ByteArray = value
        ?: throw IllegalStateException("SECURE_BYTES_CLEARED")

    companion object {
        fun adopt(bytes: ByteArray): ZeroizableBytes = ZeroizableBytes(bytes)
    }
}

/**
 * A bounded mutable accumulator that transfers ownership exactly once through
 * [seal]. Its backing storage is overwritten on close, overflow, or failure.
 */
class ZeroizableByteBuffer(
    private val maxSize: Int,
    initialCapacity: Int = DEFAULT_INITIAL_CAPACITY,
) : AutoCloseable {
    private var buffer: ByteArray? = ByteArray(
        initialCapacity.coerceIn(1, maxSize.coerceAtLeast(1)),
    )
    private var length = 0
    private var closed = false

    init {
        require(maxSize > 0) { "SECURE_BUFFER_MAX_SIZE_INVALID" }
        require(initialCapacity > 0) { "SECURE_BUFFER_INITIAL_CAPACITY_INVALID" }
    }

    val size: Int
        get() = length

    fun append(source: ByteArray, offset: Int = 0, count: Int = source.size): ZeroizableByteBuffer {
        requireOpen()
        require(offset >= 0 && count >= 0 && offset <= source.size - count) {
            "SECURE_BUFFER_SOURCE_RANGE_INVALID"
        }
        if (count > maxSize - length) {
            close()
            throw IllegalArgumentException("SECURE_BUFFER_SIZE_EXCEEDED")
        }
        ensureCapacity(length + count)
        val destination = buffer ?: error("SECURE_BUFFER_CLOSED")
        source.copyInto(destination, destinationOffset = length, startIndex = offset, endIndex = offset + count)
        length += count
        return this
    }

    fun seal(): ZeroizableBytes {
        requireOpen()
        require(length > 0) { "SECURE_BUFFER_EMPTY" }
        val source = buffer ?: error("SECURE_BUFFER_CLOSED")
        val result = source.copyOf(length)
        source.fill(0)
        buffer = null
        length = 0
        closed = true
        return ZeroizableBytes.adopt(result)
    }

    override fun close() {
        val current = buffer ?: run {
            closed = true
            length = 0
            return
        }
        current.fill(0)
        buffer = null
        length = 0
        closed = true
    }

    private fun requireOpen() {
        check(!closed && buffer != null) { "SECURE_BUFFER_CLOSED" }
    }

    private fun ensureCapacity(required: Int) {
        val current = buffer ?: error("SECURE_BUFFER_CLOSED")
        if (required <= current.size) return
        var nextCapacity = current.size
        while (nextCapacity < required) {
            nextCapacity = (nextCapacity * 2).coerceAtMost(maxSize)
            if (nextCapacity == current.size) break
        }
        if (nextCapacity < required) {
            close()
            throw IllegalArgumentException("SECURE_BUFFER_SIZE_EXCEEDED")
        }
        val replacement = ByteArray(nextCapacity)
        current.copyInto(replacement, endIndex = length)
        current.fill(0)
        buffer = replacement
    }

    private companion object {
        const val DEFAULT_INITIAL_CAPACITY = 64 * 1024
    }
}

/**
 * Clears a mutable array after the callback returns or throws. The caller must
 * own [bytes] for the duration of this function.
 */
inline fun <T> withZeroizedBytes(
    bytes: ByteArray,
    block: (ByteArray) -> T,
): T = try {
    block(bytes)
} finally {
    bytes.fill(0)
}
