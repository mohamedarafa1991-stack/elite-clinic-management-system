# Step 20 Research Notes

## Android Keystore

Android Keystore keeps key material non-exportable and allows applications to restrict how and when a key can be used. Android documents that Keystore-backed keys can be protected from extraction and can be authorized for specific cryptographic purposes, temporal windows, and user-authentication requirements [1]. StrongBox may provide stronger hardware isolation when supported, but it has narrower algorithm support and performance trade-offs; the application should detect availability and use it as an optional hardening path rather than a universal requirement [1].

For Elite Clinic, Step 20 should use Android Keystore to protect a locally generated data-encryption key or key-wrapping key. The Windows Hub private signing key must not be imported into Android. Keystore operations should run off the main thread, and the app should record only non-sensitive key alias and security-level metadata.

## BiometricPrompt

Android recommends BiometricPrompt for system-managed biometric authentication and distinguishes strong biometrics from device credentials. The application should call `canAuthenticate()` with the exact allowed authenticator set and handle unavailable hardware, missing enrollment, and unsupported combinations on API 29 and lower [2].

Android also documents binding cryptographic operations to authentication through `CryptoObject` and auth-per-use or time-window key authorizations. Auth-per-use keys are appropriate for high-value operations, while a short validity window can support repeated local unlocks without prompting for every read [1] [2].

For Elite Clinic, the default should remain a PIN or Elite credential as the recovery path, with optional strong biometric unlock. Sensitive actions such as accepting a trust anchor, accepting a status-package replacement, or opening protected patient data should use explicit step-up authentication rather than silent biometric authorization.

## Step 20 planning implication

After Step 19 establishes Android status-package verification, the highest-value Step 20 scope is the **Android secure local session and device-enrollment foundation**. This enables the mobile app to protect its local Room data, enforce the existing named-device and offline-access requirements, establish inactivity locking, and provide a safe base for later clinical synchronization. It should not yet attempt broad patient-data synchronization.

## References

[1]: https://developer.android.com/privacy-and-security/keystore "Android Developers — Android Keystore system"
[2]: https://developer.android.com/identity/sign-in/biometric-auth "Android Developers — Show a biometric authentication dialog"
