package com.elite.clinic

import android.app.Application
import com.elite.clinic.data.EliteDatabase
import com.elite.clinic.security.AndroidIdentityKeyStore
import com.elite.clinic.security.DeviceKeyStore
import com.elite.clinic.sync.SecureSessionTransport
import com.elite.clinic.sync.SecureSyncCoordinator
import com.elite.clinic.sync.SyncRepository
import com.elite.clinic.sync.SyncWorker

class EliteApplication : Application() {
    lateinit var deviceKeyStore: DeviceKeyStore
        private set

    lateinit var identityKeyStore: AndroidIdentityKeyStore
        private set

    var database: EliteDatabase? = null
        private set

    val syncRepository: SyncRepository?
        get() = database?.let(::SyncRepository)

    var secureSyncCoordinator: SecureSyncCoordinator? = null
        private set

    fun configureSecureSyncCoordinator(
        deviceId: String,
        transportFactory: suspend () -> SecureSessionTransport?,
    ) {
        val encryptedDatabase = requireNotNull(database) {
            "ELITE_ANDROID_SYNC_DATABASE_REQUIRED: encrypted local database is required"
        }
        secureSyncCoordinator = SecureSyncCoordinator(
            database = encryptedDatabase,
            deviceId = deviceId,
            transportFactory = transportFactory,
        )
        SyncWorker.enqueuePeriodic(this)
        SyncWorker.enqueueNow(this)
    }

    fun clearSecureSyncCoordinator() {
        secureSyncCoordinator = null
        SyncWorker.cancel(this)
    }

    override fun onCreate() {
        super.onCreate()
        deviceKeyStore = DeviceKeyStore(this)
        identityKeyStore = AndroidIdentityKeyStore()
        // Intentionally do not open local patient storage until the Android
        // Keystore-backed encrypted Room boundary is configured in its own phase.
    }
}
