# Elite Clinic Management System — Project Instructions

Elite handles sensitive medical, identity, financial, staff, and communication data. Never use real patient data, real national IDs, real phone numbers, real clinical notes, or real media in development, tests, screenshots, fixtures, or logs. Use synthetic fixtures only.

The Windows application is an Electron desktop client and optional manually started local Hub. The Android application is a native Kotlin/Jetpack Compose client with an encrypted local store and offline synchronization. The Hub is the canonical coordination point when connected; devices remain usable locally when disconnected.

Maintain strict Electron boundaries: context isolation on, Node integration off in the renderer, sandbox where compatible, restrictive CSP, allowlisted typed preload APIs, sender validation, navigation restrictions, and no arbitrary filesystem/database access from the renderer. Sensitive values must not be placed in source control, renderer localStorage, logs, or unencrypted test artifacts.

All domain changes must be represented by versioned contracts and database migrations. Signed clinical records are amended rather than silently overwritten. Every synchronization conflict must preserve both versions and be routed to the Admin conflict queue. Patient deletion is soft deletion by default.

Every clinical rule, drug warning, lab range, ultrasound calculation, specialty module, and reference catalog requires source/version metadata, test cases, and Doctor approval before it may be enabled for production use. Product developers are not the sole clinical approvers.

Before any implementation phase that changes data storage or synchronization, update the migration and threat-model documentation first. Before production, perform a clean-device restore test, device revocation test, offline expiry test, conflict test, and bilingual workflow review.
