package com.elite.clinic

import android.app.Application
import com.elite.clinic.data.EliteDatabase
import com.elite.clinic.security.DeviceKeyStore

class EliteApplication : Application() {
    lateinit var deviceKeyStore: DeviceKeyStore
        private set

    var database: EliteDatabase? = null
        private set

    override fun onCreate() {
        super.onCreate()
        deviceKeyStore = DeviceKeyStore(this)
        // Intentionally do not open local patient storage until the Android
        // Keystore-backed encrypted Room boundary is configured in its own phase.
    }
}
