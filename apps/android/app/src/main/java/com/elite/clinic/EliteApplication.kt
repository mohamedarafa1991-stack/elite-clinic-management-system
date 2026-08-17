package com.elite.clinic

import android.app.Application
import com.elite.clinic.data.EliteDatabase
import com.elite.clinic.security.AndroidIdentityKeyStore
import com.elite.clinic.security.DeviceKeyStore
import com.elite.clinic.sync.SyncRepository

class EliteApplication : Application() {
    lateinit var deviceKeyStore: DeviceKeyStore
        private set

    lateinit var identityKeyStore: AndroidIdentityKeyStore
        private set

    var database: EliteDatabase? = null
        private set

    val syncRepository: SyncRepository?
        get() = database?.let(::SyncRepository)

    override fun onCreate() {
        super.onCreate()
        deviceKeyStore = DeviceKeyStore(this)
        identityKeyStore = AndroidIdentityKeyStore()
        // Intentionally do not open local patient storage until the Android
        // Keystore-backed encrypted Room boundary is configured in its own phase.
    }
}
