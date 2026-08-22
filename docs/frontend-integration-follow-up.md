# Frontend Integration Follow-up

## Status

This follow-up records the remaining frontend integration decisions after the cross-platform tab redesign, theme system, role-aware Windows offline copy, and Android preference controls.

## Waitlist feasibility

The waitlist is now implemented as a durable Windows Hub domain feature rather than a renderer-only shortcut. Migration 25 adds `waitlist_entries`; the shared contracts define `WaitlistEntry` and lifecycle transitions; the clinical service validates active patients, departments, doctors, and services; the IPC boundary parses every request; and the appointment workspace provides a receptionist-safe patient-first form after a conflict warning. Entries are auditable, versioned, and removable through explicit lifecycle actions.

The current scope intentionally keeps waitlist writes on the Windows Hub. The Android app remains a read-only mirror and does not yet synchronize waitlist entries or create appointments from them. A later mobile waitlist scope would need a signed synchronization payload, conflict policy, and a controlled conversion action that creates a normal appointment only after a real slot is selected. The current implementation does not invent priority or notification behavior; those are separate product decisions.

## Arabic coverage

The redesign's shell, dashboard controls, queue columns, patient lookup actions, appointment wizard labels, waitlist actions, billing quick actions, receipt actions, and Android primary tabs have bilingual coverage. Older patient-detail, related-person, medical-history, administrative, and some Android card labels still contain English-only or mixed-language copy. These surfaces should be migrated to a typed locale dictionary in a dedicated localization pass so Arabic RTL wording is consistent and can be regression-tested without changing clinical behavior.

## Android preferences

Android now persists language preference and visual theme preference in a dedicated UI-preferences store. The mirror workspace exposes English/Arabic tab labels and More-tab preference controls for Light, Dark, and High contrast. The encrypted database, PIN, biometric lock, `FLAG_SECURE`, and sync/session storage remain separate from these non-sensitive display preferences.
