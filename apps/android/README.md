# Elite Android Client

The Android client is a native Kotlin/Jetpack Compose application for staff and clinicians. It is local-first and must remain usable when the internet, clinic LAN, or both are unavailable.

The local database is the source of truth for the Android UI. Writes are recorded locally and added to an outbox. WorkManager drains synchronization work when the Hub becomes reachable, using retry and backoff. The Hub returns acknowledgments, rejections, or conflicts. Signed clinical records are amended rather than silently overwritten.

The client requires an Admin-approved named device, an Elite PIN, optional biometric unlock, an inactivity lock with a ten-minute default, a thirty-day offline-access expiry, encrypted local patient data, private media storage, no system backup of protected data where technically possible, and a visible warning that an offline device cannot be remotely wiped.

The provisional minimum is Android 10/API 29, pending an inventory of the clinic’s actual phones and tablets. The final build must use the current supported target API, a protected Admin-owned signing keystore, signed APKs, checksum/signature verification, an Admin-controlled update prompt, and rollback support.
