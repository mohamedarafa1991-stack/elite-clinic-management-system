# Elite Clinic UI Navigation and Android Mirror Redesign

## Goal

The clinic should open into a real workspace with separate feature tabs rather than one long page containing every feature. Windows and Android will use the same top-level feature vocabulary while adapting the navigation control to each form factor.

## Shared top-level tabs

| Tab             | Windows behavior                                         | Android behavior                                          | Primary content                                                                                      |
| --------------- | -------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Dashboard       | Sidebar tab with quick cards                             | Bottom navigation tab                                     | Today’s queue, doctors available today, billing snapshot, sync health, quick actions                 |
| Patients        | Sidebar tab; card grid plus selected profile detail      | Bottom navigation tab; card list plus detail screen       | Patient identity, contact data, appointments, visit/history summaries, role-controlled clinical data |
| Appointments    | Sidebar tab; calendar workspace                          | Bottom navigation tab; day/agenda calendar                | Calendar, check-in/arrival, appointment details, visit entry                                         |
| Doctors         | Sidebar tab; doctor profile card grid plus detail editor | Bottom navigation tab; doctor cards plus read/edit detail | Doctor identity, specialties, departments, qualifications, fee, room, license, documents             |
| Billing         | Sidebar or More tab                                      | More tab                                                  | Invoices, collected payments, outstanding balances, earnings/payouts according to role               |
| Reports         | Sidebar or More tab                                      | More tab                                                  | Monthly revenue and patient trends                                                                   |
| Documents       | Sidebar or More tab                                      | More tab                                                  | Secure doctor document vault; Android views streamed files and does not retain them                  |
| Sync & Settings | Sidebar or More tab                                      | More tab                                                  | Enrollment, LAN health, recovery, clinic settings                                                    |

## Interaction rules

The active workspace is rendered as one active panel. Switching tabs must not scroll the user through unrelated sections. A tab is a navigation state, not an anchor into a stacked page. Existing feature components can continue to scroll internally when their own content is longer than the viewport.

Every profile collection uses a search toolbar followed by responsive cards. Selecting a card opens a detail surface. On Windows, the detail surface sits beside or below the card grid. On Android, selecting a card opens a dedicated detail screen with a back affordance. No card should hide the stable identifier.

## Doctor card fields

Doctor cards show the doctor’s localized display name, specialty/department labels when available, active status, clinic room, consultation fee in EGP, license verification state, and a compact document count. The detail screen exposes the full editable profile for Admin and the signed-in doctor, while other users have view-only access. Documents remain stored on Windows and Android only streams them for viewing or upload through the secure session.

## Patient card fields

Patient cards show the sequential patient ID, localized name, phone, age or date of birth when recorded, completeness state, and active/archived status. The detail surface contains identity, contact, appointments, visit history, related persons, and clinical history only when the signed-in role has clinical-read capability.

## Android mirror boundary

The Android UI will mirror the Windows feature structure and labels, but its data must come from the encrypted local Room store and secure LAN sync. The current Android database stores only generic resource metadata and billing summaries. Therefore, a true data mirror requires first-class local entities for patients, appointments, doctor profiles, medical history/visit summaries, and dashboard aggregates, plus corresponding sync scopes/resource types. The first UI implementation may render zero-state cards honestly until those scopes have delivered data; it must not fabricate patient or doctor counts.

## Responsive navigation

Windows keeps the existing collapsible sidebar. Android uses a five-item bottom bar for Dashboard, Patients, Appointments, Doctors, and More. Billing, Reports, Documents, Sync, and Settings live under More so the primary bar remains usable on a phone. The current PIN/biometric gate remains before any clinical workspace is shown.

## Localization and accessibility

The tab labels and card headings use the existing English/Arabic locale model. The Windows shell keeps `dir="rtl"` for Arabic. Android uses the same bilingual labels and mirrors layout direction. Cards are keyboard/focus accessible on Windows and use clear pressed feedback on Android. Stable IDs use left-to-right rendering where appropriate.
