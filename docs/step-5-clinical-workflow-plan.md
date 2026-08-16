# Step 5 — Clinical Workflow Layer

## Purpose and scope

Step 5 establishes the operational workflow around **specialties, departments, services, schedules, doctors, and appointments**. It is intentionally separate from the later clinical-content module: Step 5 decides where and when care is delivered, while Step 6 will add specialty-specific forms, ICD-10 subsets, investigations, drug information, and doctor approval workflows.

The first release must support one Cairo branch, all seven initial specialties, additional Admin-created specialties and departments, flexible doctor and specialty working patterns, and appointment reservations that continue to work offline. Friday is closed by default; Saturday through Thursday are open by default. The default appointment slot is 15 minutes, but clinic, doctor, specialty, and appointment-type durations remain configurable.

## Domain model

| Entity             | Purpose                                                                                  | Lifecycle and ownership                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Specialty          | Extensible clinical category such as the initial seven specialties.                      | Admin creates, edits, archives, and orders specialties. Clinical content approval remains a later Doctor workflow.    |
| Department         | Operational unit that can expose one or more specialties and services.                   | Admin manages active/archive state, display name, translations, and specialty association.                            |
| Service            | Empty initial catalog item with configurable price, duration, and appointment type.      | Admin creates and versions service definitions and prices; later billing consumes the versioned price.                |
| Doctor schedule    | Recurring weekly availability plus exceptions.                                           | Admin configures schedules; doctor-specific duration overrides are explicit and auditable.                            |
| Schedule exception | Holiday, leave, closure, or one-time open/closed override.                               | Admin creates exceptions with a reason and effective interval.                                                        |
| Appointment        | Reservation for a patient, department, optional doctor, service/type, and time interval. | Receptionist and authorized clinical staff create/update appointments; transitions are status-controlled and audited. |

## Scheduling rules

The scheduler uses half-open intervals `[scheduledStart, scheduledEnd)` and rejects overlapping active appointments for the same doctor. A department-level appointment without a doctor is allowed for walk-ins and queue use, but a doctor-specific booking must not overlap another active booking for that doctor. The service duration is calculated from the selected service or appointment type, with a 15-minute default and doctor-specific overrides where configured.

Appointments are rejected outside a doctor’s recurring availability unless the request is an explicitly permitted walk-in or an Admin-approved exception. Holidays, leave, closures, and one-time overrides take precedence over recurring availability. All timestamps are stored as ISO UTC values, while the Cairo clinic timezone is used for schedule-day and calendar calculations.

Appointment status transitions are explicit: `scheduled → arrived → in-consultation → completed`, with cancellation, no-show, and reschedule branches. A completed appointment cannot be silently moved or deleted. Rescheduling creates an auditable update with the previous interval retained in history.

## Capabilities and role boundaries

| Role         | Specialty/department/service configuration                                     | Appointment operations                                                             |
| ------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Admin        | Full create, edit, archive, schedule, exception, and service-price management. | Full booking, rescheduling, cancellation, status override, and audit access.       |
| Doctor       | Read assigned specialties, departments, services, and own schedule.            | Read appointments and update permitted clinical-facing statuses for assigned work. |
| Nurse        | Read operational configuration.                                                | Read appointments, record arrival/queue-related transitions where assigned.        |
| Receptionist | Read operational configuration; no specialty or price administration.          | Create, reschedule, cancel, check in, and manage front-desk appointment flow.      |

New capabilities should be added to the shared capability matrix rather than inferred from role names. Every write must pass through the authenticated service and create an audit event with the actor, entity, reason where applicable, and version transition.

## Implementation order

1. Add versioned migrations for specialty, department, service catalog, recurring schedules, schedule exceptions, appointment history, and appointment indexes.
2. Extend shared contracts with lifecycle states, configuration inputs, schedule intervals, appointment inputs, status transitions, and conflict errors.
3. Implement a clinical workflow service with Admin configuration methods and conflict-safe appointment create/update/cancel/status methods.
4. Expose typed Electron IPC and preload methods, keeping raw database access out of the renderer.
5. Add an Admin configuration workspace and a scheduling workspace with patient, service, doctor, date, duration, conflict, and status controls.
6. Add synthetic tests for schedule precedence, overlapping doctor bookings, offline-safe local creation, status transitions, archive guards, and audit records.

## Acceptance criteria

The Step 5 foundation is complete when Admin can create and archive a specialty, department, and service; configure a recurring schedule and exception; and create, update, cancel, and transition an appointment through the secure desktop boundary. The system must reject overlapping doctor appointments, preserve appointment history, respect archived configuration, enforce capability checks, and pass all repository verification commands without real patient data.

The implementation should not yet introduce specialty-specific clinical forms, ICD-10 workflows, drugs, billing, or external reminders. Those remain later modules that consume the stable Step 5 operational configuration and appointment identifiers.

## Delivered foundation snapshot

The current Step 5 increment implements migration 6, shared clinical contracts, an authenticated clinical workflow service, typed Electron IPC, and a desktop workspace. Admin can create specialties, departments, and services; authorized users can reserve appointments using patient and department identifiers; service duration controls the appointment interval; overlapping doctor bookings are rejected; and status transitions are audited in appointment history.

The foundation intentionally does not yet implement doctor-specific schedule editing UI, calendar drag-and-drop, holiday administration UI, reminders, queue dashboards, billing, or specialty-specific clinical forms. The database and service boundaries are in place for those subsequent increments.
