# Elite Clinic — Busy-Day Receptionist Manual Audit

**Author:** Manus AI

## Scope and method

This audit exercised the real Electron desktop application as a first-time front-desk operator would use it during a busy day. All entered data was synthetic and created only in the development in-memory database. The audit used the visible application interface rather than direct service calls for the patient, appointment, waitlist, check-in, billing, receipt, refund, language, and theme scenarios.

The audit was performed with an Admin account because the fresh installation exposes bootstrap and Admin sign-in but does not expose a supported staff-account provisioning workflow. A real Receptionist-role sign-in could therefore not be created through the normal UI. Role-specific behavior remains a deployment blocker and is called out separately below. This report does not claim Windows installation, Android device, LAN, recovery, printer, or physical-pilot completion.

## Synthetic scenarios exercised

| Area                     | Synthetic scenario                                                                     | Result                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient registration     | Mariam Hassan, EL-00001, synthetic phone `01000000001`                                 | Quick registration succeeded.                                                                                                                              |
| Duplicate protection     | Immediate second registration of the same synthetic patient                            | Duplicate-review panel blocked the save and showed match signals, score, reason, Cancel, and Create another patient.                                       |
| Full Arabic registration | Layla Mahmoud, EL-00002, `ليلى محمود`, DOB `1995-04-10`, female, synthetic national ID | Full registration succeeded; patient list showed Complete and localized date formatting.                                                                   |
| Patient profile          | Overview, Visits, Appointments, Payments, Contacts                                     | Profile opened and tabs were present. Appointments and Payments delegated to their workspaces; Contacts showed no linked persons and no inline add action. |
| Configuration            | Synthetic General Medicine specialty, department, General Consultation service         | All three could be created from the visible appointment configuration controls.                                                                            |
| Appointment booking      | Mariam, General Medicine, General Consultation, 25 Aug 2026 at 10:30                   | Booking succeeded even though no doctor profile or schedule existed.                                                                                       |
| Appointment status       | Check-in on the scheduled appointment                                                  | Status changed from Scheduled to Arrived and the success message was clear.                                                                                |
| Waitlist                 | Mariam, General Medicine, 25 Aug 2026 at 10:30, synthetic note                         | Entry saved after clinic area selection; Contacted action worked and removed it from the active list.                                                      |
| Billing                  | Synthetic paid Standard Consultation package at EGP 500                                | Invoice `EL-INV-000001` created.                                                                                                                           |
| Payment and receipt      | EGP 500 cash payment with synthetic reference                                          | Payment succeeded and receipt preview `EL-REC-000001` rendered with Print / save PDF.                                                                      |
| Refund                   | EGP 500 correction with synthetic reason                                               | Invoice reconciled to refunded with EGP 500 balance.                                                                                                       |
| Arabic and RTL           | Billing and patient workspaces                                                         | RTL applied and main navigation translated; mixed English remained in important operational copy.                                                          |
| Theme                    | Dark theme                                                                             | Theme switched successfully without a visible functional failure during the quick check.                                                                   |

## Findings

### R1 — P0 operational blocker: no supported staff or doctor provisioning workflow

**Observed behavior.** The Doctors tab showed “No doctor profiles are available” and no add-doctor control. The visible Admin settings destination rendered clinic workflow configuration rather than staff-account management. The fresh installation had no doctor profile, no schedule, and no supported way to create a Receptionist account from the normal interface.

**Reproduction.** Bootstrap the fresh development installation, sign in as Admin, open Doctors, and then open Admin settings. Doctors is empty with no create action. The visible settings destination contains specialty, department, service, and schedule controls but no staff or doctor-profile provisioning route.

**Impact.** A clinic cannot complete first-day setup, create the doctor records required for scheduling and compensation, or create the Receptionist user who is supposed to operate the front desk. A real receptionist-role usability audit cannot be completed through the supported product path.

**Recommendation.** Add an Admin-only Staff and Doctors management workspace. It should create and deactivate staff accounts, assign roles, manage doctor profiles and specialties, store compensation rules, and expose a clear first-run setup checklist. The Receptionist role should be created and tested through this UI before release.

**Evidence status.** Confirmed manually in the live desktop UI and supported by the existing code inspection that found no public account-provisioning method. Not fixed by this audit.

### R2 — P0 data-integrity risk: unassigned appointments can be booked

**Observed behavior.** After creating a synthetic department and service, the appointment wizard offered “Any available doctor” even though the Doctors workspace had no doctor profiles and no recurring schedules. The wizard accepted a future date/time and created a Scheduled appointment with no named doctor.

**Reproduction.** Create a department and service, leave the doctor selector at “Any available doctor,” enter 25 Aug 2026 at 10:30, confirm, and choose Book appointment. The UI reports “Appointment booked for Mariam Hassan,” and the calendar shows the appointment.

**Impact.** Front desk staff can believe that a visit is booked when no clinician or schedule owns the slot. This is unsafe operationally and makes doctor earnings and room capacity unreliable.

**Recommendation.** Require either a specific active doctor or a verified availability pool backed by at least one doctor schedule. If the clinic has no eligible doctor, disable booking and explain the next action in plain language. A waitlist should remain available as the recovery path.

**Evidence status.** Confirmed manually in the live desktop UI. Not fixed by this audit.

### R3 — P1 workflow gap: cancellation and no-show actions were not visible on appointment cards

**Observed behavior.** A scheduled appointment card exposed Check in and Open encounter. After check-in it exposed Start consultation. No visible Cancel or No-show action appeared on the appointment card during the audit.

**Reproduction.** Book a future synthetic appointment, locate it under Appointments in selected calendar range, and inspect its action buttons. Only Check in and Open encounter were available while Scheduled; after check-in the card showed Start consultation.

**Impact.** A busy receptionist cannot clearly release a cancelled slot or record that a patient did not attend. This creates stale queue data and makes daily reconciliation harder.

**Recommendation.** Add clearly labeled Cancel appointment and Mark no-show actions with confirmation, reason capture, audit logging, and a non-destructive undo or correction path. Keep the status badge and next allowed actions visible on the card.

**Evidence status.** Confirmed manually in the live desktop UI. Not fixed by this audit.

### R4 — P1 usability gap: waitlist requires a hidden prerequisite before it explains the recovery path

**Observed behavior.** Opening Add patient to waitlist and attempting to save before selecting a clinic area produced “Choose a clinic area before adding to the waitlist.” The waitlist form itself did not contain a clinic-area selector. The operator had to cancel the form, advance the booking wizard, select a clinic area, reopen the waitlist form, and save again.

**Impact.** This is recoverable but costly during a busy day. A first-time operator may interpret the form as broken because the required clinic area is outside the form being submitted.

**Recommendation.** Put clinic area in the waitlist form, or automatically inherit and visibly show the current clinic area before opening the form. Disable Save to waitlist until all required context is present and explain the missing field beside the button.

**Evidence status.** Confirmed manually in the live desktop UI. Not fixed by this audit.

### R5 — P1 localization defect: Arabic Billing remained materially mixed-language

**Observed behavior.** RTL and major navigation labels switched correctly. Billing still showed English operational copy including `APPROVED SOURCE · ADMIN REVIEW`, `Selected`, English service and package names, invoice status `refunded`, `Paid`, `Balance`, and `Reason`. Date/time values and synthetic names remained intentionally data-like.

**Impact.** Mixed language increases hesitation and error risk for an Arabic-first receptionist, especially around payment status, catalog governance, and refund correction.

**Recommendation.** Complete Arabic strings for every front-desk surface, including invoice statuses, payment summaries, admin-review sections, service/package labels where localized names exist, and correction reasons. Add RTL visual checks for long labels and button widths.

**Evidence status.** Confirmed manually in the live desktop UI. Not fixed by this audit.

### R6 — P1 front-desk clarity issue: billing setup exposes Admin-only controls in the receptionist workspace

**Observed behavior.** Billing presented doctor earnings and compensation rules, payroll export, Admin service package creation, and approved drug-catalog staging above the patient invoice form. A receptionist must visually pass through several unrelated Admin sections before reaching Create bill and Take payment.

**Impact.** This increases cognitive load and creates permission-boundary confusion. It also makes the most frequent action—collecting a patient payment—less prominent.

**Recommendation.** Role-filter the workspace into a focused receptionist view. Keep invoice, payment, receipt, refund request, and patient context in the primary area. Move compensation, payroll, package administration, and drug-catalog staging to Admin-only routes or a clearly separated More / Administration area.

**Evidence status.** Confirmed manually in the live desktop UI. Not fixed by this audit.

### R7 — P2 information architecture issue: patient profile tabs delegate core work instead of showing contextual records

**Observed behavior.** The patient profile provided Overview, Visits, Appointments, Payments, and Contacts tabs. Appointments and Payments displayed explanatory text and an Open appointments or Open billing button instead of showing the patient’s existing appointment and payment records inline. Contacts showed “No related persons linked” but no visible Add related person action.

**Impact.** The profile is a useful patient context shell, but the receptionist must leave it to answer common questions such as “What is this patient’s next appointment?” or “Has this invoice been paid?”

**Recommendation.** Render compact patient-scoped lists in the tabs, with one-tap actions to open the full workspace. Add a clear Add related person action with guardian and emergency-contact roles.

**Evidence status.** Confirmed manually in the live desktop UI. Not fixed by this audit.

### R8 — P2 billing configuration friction: a zero-price base service does not make the payment path obvious

**Observed behavior.** The initial General Consultation service was EGP 0, leaving Create bill disabled after selecting the patient and service. The audit had to create a separate Admin service package at EGP 500 before a payable invoice could be created.

**Impact.** A new clinic can reach a dead-end without understanding whether the service is free, incomplete, or misconfigured. This is especially confusing when the receptionist is not an Admin.

**Recommendation.** Show the computed total and a plain-language disabled reason beside Create bill. Provide a controlled price override or a clear Admin configuration handoff. The first-run setup should require at least one payable service before front-desk use.

**Evidence status.** Confirmed manually in the live desktop UI. Not fixed by this audit.

### R9 — P2 developer-facing copy appears in the pre-auth and Admin surfaces

**Observed behavior.** The pre-auth foundation screen exposed “Step 4,” “Secure access foundation,” Electron version, test-in-memory mode, and internal security-service wording. Admin and billing screens also exposed technical or governance text that is not receptionist-oriented.

**Impact.** This does not block the tested workflow after sign-in, but it makes the product feel unfinished and can make a first-time operator doubt whether the system is ready for real use.

**Recommendation.** Separate operator-facing health information from internal diagnostics. Show concise plain-language status in the sign-in screen, and keep detailed diagnostics behind an Admin troubleshooting action.

**Evidence status.** Confirmed manually in the live desktop UI. Not fixed by this audit.

## Verified code fixes applied

Two source-level defects found during the audit were fixed in the working tree.

| Fix                                      | Change                                                                                                                    | Verification                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Dashboard patient lookup schema mismatch | `TodayWorkspace` now requests `{ limit: 100 }`, matching the patient-search contract maximum.                             | Reloaded the live Electron dashboard after restart; the prior visible `ELITE_IPC_REQUEST_FAILED` no longer appeared. |
| Omitted patient-search filters           | Desktop IPC now parses `filters ?? {}` for `patient:search`, making omitted filters compatible with the strict schema.    | Direct live UI/IPC smoke checks with omitted filters and `{}` succeeded.                                             |
| Development Electron CSP                 | Development-only `unsafe-inline` was allowed for the Vite React refresh preamble; packaged production CSP remains strict. | The live Electron renderer mounted successfully; `pnpm desktop:build` passed with production bundle generation.      |

## Automated validation

After restoring the local native dependencies to the Node 22 ABI used by the repository tests, the following commands passed:

```text
pnpm format:check
pnpm typecheck
pnpm test
pnpm desktop:build
```

The final run reported 9 contract tests, 6 database tests, 63 auth tests, and 53 desktop tests passing, for **131 passing tests** across the repository test suites. The earlier validation failure was local native-module contamination from Electron-rebuilt argon2/better-sqlite3 artifacts, not a source regression; a forced dependency restore returned the suite to green.

## Release and pilot status

The product is **not yet ready for an unrestricted real-clinic rollout**. The source validation suite is green, but the following remain outstanding: Admin staff and doctor provisioning through the product UI, real Receptionist-role testing, doctor schedule and compensation setup, Windows packaged install and recovery verification, signed-artifact checks, LAN/TLS and Android physical-device synchronization scenarios, printer/PDF verification, backup/restore drills, governance procedures, and the 23 physical pilot gates. Continue using synthetic data until those gates are completed and signed off.

The strongest immediate product priorities are to add Staff and Doctors administration, prevent unassigned appointment booking, restore explicit cancellation and no-show controls, and reduce the receptionist workspace to patient, appointment, payment, and queue actions.

## References

[1]: ../apps/desktop/src/main/index.ts "Desktop IPC boundary and development CSP"
[2]: ../apps/desktop/src/renderer/today-workspace.tsx "Front-desk dashboard patient lookup"
[3]: ../docs/receptionist-usability-audit.md "Earlier receptionist usability audit"
[4]: ../docs/templates/physical-device-validation-checklist.md "Physical-device validation checklist"
