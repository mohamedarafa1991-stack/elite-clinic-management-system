package com.elite.clinic.sync

import java.time.Instant
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OutboxClaimLeaseTest {
    @Test
    fun claimIsActiveBeforeLeaseBoundary() {
        val claimedAt = Instant.parse("2026-01-01T00:00:00Z")
        val expiresAt = OutboxClaimLease.expiresAt(claimedAt)
        assertFalse(
            OutboxClaimLease.isExpired(
                expiresAt,
                Instant.parse("2026-01-01T00:01:59Z"),
            ),
        )
    }

    @Test
    fun claimExpiresAtLeaseBoundary() {
        val claimedAt = Instant.parse("2026-01-01T00:00:00Z")
        val expiresAt = OutboxClaimLease.expiresAt(claimedAt)
        assertTrue(OutboxClaimLease.isExpired(expiresAt, expiresAt))
    }
}
