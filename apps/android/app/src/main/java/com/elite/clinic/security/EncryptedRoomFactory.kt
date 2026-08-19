package com.elite.clinic.security

import androidx.sqlite.db.SupportSQLiteOpenHelper
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

object EncryptedRoomFactory {
    fun create(deviceKeyStore: DeviceKeyStore): SupportSQLiteOpenHelper.Factory {
        System.loadLibrary("sqlcipher")
        val passphrase = deviceKeyStore.databasePassphrase()
        return try {
            // SQLCipher retains the supplied array inside its factory/helper and
            // needs it when Room first opens the database. Clear only the
            // DeviceKeyStore-owned source after handing SQLCipher an explicit copy.
            SupportOpenHelperFactory(passphrase.copyOf())
        } finally {
            passphrase.fill(0)
        }
    }
}
