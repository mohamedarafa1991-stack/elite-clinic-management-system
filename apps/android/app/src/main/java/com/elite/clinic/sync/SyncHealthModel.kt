package com.elite.clinic.sync

enum class SyncHealthState(val storedValue: String) {
    RUNNING("running"),
    READY("ready"),
    RETRY_SCHEDULED("retry-scheduled"),
    BLOCKED("blocked"),
    ;

    companion object {
        fun fromStored(value: String): SyncHealthState =
            values().firstOrNull { it.storedValue == value } ?: BLOCKED
    }
}

object SyncHealthReasonCodes {
    const val CLAIM_EXPIRED = "SYNC_CLAIM_EXPIRED"
    const val OUTBOX_CLAIM_LOST = "SYNC_OUTBOX_CLAIM_LOST"
    const val TRANSIENT_FAILURE = "SYNC_TRANSIENT_FAILURE"
    const val TRANSPORT_NOT_PROVISIONED = "SYNC_TRANSPORT_NOT_PROVISIONED"
    const val PROFILE_INVALID = "SYNC_PROFILE_INVALID"
    const val TRANSPORT_UNAVAILABLE = "SYNC_TRANSPORT_UNAVAILABLE"
    const val SESSION_OPEN_UNAVAILABLE = "SYNC_SESSION_OPEN_UNAVAILABLE"
    const val DELTA_TRANSIENT_FAILURE = "SECURE_DELTA_TRANSIENT_FAILURE"
    const val OUTBOX_TRANSIENT_FAILURE = "SECURE_OUTBOX_TRANSIENT_FAILURE"
}
