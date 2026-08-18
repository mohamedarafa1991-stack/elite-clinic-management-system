package com.elite.clinic

import android.app.Application
import com.elite.clinic.data.EliteDatabase
import com.elite.clinic.security.AndroidIdentityKeyStore
import com.elite.clinic.security.DeviceKeyStore
import com.elite.clinic.security.EncryptedRoomFactory
import androidx.sqlite.db.SupportSQLiteOpenHelper
import com.elite.clinic.data.LocalOutboxEvent
import com.elite.clinic.sync.LanSyncRequestFactory
import com.elite.clinic.sync.LanSyncSessionFactory
import com.elite.clinic.sync.SecureSessionTransport
import com.elite.clinic.sync.SecureSyncCoordinator
import com.elite.clinic.sync.SyncConnectionProfileRepository
import com.elite.clinic.sync.SyncRepository
import com.elite.clinic.sync.SyncWorker
import org.json.JSONObject

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

    fun initializeEncryptedDatabase(encryptedFactory: SupportSQLiteOpenHelper.Factory) {
        if (database == null) {
            database = EliteDatabase.create(this, deviceKeyStore, encryptedFactory)
        }
    }

    fun configureSecureSyncCoordinator(
        deviceId: String,
        transportFactory: suspend () -> SecureSessionTransport?,
        profileRepository: SyncConnectionProfileRepository? = database?.let {
            SyncConnectionProfileRepository(it.syncDao())
        },
    ) {
        val encryptedDatabase = requireNotNull(database) {
            "ELITE_ANDROID_SYNC_DATABASE_REQUIRED: encrypted local database is required"
        }
        secureSyncCoordinator = SecureSyncCoordinator(
            database = encryptedDatabase,
            deviceId = deviceId,
            transportFactory = transportFactory,
            profileProvider = {
                profileRepository?.getActive(deviceId)
            },
            healthRepository = SyncHealthRepository(
                encryptedDatabase.syncDao(),
                deviceId,
            ),
        )
        SyncWorker.enqueuePeriodic(this)
        SyncWorker.enqueueNow(this)
    }

    fun configureLanSecureSyncCoordinator(
        deviceId: String,
        outboxScopeResolver: (LocalOutboxEvent) -> String = LanSyncRequestFactory::scopeForEvent,
        outboxReason: String = "offline-local-operation",
    ) {
        val encryptedDatabase = requireNotNull(database) {
            "ELITE_ANDROID_SYNC_DATABASE_REQUIRED: encrypted local database is required"
        }
        val profileRepository = SyncConnectionProfileRepository(encryptedDatabase.syncDao())
        configureSecureSyncCoordinator(
            deviceId = deviceId,
            transportFactory = {
                val active = profileRepository.getActive(deviceId)
                if (active == null) {
                    null
                } else {
                    object : SecureSessionTransport {
                        override suspend fun openSession() = LanSyncSessionFactory(
                            baseUrl = active.entity.hubBaseUrl,
                            identityKeyStore = identityKeyStore,
                            hubTlsCertificatePem = active.entity.hubTlsCertificatePem,
                            trustedHubPublicKeyPem = active.entity.hubTrustAnchorPem,
                            policy = active.policy,
                            outboxScopeResolver = outboxScopeResolver,
                            outboxReason = outboxReason,
                        ).createSession()
                    }
                }
            },
            profileRepository = profileRepository,
        )
    }

    suspend fun requestDoctorDocument(deviceId: String, documentId: String): JSONObject {
        val encryptedDatabase = requireNotNull(database) {
            "ELITE_ANDROID_SYNC_DATABASE_REQUIRED: encrypted local database is required"
        }
        val profile = SyncConnectionProfileRepository(encryptedDatabase.syncDao()).getActive(deviceId)
            ?: throw IllegalStateException("ELITE_ANDROID_SYNC_PROFILE_UNAVAILABLE")
        val session = LanSyncSessionFactory(
            baseUrl = profile.entity.hubBaseUrl,
            identityKeyStore = identityKeyStore,
            hubTlsCertificatePem = profile.entity.hubTlsCertificatePem,
            trustedHubPublicKeyPem = profile.entity.hubTrustAnchorPem,
            policy = profile.policy,
            outboxScopeResolver = LanSyncRequestFactory::scopeForEvent,
        ).createSession()
        return try {
            session.requestDoctorDocument(documentId)
        } finally {
            session.close()
        }
    }

    suspend fun uploadDoctorDocument(deviceId: String, request: JSONObject): JSONObject {
        val encryptedDatabase = requireNotNull(database) {
            "ELITE_ANDROID_SYNC_DATABASE_REQUIRED: encrypted local database is required"
        }
        val profile = SyncConnectionProfileRepository(encryptedDatabase.syncDao()).getActive(deviceId)
            ?: throw IllegalStateException("ELITE_ANDROID_SYNC_PROFILE_UNAVAILABLE")
        val session = LanSyncSessionFactory(
            baseUrl = profile.entity.hubBaseUrl,
            identityKeyStore = identityKeyStore,
            hubTlsCertificatePem = profile.entity.hubTlsCertificatePem,
            trustedHubPublicKeyPem = profile.entity.hubTrustAnchorPem,
            policy = profile.policy,
            outboxScopeResolver = LanSyncRequestFactory::scopeForEvent,
        ).createSession()
        return try {
            session.uploadDoctorDocument(request)
        } finally {
            session.close()
        }
    }

    fun retrySecureSyncNow() {
        SyncWorker.enqueueRetryNow(this)
    }

    fun clearSecureSyncCoordinator() {
        secureSyncCoordinator = null
        SyncWorker.cancel(this)
    }

    override fun onCreate() {
        super.onCreate()
        deviceKeyStore = DeviceKeyStore(this)
        identityKeyStore = AndroidIdentityKeyStore()
        initializeEncryptedDatabase(EncryptedRoomFactory.create(deviceKeyStore))
    }
}
