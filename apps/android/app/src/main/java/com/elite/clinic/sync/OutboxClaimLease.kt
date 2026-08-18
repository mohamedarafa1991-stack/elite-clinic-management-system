package com.elite.clinic.sync

import java.time.Instant

object OutboxClaimLease {
    const val LEASE_SECONDS = 120L

    fun expiresAt(claimedAt: Instant): Instant =
        claimedAt.plusSeconds(LEASE_SECONDS)

    fun isExpired(expiresAt: Instant, now: Instant): Boolean =
        !expiresAt.isAfter(now)
}
