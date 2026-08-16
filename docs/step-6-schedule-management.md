# Step 6 — Doctor Schedule and Exception Management

## Scope

Step 6 adds the Admin controls required to configure doctor recurring availability and one-time schedule exceptions on top of the Step 5 clinical workflow foundation. The model supports Saturday–Thursday working defaults, Friday closure as a clinic policy, custom daily intervals, 15-minute default slots, doctor-specific slot durations, holidays, leave, closures, and open overrides.

## Delivered controls

| Control                 | Behavior                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Recurring schedule form | Captures doctor user ID, department, day of week, start time, end time, and slot duration.                                    |
| Overlap protection      | Rejects overlapping intervals for the same doctor and weekday.                                                                |
| Schedule listing        | Displays configured doctor intervals with department and slot duration.                                                       |
| Schedule removal        | Admin-only removal requires an audit reason and leaves the appointment history untouched.                                     |
| Exception form          | Captures date, optional doctor scope, optional department scope, closed/open kind, optional open hours, and mandatory reason. |
| Exception validation    | Requires at least one scope; open overrides require both start and end times; invalid time ranges are rejected.               |
| Exception listing       | Displays configured date exceptions, scope, type, and reason.                                                                 |
| Exception removal       | Admin-only removal requires an audit reason and is exposed through typed IPC.                                                 |

All writes pass through `module.manage`, while schedule and exception reads use `clinical.read`. The renderer receives only typed records and never accesses SQLite directly. Schedule and exception changes use existing audit-event infrastructure; appointment conflict checks remain in the clinical service and are not bypassed by the UI.

## Follow-up scope

The current increment intentionally uses doctor user IDs because a full staff directory and doctor-assignment picker belong to the staff-management module. The next scheduling increment should add a doctor directory selector, calendar views, schedule exception precedence in appointment availability checks, leave/holiday bulk operations, and recurring-schedule editing rather than delete-and-recreate only.

## Step 6.1 — Doctor Directory and Calendar Views

The scheduling workspace now derives doctor choices from active user records whose role is `doctor`. The service exposes only the fields needed for scheduling: stable user ID, English and optional Arabic display name, clinical-approver indicator, role, and active state. The query requires appointment-read capability and excludes inactive accounts, while appointment creation, recurring schedules, and schedule exceptions perform the same role-and-active-state validation server-side.

Appointment retrieval now supports a bounded calendar query with optional doctor filtering. The date range is passed through the shared contract, must contain offset-aware ISO timestamps, and is applied in SQLite before records cross the process boundary. This keeps the renderer from loading an unbounded appointment history and allows the same query to support month, week, and day views while preserving offline operation.

| View          | Calendar behavior                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Month         | Displays a Saturday-starting six-week grid, appointment counts, and up to three compact appointment chips per day. Selecting a day opens its day view. |
| Week          | Displays seven clinic-day columns from Saturday through Friday, with appointment cards grouped by local date. Selecting a column opens its day view.   |
| Day           | Displays the selected day’s appointments with time, patient display ID, visit type, status, duration, and assigned doctor.                             |
| Doctor filter | Restricts the server-side appointment query to one active doctor or shows all doctors.                                                                 |
| Navigation    | Supports previous, next, and today controls plus direct focus-date selection.                                                                          |

The appointment reservation form now uses the active doctor directory instead of a free-text doctor ID. The Admin recurring-schedule form and exception form use the same selector, reducing identifier errors while retaining optional department-scoped exceptions. Existing appointment status controls and audit/history behavior remain available below the calendar.

The next scheduling increment should apply recurring schedules and exceptions to availability-slot generation, add holiday and leave bulk operations, and provide schedule editing and doctor-specific availability summaries. Those capabilities should continue to use server-side date-range and capability checks rather than renderer-only filtering.
