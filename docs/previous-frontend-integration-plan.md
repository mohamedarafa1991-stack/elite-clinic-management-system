# Previous Frontend Integration Plan

## Approved direction

The previous application’s frontend patterns will be integrated into the current Elite Clinic system without reviving its fragile classic-script or PouchDB architecture. The current React/Electron renderer, typed secure IPC, encrypted SQLite/SQLCipher stores, role permissions, audit trails, and secure Android synchronization remain authoritative.

The new experience will use a modern professional clinic interface with clear task language, strong visual hierarchy, familiar icons, responsive cards and tables, complete English/Arabic support, remembered language preference, and Admin-only technical diagnostics.

## Approved navigation and information architecture

| Area | Approved direction |
|---|---|
| Windows Dashboard | Default All/overview view with a Front Desk view and department filters |
| Waiting room | Three explicit columns: Waiting, In consultation, Completed |
| Windows navigation | Five-item primary navigation; secondary modules move under More |
| Android navigation | Mirror the Windows primary sections |
| Patients | Compact searchable table first; selected patient opens detail workspace |
| Patient detail | Overview, Visits, Appointments, Billing, Contacts; clinical Visits is permission-gated |
| Appointments | Guided wizard: patient → doctor/service → available time → confirmation |
| Visit type | Managed dropdown plus an Other option |
| Appointment status | Receptionist can check in, cancel, and mark no-show; clinical transitions remain role-controlled |
| Billing | Linked patient + appointment workflow; patient and appointment entry points both remain available |
| Receipt | Automatic receipt preview after payment, with Print/Save/Done actions |
| Offline messaging | User-facing “Saved on this computer” and “Offline — work is safe”; technical diagnostics only for Admin |
| Themes | Light, dark, and high-contrast accessibility themes |
| Language | Remember each user’s language preference; mirror RTL/LTR layout correctly |
| Clinical sub-tabs | Keep Visits; remove Investigations, Ultrasounds, and Previous pregnancies from the first integrated scope |

## Module priorities

### First receptionist release

The first release should prioritize **Patients, Appointments, Waiting Room, Billing/Receipts, Waitlist, and Conflict Warnings**. These are directly connected to front-desk work and should be visible through the simplified primary navigation or the Dashboard task launcher.

Waitlist entries should be easy to add when no suitable time is available. Conflict warnings should be understandable in plain language and should identify the patient, doctor, room, and conflicting time. The receptionist should be offered safe alternatives rather than an unexplained validation failure.

### Admin and manager operations

**Departments, rooms, working hours, slot configuration, reminders, service catalog, reports, staff, audit, and backup** should remain available under protected secondary areas. They should not be part of a receptionist’s default view. Admin settings should use the same modern visual language but can expose more advanced detail after an explicit navigation choice.

Reports should be available to Admin and authorized managers. Drugs should be an Admin/clinical module rather than a front-desk primary item. Staff, audit, backup, enrollment, recovery, and technical sync controls are Admin-only.

### Android boundary

Android mirrors the Windows primary structure and labels. The app must use local encrypted data for offline views and must never fabricate missing records. Receptionist write workflows on Android should be added only when the secure sync/outbox behavior is ready; until then, Android should label unsupported actions clearly instead of displaying misleading buttons.

## Visual system

The visual direction is **Cairo Calm Modern**: soft neutral surfaces, teal/blue clinic accents, high-contrast text, restrained shadows, rounded but not playful cards, consistent 8-point spacing, and readable type at normal Windows scaling and Android accessibility sizes.

Icons should be recognizable at a glance and paired with text. Color must never be the only status signal; every queue state includes a readable label. Patient numbers, invoice numbers, phone numbers, and other identifiers retain left-to-right rendering even in Arabic mode.

The Dashboard should emphasize the next action, not system internals. Receptionists see patient names before identifiers, clear action verbs, small explanations, and confirmation messages after every state-changing operation.

## Non-negotiable safety rules

The existing permission boundaries remain unchanged. Receptionists do not receive clinical-record access merely because a new card or tab is added. Sensitive documents remain controlled. A frontend redesign must not weaken typed IPC validation, secure sessions, encrypted storage, audit events, backup/restore protections, or offline synchronization guarantees.

No feature should display an inaccessible destination. No workflow should rely on manually typing a patient number when a verified patient search can be used. No critical action should end without a visible success or failure message and a practical next step.
