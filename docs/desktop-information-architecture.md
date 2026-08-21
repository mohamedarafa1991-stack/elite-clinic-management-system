# Elite Clinic Desktop Information Architecture

## Design intent

Elite Clinic should feel like a calm front desk and clinical command center rather than a collection of unrelated forms. The sidebar therefore groups work by the question staff are trying to answer: what is happening today, who is the patient, what care is scheduled, what was recorded, what is owed, and what requires administrative control.

The Dashboard is the landing workspace. It contains today’s queue, appointment summary, scheduled doctors, local/offline status, quick actions, and a billing snapshot for users with `billing.read`. The billing snapshot shows current-month invoiced, collected, outstanding, and open-invoice totals plus recent invoice tracking without clinical note content. The remaining workspaces are stable destinations that preserve context when the user moves between operational tasks.

## Sidebar groups

| Group         | Workspace         | Primary users                                          | Purpose                                                                                                                                                                            |
| ------------- | ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today         | Dashboard         | Everyone                                               | Today’s queue, scheduled doctors, urgent next actions, and local/offline status.                                                                                                   |
| Front desk    | Patients          | Receptionist, Nurse, Doctor, Admin                     | Patient registration, duplicate review, guardians/related persons, profile editing, and patient context.                                                                           |
| Front desk    | Appointments      | Receptionist, Nurse, Doctor, Admin                     | Calendar views, appointment reservation, check-in, status movement, and encounter opening.                                                                                         |
| Clinical care | Doctors           | Everyone with doctor-profile read access               | Doctor directory, specialties, profile details, and secure doctor documents.                                                                                                       |
| Clinical care | Clinical records  | Doctor, Nurse, Admin                                   | Encounter notes, diagnoses, amendments, effective projections, and patient history context.                                                                                        |
| Clinical care | Documents         | Admin, Doctor, authorized viewers                      | Protected doctor-document viewing/upload workflow and vault status.                                                                                                                |
| Operations    | Billing           | Receptionist, Admin, Doctor, authorized clinical staff | Invoices, payments, receipts, refunds, discounts, service packages, doctor-specific fees, and collected-payment earnings.                                                          |
| Operations    | Drug catalog      | Admin                                                  | Local eg-drugs catalog review, staged import, and update controls.                                                                                                                 |
| Insights      | Reports & exports | Admin                                                  | Monthly EGP revenue, invoice collections/refunds, patient-registration trends, appointment volume, completed visits, doctor compensation oversight, and governed clinical exports. |
| System        | Sync & devices    | Admin                                                  | Device enrollment, LAN/TLS health, recovery actions, and sync status.                                                                                                              |
| System        | Admin settings    | Admin                                                  | Organization identity, session policy, specialties, departments, schedules, services, ICD-10, and governance controls.                                                             |

## Navigation behavior

The sidebar uses grouped headings, a compact icon mark, and a one-line description in the expanded state. In the collapsed state, icons retain accessible labels and the active workspace keeps a visible accent rail. Navigation remains anchor-based in this increment so current stateful workspace components are preserved while the information architecture becomes understandable and task-oriented.

Dashboard quick actions should route to **Find patient**, **Today’s appointments**, **Doctors scheduled today**, **Billing**, and **Sync health**. The dedicated Reports workspace provides six monthly aggregate points for revenue and patient trends, with no patient names, identifiers, diagnoses, or note content. A quick action never bypasses capability checks; it only scrolls to an already-authorized workspace.

## Role visibility

The navigation is derived from existing capabilities. Everyone sees Dashboard. Patients requires `patient.read`; Appointments requires `appointment.read`; Doctors requires `doctor.profile.read`; Clinical records requires `clinical.read` or a clinical write/sign capability; Billing requires `billing.read`; Reports & exports requires the Admin-only `reports.read`; Sync & devices requires `device.manage`; Admin settings requires `module.manage` or Admin role. Receptionist/front-desk sessions intentionally have patient, appointment, and billing access but no `clinical.read`, so the Clinical records destination, encounter-opening action, diagnoses, amendments, schedules, exceptions, ICD-10 catalog, and clinical exports are hidden and denied at the service layer. Documents remains within the doctor-profile permission boundary in this increment, with the sidebar entry visible only when doctor profile or sensitive document access is available.

The interface must not expose a workspace merely because its route exists. The rendered page and its actions must continue to use the existing capability checks. Doctor earnings require `billing.earnings.read` and are limited to the signed-in Doctor’s own earnings; Admins may review all Doctors. Fee schedules and income-share rules require `billing.compensation.manage` and are Admin-only. Rules are effective-dated, invoice lines preserve the applied fee and share snapshot, earnings are recognized from collected payments, and refunds create reducing ledger events rather than rewriting history.

## Bilingual and RTL rules

English and Arabic labels use the same information hierarchy. Arabic changes the document direction to RTL, reverses sidebar alignment without reversing the meaning of time, patient IDs, monetary amounts, or file paths, and keeps Latin identifiers in isolated LTR spans. Sidebar group labels are translated rather than hidden in Arabic.
