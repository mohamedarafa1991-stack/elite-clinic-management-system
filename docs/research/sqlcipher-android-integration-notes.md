# SQLCipher Android Integration Notes

## Sources

1. Official SQLCipher Android repository: https://github.com/sqlcipher/sqlcipher-android
2. Official Zetetic integration guide: https://www.zetetic.net/sqlcipher/sqlcipher-for-android/

## Findings

The official SQLCipher Android README documents Maven Central usage with `net.zetetic:sqlcipher-android:4.17.0@aar` and `androidx.sqlite:sqlite:2.6.2`. It states that the native library must be loaded before database operations and that Room integration uses `net.zetetic.database.sqlcipher.SupportOpenHelperFactory` with a byte-array passphrase.

The official guide describes the same `SupportOpenHelperFactory` Room boundary and notes that the native SQLCipher library must be loaded before database use. The project’s Step 23 implementation therefore adds the SQLCipher AAR and AndroidX SQLite dependency, creates `EncryptedRoomFactory`, loads the native `sqlcipher` library, and obtains a random 32-byte passphrase wrapped by the Android Keystore-backed `DeviceKeyStore`.
