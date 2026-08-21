# Frontend Integration Follow-up

## Status

This follow-up records the remaining frontend integration decisions after the cross-platform tab redesign, theme system, role-aware Windows offline copy, and Android preference controls.

## Waitlist feasibility

A durable waitlist is **not safe to implement as a renderer-only feature** in the current repository. The appointment contract currently permits only `scheduled`, `arrived`, `in-consultation`, `completed`, `cancelled`, `no-show`, and `rescheduled` statuses. The create input also requires a scheduled start and has no waitlist state or priority fields. The clinical service rejects overlapping appointments and persists only normal scheduled appointments.

A production-ready waitlist therefore needs a versioned domain change before the UI is exposed. The next design should add a `WaitlistEntry` resource with patient, department, optional doctor/service, requested visit type, preferred date or time window, priority, status, notes, audit timestamps, and cancellation/completion reasons. It should also add capability checks, database migration, signed LAN synchronization, conflict handling, and a receptionist-safe conversion action that creates a normal appointment only after a real slot is selected. Until those pieces exist, the appointment wizard must continue to show a conflict warning rather than pretending that a waitlisted record was saved.

## Arabic coverage

The redesign's shell, dashboard controls, queue columns, patient lookup actions, appointment wizard labels, billing quick actions, receipt actions, and Android primary tabs have bilingual coverage. The older patient detail, registration, related-person, medical-history, and some billing form copy still contains English-only labels. These surfaces should be migrated to a typed locale dictionary in a dedicated localization pass so that Arabic RTL wording is consistent and can be regression-tested without changing clinical behavior.

## Android preferences

Android now persists language preference and visual theme preference in a dedicated UI-preferences store. The mirror workspace exposes English/Arabic tab labels and More-tab preference controls for Light, Dark, and High contrast. The encrypted database, PIN, biometric lock, `FLAG_SECURE`, and sync/session storage remain separate from these non-sensitive display preferences.
