package com.elite.clinic.security

import androidx.sqlite.db.SupportSQLiteOpenHelper
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

object EncryptedRoomFactory {
    fun create(deviceKeyStore: DeviceKeyStore): SupportSQLiteOpenHelper.Factory {
        System.loadLibrary("sqlcipher")
        val passphrase = deviceKeyStore.databasePassphrase()
        return SupportOpenHelperFactory(passphrase)
    }
}
