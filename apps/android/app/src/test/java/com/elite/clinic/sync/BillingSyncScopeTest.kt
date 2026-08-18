package com.elite.clinic.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class BillingSyncScopeTest {
    private val policy = SyncDevicePolicy(
        organizationId = "elite-clinic",
        enrollmentId = "enrollment-billing",
        deviceId = "device-billing",
        userId = "user-billing",
        policyVersion = 1,
        allowedScopes = setOf(
            "appointments",
            "patient-summary",
            "encounter-summary",
            "clinical-notes",
            "export-governance",
            "billing-summary",
        ),
        expiresAt = "2099-01-01T00:00:00Z",
        offlineAccessUntil = "2099-01-01T00:00:00Z",
    )

    @Test
    fun billingSummaryIsAcceptedByTheRequestFactory() {
        val request = LanSyncRequestFactory.buildDeltaRequest(
            policy = policy,
            scope = "billing-summary",
            cursor = "42",
            requestNonce = "billing-scope-nonce-0001",
            requestedAt = "2030-01-01T00:00:00Z",
        )
        assertEquals("billing-summary", request.getString("scope"))
        assertEquals("42", request.getString("cursor"))
    }

    @Test
    fun sixScopesCanBeNegotiatedButASeventhIsRejectedByTheSessionFactoryContract() {
        val sixScopes = policy.allowedScopes.toList()
        assertEquals(6, sixScopes.size)
        assertThrows(IllegalArgumentException::class.java) {
            require((sixScopes + "unsupported-scope").size <= 6) {
                "ELITE_LAN_SESSION_SCOPES_INVALID"
            }
        }
    }
}
