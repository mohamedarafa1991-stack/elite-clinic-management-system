# Elite Clinic Frontend Design System

**Product:** Elite Clinic Management System / ايليت

**Platforms:** Windows 10/11 Electron Hub and Android API 29+

**Clinic context:** One Cairo branch, fewer than 20 staff, Admin / Doctor / Nurse / Receptionist roles, local-first operation, Arabic-English bilingual requirement

**Design status:** Research-backed visual and interaction specification for implementation

## Executive direction

Elite Clinic should feel like a **calm clinical workstation**, not a generic analytics dashboard and not a consumer health app. The interface must help a receptionist find the correct patient quickly, help a nurse move through a rooming queue, help a doctor review and document an encounter without losing patient context, and help an Admin understand security, synchronization, billing, and governance without being interrupted by decorative noise.

The visual direction is **Cairo Calm**: warm-white clinical surfaces, deep blue-green ink, restrained Nile-teal action color, precise status colors, subtle borders, generous but not wasteful spacing, and a small number of purposeful surfaces. The system should communicate trust through consistency and legibility rather than through medical clichés, gradients, glossy cards, or excessive green checkmarks.

> **Design principle:** every visual decision must either reduce search time, prevent a clinical or administrative mistake, clarify responsibility, or make the next safe action obvious.

This direction is grounded in current Material 3 foundations, Fluent 2 desktop patterns, WCAG 2.2, NHS accessibility guidance, Android Compose semantics/localization guidance, and healthcare usability research. The sources consistently emphasize semantic hierarchy, keyboard and assistive-technology access, visible focus, strong contrast, responsive reflow, searchability, workflow alignment, progressive disclosure, structured data entry, and reduced interruption.[1] [2] [3] [4] [5] [6] [7]

## 1. Product experience model

The application has two different modes of work that should share one visual language but not one density profile.

| Work mode         | Primary user need                                                                                                   | Default density                          | Primary interaction                                            | Design emphasis                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Windows Hub       | Manage the clinic, search records, schedule, document care, reconcile money, govern exports, and recover the system | Comfortable by default; Compact optional | Keyboard, mouse, large monitor, split panes, tables, shortcuts | Persistent context, fast search, multi-pane workspaces, explicit status                            |
| Android companion | Perform focused, mobile tasks while connected to the Hub                                                            | Comfortable and touch-first              | Touch, TalkBack, portrait/landscape, intermittent LAN          | Few actions per screen, readable summaries, clear secure connection state, no document persistence |

The desktop and Android apps should not expose every module as a flat menu. Users should see the subset that matches their role and the work they are doing. Capabilities remain the security source of truth; the frontend only reflects them and must never treat hidden navigation as authorization.

## 2. Brand and visual language

### 2.1 Brand character

The brand should feel **competent, quiet, local, and human**. It should be clearly more polished than an internal CRUD tool, but it should never resemble a marketing landing page. Use the English product name **Elite Clinic Management System** and the Arabic brand form **ايليت** in the identity area. Do not use a medical cross as the primary mark; it is generic and can imply emergency care. Prefer a simple abstract mark built from an **E-shaped path and a protected circular center**, communicating continuity, care, and secure records.

The logo should have a wordmark lockup for the desktop sidebar and a compact symbol for Android app bars, small navigation rails, and the Windows taskbar icon. The wordmark must be real editable text or a controlled vector asset, not AI-generated lettering.

### 2.2 Color system

Use semantic tokens rather than hardcoded colors in components. The values below are a starting palette that must be contrast-tested in both light and dark themes before implementation is finalized.

| Token                 | Light value | Role                                         | Do not use for                |
| --------------------- | ----------- | -------------------------------------------- | ----------------------------- |
| `surface.canvas`      | `#F4F7F8`   | Main application background                  | Body text                     |
| `surface.raised`      | `#FFFFFF`   | Cards, tables, dialogs, app bar              | Large decorative fields       |
| `surface.subtle`      | `#EAF1F2`   | Selected navigation, grouped form sections   | Warning messages              |
| `surface.sunken`      | `#E1EAEC`   | Input backgrounds, inactive wells            | Primary canvas                |
| `ink.strong`          | `#142B3A`   | Headings, critical identifiers, primary text | Decorative blocks             |
| `ink.standard`        | `#314A57`   | Body text, labels, table values              | Disabled text                 |
| `ink.muted`           | `#607681`   | Supporting text, timestamps, metadata        | Essential instructions        |
| `border.default`      | `#D6E1E4`   | Dividers, card outlines, table rules         | Focus state alone             |
| `brand.primary`       | `#0B6E73`   | Primary actions, selected navigation, links  | Every badge or icon           |
| `brand.primary-hover` | `#07565B`   | Hover and pressed primary states             | Static text if contrast fails |
| `brand.tint`          | `#DDF2F1`   | Selected/soft brand background               | Full-page background          |
| `status.success`      | `#0B6B50`   | Confirmed, ready, paid, verified             | Decoration                    |
| `status.warning`      | `#A15C08`   | Pending, attention, expiring                 | Normal metadata               |
| `status.danger`       | `#B42318`   | Destructive, rejected, unsafe                | Routine error-free state      |
| `status.info`         | `#175CD3`   | Informational, sync, review                  | Primary brand replacement     |
| `status.clinical`     | `#7A3E9D`   | Clinically significant flags when needed     | General accent color          |

Status must never be communicated with color alone. Pair every status color with text, an icon, a shape, or a state label. Use red only for an action that is unsafe, destructive, blocked, or clinically urgent. Do not make the whole interface green because the local store is healthy.

### 2.3 Typography

Use platform-native typography for body text while making Arabic a first-class script. The Windows renderer should prefer `Segoe UI Variable`, then `Noto Sans`, then system sans-serif for English and Latin-heavy content. Arabic should use a bundled or locally available `Noto Sans Arabic` family with the same semantic weights. Android should use the platform sans family with a planned Arabic fallback and explicit font-scale tests. Noto Sans Arabic provides multiple weights and widths and broad Arabic-script coverage, making it an appropriate candidate for the bilingual system.[8]

| Semantic role | Desktop | Android | Weight | Use                                                            |
| ------------- | ------: | ------: | -----: | -------------------------------------------------------------- |
| Display       |   32/40 |   28/36 |    600 | Rare landing/setup title only                                  |
| Page title    |   28/36 |   24/32 |    600 | One per screen                                                 |
| Section title |   20/28 |   20/28 |    600 | Major workspace sections                                       |
| Card title    |   16/24 |   18/24 |    600 | Patient, appointment, invoice, profile cards                   |
| Body          |   14/20 |   16/24 |    400 | Default content and form values                                |
| Body strong   |   14/20 |   16/24 |    600 | Labels, emphasized values, actionable rows                     |
| Caption       |   12/16 |   12/16 |    400 | Metadata, timestamps, audit context                            |
| Identifier    |   13/18 |   14/20 |    600 | Patient IDs, ICD-10 codes, invoice numbers; use bidi isolation |

Use sentence case in English and natural sentence case in Arabic. Avoid all-caps labels. Do not use letter spacing on Arabic. Keep long prose at a readable line length and use headings to break clinical content into scannable groups.

### 2.4 Shape, borders, and elevation

Use a compact shape language. Default cards use a 12px radius, field controls use an 8px radius, dialogs use a 16px radius, and pills are reserved for statuses, filters, and compact role markers. Do not turn every group into a floating card. Prefer a canvas with one or two raised work surfaces, thin borders, and low elevation.

Elevation should be expressed primarily through surface contrast and borders. Use shadows only for dialogs, menus, and a small number of floating panels. Avoid glassmorphism, blur, gradients, and animated background decoration because they reduce legibility and make a clinical workstation feel unstable.

### 2.5 Iconography and imagery

Use one consistent outline icon family with filled/strong variants only for active or urgent states. Icons must have accessible names when interactive and `contentDescription = null` when purely decorative beside visible text. Directional arrows may mirror in RTL; clinical symbols, document icons, calendar icons, and status symbols should not be mirrored if their meaning would change.

Do not use stock doctor photography inside the operational product. Use initials, profile photos when available, or simple geometric placeholders. Profile photos should not become a visual identity requirement for staff who do not have one.

## 3. Application shell and navigation

### 3.1 Windows Hub shell

The desktop shell should be a three-zone application frame:

1. A **left navigation rail/sidebar** 248px wide when expanded and 72px when collapsed. It contains the Elite identity, current branch, role-aware navigation, a compact sync/security indicator, and the current user menu.
2. A **top command bar** 64–72px high. It contains global patient/staff search, a context-sensitive page title or breadcrumb, quick-create action, language/density/theme controls, and a persistent local/LAN status chip.
3. A **content workspace** with a maximum comfortable reading width but no artificial 1180px ceiling when a table or calendar needs more space. The content area uses 24–32px outer padding and supports split panes.

The sidebar should group navigation by purpose instead of implementation step:

| Group                | Items                                            | Role visibility                               |
| -------------------- | ------------------------------------------------ | --------------------------------------------- |
| Workspace            | Overview, My day, Tasks                          | All, filtered by role                         |
| Care                 | Patients, Schedule, Encounters, Clinical history | Clinicians and authorized staff               |
| Clinic operations    | Check-in queue, Billing, Services/packages       | Reception/Admin; selected clinical visibility |
| Staff and governance | Doctors, Staff records, Exports, Audit, Settings | Capability-gated                              |

Do not show “Step 29”, “Step 30”, or internal implementation labels in production UI. Those belong in documentation and release diagnostics, not in navigation.

Use a **command/search palette** available from `Ctrl+K` and a visible global search field. It should search patient ID, name, phone, appointment reference, invoice number, doctor name, and ICD-10 code according to capability. Search results must show entity type, identifier, and next action so similarly named patients are not confused.

### 3.2 Android shell

The Android app should use a role-aware top app bar and a four-item bottom navigation for the most frequent workflows:

| Bottom item | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| Home        | Today’s tasks, sync state, quick actions                             |
| Schedule    | Today/week appointments and queue                                    |
| Patients    | Patient search and compact chart summary                             |
| More        | Doctor documents, settings, enrollment, audit/status where permitted |

On large Android screens, switch to a navigation rail plus two-pane content. The document viewer remains a protected in-app surface and is never routed to an external viewer. Android should not attempt to recreate the entire Windows Hub shell.

### 3.3 Navigation and temporary UI rules

Every screen has one clear page title, one primary action, and an obvious way back or close. Use drawers and sheets for secondary details, not for essential clinical data that needs comparison. Use dialogs for confirmation, irreversible actions, and compact choices only. Restore focus to the triggering control after a dialog or sheet closes on desktop; restore semantic focus/announce pane changes on Android.

## 4. Key screen compositions

### 4.1 Overview / Today

The first desktop screen should answer: **What needs attention now?** It is not a chart-heavy analytics page.

| Region               | Content                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Header               | “Today at Elite Clinic”, date, branch, greeting kept brief, primary quick action                          |
| Primary row          | Appointment queue, waiting/check-in count, open encounters, unpaid invoices or Admin-only revenue summary |
| Main workspace       | Today’s appointments in time order with status, patient identity, doctor, room, and next action           |
| Right/secondary rail | Sync/security health, recent activity, pending Admin review, expiring licenses/documents                  |
| Empty state          | “No appointments scheduled” with direct actions to create a schedule or register a patient                |

The default should be calm and actionable. Use small summary metrics only when they lead to an action; do not display decorative KPIs.

### 4.2 Patient search and patient chart

Patient identity must remain visible whenever a user is inside a patient workflow. The chart header should include:

- `EL-00001` in a distinct identifier treatment.
- English and Arabic name, with an age/sex summary and phone shown in separate bidi-isolated fields.
- Duplicate/guardian/related-person indicators.
- Allergies or safety flags only when clinically represented by the data model.
- Last visit, next appointment, and current encounter status.
- A clear “patient context locked” visual state to prevent accidental documentation against another patient.

Use desktop split panes: left chart navigation/timeline, center active content, optional right contextual panel. The first-level chart sections should be **Summary, Encounters, History, Appointments, Billing, Documents/Exports** according to capability. Keep the patient banner sticky while scrolling the active content.

### 4.3 Schedule and queue

The schedule should default to a day view around the clinic’s working hours, with a week view available. Show appointment type and status through a small color-plus-label treatment, not saturated blocks. Provide queue-focused views for reception and nurse workflows. A calendar cell should support keyboard selection, screen-reader semantics, and an explicit appointment list alternative.

For doctors, “My day” should combine the schedule with the active patient queue. For receptionists, it should prioritize arrival, reschedule, cancellation, duplicate-warning, and check-in actions. Avoid making every role use the same calendar canvas.

### 4.4 Encounter workspace

The encounter screen must keep the patient identity banner fixed and present a structured note editor. Use a left-to-right or right-to-left two-column composition depending on locale:

| Pane         | Content                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| Context pane | Patient summary, recent diagnoses, current medications when supported, prior notes, alerts |
| Work pane    | SOAP fields, diagnosis search/selection, ICD-10 confirmation, follow-up, signature state   |

On smaller screens, context becomes a collapsible summary sheet. Default fields should be structured and short, with progressive disclosure for amendments, audit evidence, and advanced governance. The signed state should be visually unmistakable and editing a signed note should route through the amendment workflow rather than appearing as ordinary edit.

### 4.5 Billing workspace

Billing should look like a transaction workspace, not a dashboard. Use a three-part layout: invoice header and patient context; line-item editor with service/package selection, discount, partial payment, refund, and receipt actions; and a totals/settlement panel. EGP should be consistently formatted and visually secondary to the patient and transaction identifiers.

Dangerous actions such as refund, void, permanent deletion, or export revocation should use explicit verbs, confirmation summaries, and a reason field where required. Never hide a destructive action behind an unlabeled icon.

### 4.6 Doctor profiles and documents

The Doctor workspace should be a directory-to-profile flow. Start with search/filterable doctor rows that show photo or initials, name, specialty, department, availability, and account/verification state. The profile uses tabs or anchored sections: Overview, Professional details, Documents, Schedule, Audit-relevant status.

Documents should be displayed as metadata rows with type, sensitivity, version, status, last update, and permitted actions. Sensitive rows need a plain-language permission explanation rather than simply disappearing with no reason when appropriate. Desktop viewing uses a protected modal/pane. Android shows only allowed streamed content with an always-visible secure viewing state and no save/share/download actions.

### 4.7 Admin, sync, security, and settings

Operational health should be readable without being alarming. Use an admin status center with sections for local database readiness, LAN Hub status, certificate/trust state, outbox backlog, backup age, Android enrollment health, and recovery actions. The main shell can show a small persistent state chip; details belong in this center.

Offline is a valid operating mode. Use the wording **“Working locally”** with a timestamp and a secondary **“LAN sync unavailable”** detail instead of styling offline as a catastrophic failure. A blocked security state must be distinct from a retryable network state.

## 5. Component inventory

Implement a small shared component system rather than continuing to style every module independently.

| Component              | Responsibility                                        | Required states                                                |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `AppShell`             | Navigation, top bar, content landmarks, global status | Expanded/collapsed, RTL, dark/high contrast                    |
| `PageHeader`           | Title, description, breadcrumb, primary action        | Loading, action disabled, compact                              |
| `GlobalSearch`         | Patient/appointment/staff/ICD-10 search               | Empty, typing, results, no result, permission-filtered         |
| `PatientContextBanner` | Persistent patient identity and safety context        | Normal, locked, critical flag, missing data                    |
| `StatusChip`           | Text-plus-icon semantic status                        | Ready, pending, warning, blocked, error, neutral               |
| `WorkspaceCard`        | One raised work surface, not a generic container      | Default, selected, error, read-only                            |
| `DataTable`            | Dense sortable/filterable data                        | Keyboard navigation, empty, loading, pagination/virtualization |
| `Timeline`             | Clinical history and audit progression                | Grouped, collapsed, current, signed/amended                    |
| `FilterBar`            | Search, date, role, status, specialty filters         | Applied, clearable, compact/mobile sheet                       |
| `FormField`            | Label, help, input, error, status                     | Required, disabled, read-only, validation, bidi data           |
| `ErrorSummary`         | Page-level actionable validation summary              | Focus target, field links, inline pairing                      |
| `InlineStatus`         | Non-modal operation feedback                          | Success, warning, retryable, blocked                           |
| `ConfirmDialog`        | High-risk confirmation with summary and reason        | Destructive, permission denied, loading                        |
| `EmptyState`           | Explain absence and next action                       | No data, filtered empty, offline empty                         |
| `Skeleton`             | Loading placeholder preserving final layout           | Table, card, form, timeline                                    |
| `Calendar`             | Day/week/month data with accessible alternative list  | Selected, today, busy, unavailable, RTL                        |
| `SecureViewer`         | Protected document/image/PDF surface                  | Loading, ready, error, cleared, permission denied              |

Every component should define semantic HTML/Compose semantics, focus order, keyboard/touch behavior, RTL behavior, loading/error/empty states, and visual tokens before it is reused across modules.

## 6. Responsive and density strategy

The desktop renderer currently enforces a `1024px` minimum body width. Replace that with a shell that supports a practical small-window mode and a full desktop mode; the first release can still optimize for 1280px-wide clinic monitors, but it should not become unusable at 1024px. For web-style accessibility, layouts should reflow instead of hiding essential content; Fluent’s guidance explicitly calls for zoom/reflow thinking, including 320px-width behavior for responsive interfaces.[4]

Use three desktop modes:

| Mode     | Approximate width | Behavior                                                                |
| -------- | ----------------: | ----------------------------------------------------------------------- |
| Compact  |       1024–1199px | Collapsed sidebar, single primary workspace, detail drawers             |
| Standard |       1200–1599px | Expanded sidebar, two-pane patient/clinical workspaces                  |
| Wide     |           1600px+ | Three-pane chart workspaces, persistent contextual panels, wider tables |

Use user-selectable **Comfortable** and **Compact** density, but keep touch/keyboard targets above minimums. Density must change padding and row height, not remove labels or collapse status into color alone. Android uses comfortable density as default and respects system font scale.

## 7. RTL and bilingual behavior

Arabic is not a later translation pass. It is a first-class layout direction and content mode. Use logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline`, `border-start`, `text-align: start`) and Compose start/end primitives. Test every screen in English LTR and Arabic RTL.

Machine identifiers and mixed-direction values need special treatment. Patient IDs, invoice numbers, phone numbers, dates, EGP amounts, ICD-10 codes, usernames, filenames, URLs, and document IDs should render in dedicated fields or bidi-isolated spans. When inserted into a localized sentence, use Unicode bidi wrapping rather than relying on visual luck.[9]

The language switch should be visible in Settings and the user menu, with the current locale stated in plain language. Switching locale must not reset forms, lose selected patients, or alter machine values. Arabic translations should be reviewed for clinic terminology by a fluent Arabic-speaking staff member before release; automated translation is a draft, not sign-off.

## 8. Accessibility and safety acceptance criteria

The redesign must meet WCAG 2.2 AA for the desktop renderer and equivalent Android accessibility expectations. This is a product acceptance gate, not optional polish.

| Area      | Acceptance criterion                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrast  | Body text reaches at least 4.5:1, large text at least 3:1, and controls/icons at least 3:1 against adjacent colors.                                        |
| Focus     | Every interactive element has a visible high-contrast focus indicator; focus is restored after dialog, drawer, and menu close.                             |
| Keyboard  | All primary workflows can be completed with keyboard only; no keyboard trap; logical order follows the visual/semantic order.                              |
| Semantics | One page title, ordered headings, landmarks, accessible names, table headers, status announcements, and error associations are present.                    |
| Touch     | Android controls use comfortable touch targets and remain usable at large font scale; no gesture-only critical action.                                     |
| Color     | Status is never encoded by color alone; warning/danger/blocked states include text and an icon or structural cue.                                          |
| Errors    | Errors identify the field/problem and the next correction; page-level summaries move focus without destroying the form.                                    |
| Reflow    | Desktop compact mode and Android landscape/portrait preserve essential content without horizontal scrolling in ordinary workflows.                         |
| RTL       | English LTR and Arabic RTL layouts are tested, including mixed identifiers, dates, phone numbers, and numeric EGP values.                                  |
| Privacy   | Sensitive document viewers remain protected, no document bytes are persisted on Android, and screenshots/sharing/export actions follow the security model. |
| Motion    | Motion is restrained, optional, and respects reduced-motion preferences.                                                                                   |

## 9. Visual QA and usability validation

The design must be validated with synthetic clinic scenarios rather than by inspecting isolated screenshots only. The first walkthrough should include: registering a new patient with a duplicate warning; finding an existing patient by ID, name, and phone; booking an appointment; checking in a patient; documenting a SOAP encounter and ICD-10 diagnosis; amending a signed note; creating a partial-payment invoice and receipt; viewing a doctor profile and a sensitive document; handling offline/local mode; recovering LAN sync; and reviewing an export or audit record.

For each scenario, measure task completion, wrong-patient risk, number of screens or clicks, time to first meaningful action, error recovery, keyboard completion, TalkBack traversal, Arabic RTL correctness, and visual clarity at compact and large-font settings. Use a small synthetic-data pilot with at least one Admin, Doctor, Nurse, and Receptionist persona. The research evidence recommends task analysis and iterative user-centered evaluation because fragmented navigation and poor defaults can increase cognitive burden and safety risk.[5] [6] [7]

The visual QA checklist should include light/dark themes, Windows 10/11 rendering, 100/125/150/200% display scale, 1024px compact mode, wide monitor mode, Arabic locale, English locale, offline state, LAN failure, loading, empty, read-only, permission denied, validation error, and destructive confirmation states.

## 10. Implementation roadmap

The redesign should be delivered in vertical slices so the new system becomes visible early without breaking the existing domain workflows.

| Slice                         | Scope                                                                                                    | Definition of done                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1. Foundation shell           | CSS tokens, fonts, app shell, sidebar, top bar, global search frame, status center, themes, focus styles | Overview and one existing workspace run inside the new shell with no domain behavior regression           |
| 2. Patient and schedule core  | Patient search, patient context banner, patient list/table, schedule day view, queue states              | Receptionist and Nurse can complete synthetic arrival-to-appointment flows with keyboard and compact mode |
| 3. Clinical workspace         | Encounter split view, SOAP form, ICD-10 search, signed/amendment state, timeline                         | Doctor completes a synthetic encounter without losing patient context; accessibility semantics tested     |
| 4. Operations                 | Billing workspace, services/packages, payments, receipts, refunds, Admin review surfaces                 | Admin/reception workflows are task-first and destructive actions are explicit                             |
| 5. Staff and secure documents | Doctor directory/profile, document metadata, secure viewer, Android mobile shell                         | Permission-sensitive staff workflows and secure document behavior match policy                            |
| 6. Governance and release     | Exports, audit, sync center, settings, backup/recovery UI, RTL/Arabic review                             | All release gates, visual QA, accessibility, and synthetic pilot evidence are recorded                    |

The first implementation slice should be the **Foundation shell plus an Overview screen and the Patient Context Banner**. This gives the greatest visual leverage across every existing module and directly addresses the current renderer’s primary problem: a monolithic page with repeated cards, broad module sprawl, no persistent patient context, and inconsistent local styling.

## 11. Immediate implementation decisions

The initial code changes should not rewrite clinical business logic. They should introduce a `renderer/design-system/` boundary containing token definitions, primitive components, layout helpers, and a role-aware navigation model. Existing workspaces can be migrated one at a time.

The desktop should use CSS custom properties for semantic tokens and logical properties for RTL. The Android theme should expose the same semantic roles through Material 3 color and typography schemes. The two platforms should share names and meaning—not pixel values—so the Windows renderer can feel native while the Android app feels touch-first.

The first visual implementation should include:

- A calm canvas and raised surface system replacing the current page-wide white-card repetition.
- A persistent expanded/collapsed sidebar with capability-filtered navigation.
- A compact top bar with global search, branch identity, locale/theme/density controls, and local/LAN status.
- A meaningful Overview page with role-specific task blocks rather than step labels.
- A reusable patient identity banner that can be mounted above patient, appointment, billing, encounter, export, and document screens.
- Shared loading, empty, error, confirmation, and inline-status patterns.
- English LTR and Arabic RTL token/layout tests before module migration.

## References

[1]: https://m3.material.io/ "Material Design 3 — Google"
[2]: https://www.w3.org/TR/WCAG22/ "Web Content Accessibility Guidelines 2.2 — W3C Recommendation"
[3]: https://service-manual.nhs.uk/accessibility/design "NHS Digital Service Manual — Accessibility: Design"
[4]: https://fluent2.microsoft.design/accessibility "Fluent 2 — Accessibility"
[5]: https://fluent2.microsoft.design/design-tokens "Fluent 2 — Design tokens"
[6]: https://developer.android.com/develop/ui/compose/accessibility "Accessibility in Jetpack Compose — Android Developers"
[7]: https://developer.android.com/training/basics/supporting-devices/languages "Support different languages and cultures — Android Developers"
[8]: https://fonts.google.com/noto/specimen/Noto+Sans+Arabic "Noto Sans Arabic — Google Fonts"
[9]: https://digital.ahrq.gov/program-overview/research-stories/improving-electronic-health-record-usability-patient-safety "AHRQ — Improving EHR Usability for Patient Safety"
[10]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12206486/ "Olakotan et al. — Usability Challenges in Electronic Health Records: Impact on Documentation Burden and Clinical Workflow"
[11]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11705737/ "Cahill et al. — The influence of electronic health record design on usability and medication safety"
