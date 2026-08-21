package com.elite.clinic

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.elite.clinic.security.AppUnlockStore

class MainActivity : FragmentActivity() {
    private lateinit var unlockStore: AppUnlockStore
    private var pinConfigured by mutableStateOf(false)
    private var unlocked by mutableStateOf(false)
    private var unlockError by mutableStateOf<String?>(null)
    private var lastInteractionAt = SystemClock.elapsedRealtime()
    private val inactivityHandler = Handler(Looper.getMainLooper())
    private val inactivityLock = Runnable {
        if (SystemClock.elapsedRealtime() - lastInteractionAt >= INACTIVITY_TIMEOUT_MS) {
            lockWorkspace()
        } else {
            scheduleInactivityLock()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val application = application as EliteApplication
        unlockStore = AppUnlockStore(this, application.deviceKeyStore)
        pinConfigured = unlockStore.isPinConfigured()
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    when {
                        application.database == null -> FoundationScreen(databaseReady = false)
                        !pinConfigured -> PinSetupScreen(
                            error = unlockError,
                            onSave = ::configurePin,
                        )
                        !unlocked -> UnlockScreen(
                            error = unlockError,
                            biometricAvailable = canUseBiometric(),
                            onPin = ::unlockWithPin,
                            onBiometric = ::launchBiometricPrompt,
                        )
                        else -> DoctorDocumentWorkspace(application)
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (pinConfigured) {
            lockWorkspace()
            launchBiometricPrompt()
        }
        scheduleInactivityLock()
    }

    override fun onPause() {
        inactivityHandler.removeCallbacks(inactivityLock)
        if (pinConfigured) lockWorkspace()
        super.onPause()
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        lastInteractionAt = SystemClock.elapsedRealtime()
        scheduleInactivityLock()
    }

    private fun configurePin(pin: String, confirmation: String) {
        if (pin != confirmation) {
            unlockError = "PIN entries do not match"
            return
        }
        runCatching { unlockStore.setPin(pin) }
            .onSuccess {
                pinConfigured = true
                unlocked = true
                unlockError = null
                lastInteractionAt = SystemClock.elapsedRealtime()
                scheduleInactivityLock()
            }
            .onFailure { unlockError = it.message ?: "PIN could not be stored" }
    }

    private fun unlockWithPin(pin: String) {
        if (unlockStore.verifyPin(pin)) {
            unlocked = true
            unlockError = null
            lastInteractionAt = SystemClock.elapsedRealtime()
            scheduleInactivityLock()
        } else {
            unlockError = "Incorrect PIN"
        }
    }

    private fun canUseBiometric(): Boolean = BiometricManager.from(this).canAuthenticate(AUTHENTICATORS) ==
        BiometricManager.BIOMETRIC_SUCCESS

    private fun launchBiometricPrompt() {
        if (!pinConfigured || !canUseBiometric()) return
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    unlocked = true
                    unlockError = null
                    lastInteractionAt = SystemClock.elapsedRealtime()
                    scheduleInactivityLock()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    unlockError = errString.toString()
                }
            },
        )
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock Elite Clinic")
                .setSubtitle("Authenticate to view clinic data")
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build(),
        )
    }

    private fun lockWorkspace() {
        if (pinConfigured) {
            unlocked = false
            unlockError = null
        }
    }

    private fun scheduleInactivityLock() {
        inactivityHandler.removeCallbacks(inactivityLock)
        if (!pinConfigured || !unlocked) return
        inactivityHandler.postDelayed(inactivityLock, INACTIVITY_TIMEOUT_MS)
    }

    private companion object {
        const val INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000L
        val AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
    }
}

@androidx.compose.runtime.Composable
private fun PinSetupScreen(error: String?, onSave: (String, String) -> Unit) {
    var pin by androidx.compose.runtime.remember { mutableStateOf("") }
    var confirmation by androidx.compose.runtime.remember { mutableStateOf("") }
    LockSurface(title = "Create app PIN", error = error) {
        OutlinedTextField(
            value = pin,
            onValueChange = { pin = it.filter(Char::isDigit).take(12) },
            label = { Text("PIN (4–12 digits)") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = confirmation,
            onValueChange = { confirmation = it.filter(Char::isDigit).take(12) },
            label = { Text("Confirm PIN") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        )
        Button(
            onClick = { onSave(pin, confirmation) },
            enabled = pin.length in 4..12 && confirmation.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) { Text("Save PIN") }
    }
}

@androidx.compose.runtime.Composable
private fun UnlockScreen(
    error: String?,
    biometricAvailable: Boolean,
    onPin: (String) -> Unit,
    onBiometric: () -> Unit,
) {
    var pin by androidx.compose.runtime.remember { mutableStateOf("") }
    LockSurface(title = "Unlock Elite Clinic", error = error) {
        OutlinedTextField(
            value = pin,
            onValueChange = { pin = it.filter(Char::isDigit).take(12) },
            label = { Text("App PIN") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { onPin(pin) },
            enabled = pin.length in 4..12,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) { Text("Unlock with PIN") }
        if (biometricAvailable) {
            Button(
                onClick = onBiometric,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) { Text("Use biometric or device unlock") }
        }
    }
}

@androidx.compose.runtime.Composable
private fun LockSurface(title: String, error: String?, content: @androidx.compose.runtime.Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Text(
            "Clinic information stays protected while the app is locked.",
            modifier = Modifier.padding(top = 12.dp),
            style = MaterialTheme.typography.bodyLarge,
        )
        Column(modifier = Modifier.fillMaxWidth().padding(top = 24.dp)) {
            content()
        }
        if (error != null) {
            Text(
                error,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
    }
}

@androidx.compose.runtime.Composable
private fun FoundationScreen(databaseReady: Boolean) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Elite Clinic Management System",
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            text = if (databaseReady) {
                "Encrypted local store ready"
            } else {
                "Secure foundation initialized — encrypted local store pending configuration"
            },
            modifier = Modifier.padding(top = 12.dp),
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}
