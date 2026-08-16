# Step 6 — Doctor Schedule and Exception Management

## Scope

Step 6 adds the Admin controls required to configure doctor recurring availability and one-time schedule exceptions on top of the Step 5 clinical workflow foundation. The model supports Saturday–Thursday working defaults, Friday closure as a clinic policy, custom daily intervals, 15-minute default slots, doctor-specific slot durations, holidays, leave, closures, and open overrides.

## Delivered controls

| Control | Behavior |
|---|---|
| Recurring schedule form | Captures doctor user ID, department, day of week, start time, end time, and slot duration. |
| Overlap protection | Rejects overlapping intervals for the same doctor and weekday. |
| Schedule listing | Displays configured doctor intervals with department and slot duration. |
| Schedule removal | Admin-only removal requires an audit reason and leaves the appointment history untouched. |
| Exception form | Captures date, optional doctor scope, optional department scope, closed/open kind, optional open hours, and mandatory reason. |
| Exception validation | Requires at least one scope; open overrides require both start and end times; invalid time ranges are rejected. |
| Exception listing | Displays configured date exceptions, scope, type, and reason. |
| Exception removal | Admin-only removal requires an audit reason and is exposed through typed IPC. |

All writes pass through `module.manage`, while schedule and exception reads use `clinical.read`. The renderer receives only typed records and never accesses SQLite directly. Schedule and exception changes use existing audit-event infrastructure; appointment conflict checks remain in the clinical service and are not bypassed by the UI.

## Follow-up scope

The current increment intentionally uses doctor user IDs because a full staff directory and doctor-assignment picker belong to the staff-management module. The next scheduling increment should add a doctor directory selector, calendar views, schedule exception precedence in appointment availability checks, leave/holiday bulk operations, and recurring-schedule editing rather than delete-and-recreate only.
