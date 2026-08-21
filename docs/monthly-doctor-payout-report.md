# Monthly Doctor Payout Report

## Purpose

Elite Clinic generates a monthly CSV payout report for the Windows Hub from the immutable doctor earnings ledger. The report is based on **collected payments**, not issued invoice values. Payment allocations, refund allocations, doctor compensation snapshots, and clinic-retained amounts are therefore preserved according to the financial events that actually occurred during the selected Cairo calendar month.

The report is an **administrative financial artifact**. It contains doctor identities and compensation amounts, so it is generated only by Admin users or by the locally installed Windows Hub task that runs under the Hub Windows account. Doctors continue to see only their own earnings inside the application, while receptionists and nurses cannot access the report or its compensation data.

## Automatic schedule

The Windows Hub task runs on the first day of each month at **07:00**, using the Windows `Egypt Standard Time` zone. It generates the previous Cairo calendar month. The task uses the packaged Elite Clinic executable with the `--doctor-payout-report-scheduled` argument, opens the encrypted local database with the existing OS-backed key provider, writes the CSV atomically, and exits without opening the clinical workspace.

The task is idempotent for a month. If the state file already records the same report month and the expected CSV still exists, a repeated task invocation does not create a duplicate report or a second audit event. If the CSV is missing, the task regenerates it from the ledger.

## Output location and file name

Reports are saved under the Windows user Documents directory:

```text
%USERPROFILE%\Documents\Elite Clinic Reports\Doctor Payouts\doctor-payouts-YYYY-MM.csv
```

The file is written through a temporary file and an atomic rename. The report directory is created if needed. The state file is stored beside the encrypted Hub application data with restrictive file permissions and records the last successful month, output file name, and any last error.

## CSV columns

| Column                | Meaning                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `report_month`        | Cairo calendar month represented by the row, in `YYYY-MM` format.                         |
| `doctor_id`           | Internal Elite doctor identifier.                                                         |
| `doctor_name_en`      | Doctor’s English display name.                                                            |
| `doctor_name_ar`      | Doctor’s Arabic display name when configured.                                             |
| `collected_egp`       | Doctor-attributed amount allocated from posted payments during the month.                 |
| `refunded_egp`        | Doctor-attributed amount allocated from posted refunds during the month.                  |
| `doctor_earnings_egp` | Doctor compensation from payment events minus compensation reductions from refund events. |
| `clinic_retained_egp` | Collected amount minus refunded amount minus doctor earnings.                             |
| `invoice_count`       | Distinct invoices represented by the doctor’s ledger events during the month.             |

The final CSV row is a `TOTAL` row across all active doctors. The report is generated with a UTF-8 BOM and CRLF line endings for reliable opening in common Windows spreadsheet applications. Names and other text fields are CSV-escaped when they contain commas, quotes, or newlines.

## Accounting rules

The report uses the same immutable ledger as the in-application Doctor Earnings workspace. A partial payment contributes only its proportional allocation. A refund contributes a reducing event and does not rewrite the original payment. Discounts are already allocated proportionally when invoice compensation snapshots and payment events are created. Historical fee and share changes therefore cannot change a previously generated month’s source events.

Service invoice lines are supported. Package revenue remains clinic-retained until an explicit package allocation policy is configured; the report does not invent a doctor allocation for an unallocated package.

## Admin controls

Admins can select any valid `YYYY-MM` period in the Billing workspace and choose **Export CSV** to regenerate that month manually. Manual re-export overwrites the deterministic monthly file name and records a `billing.doctor-payout-report.generated` audit event with the month, generation source, doctor count, and totals. The Billing workspace also displays the protected output directory and the last successful scheduled or manual run.

## Installation on the Windows Hub

After installing or updating the packaged desktop application, run PowerShell 7 from the repository checkout and execute:

```powershell
pnpm windows:payout-task:install
```

The installer searches the standard per-user and machine installation locations. If the executable is installed elsewhere, pass its full path:

```powershell
pnpm windows:payout-task:install -- -ExecutablePath "C:\Path\To\Elite Clinic Management System.exe"
```

The installer refuses to register the task unless the Hub Windows time zone is `Egypt Standard Time`. This prevents a silent mismatch between the requested Cairo schedule and the workstation clock. To remove the task:

```powershell
pnpm windows:payout-task:remove
```

The task uses the interactive Windows account and a limited run level. The Hub account must be logged in, and the workstation must be powered on or configured to resume the task when available. The application’s **StartWhenAvailable** setting allows a missed monthly run to start when the workstation becomes available.

## Failure and recovery

If the scheduled run fails, the task exits with a non-zero status and stores a sanitized error in the local payout schedule state. The Admin Billing workspace shows the last error after the application is opened. An Admin can use the month selector to re-export the failed period after correcting the workstation, database, or file-system issue.

The local readiness harness verifies the payout aggregation and CSV helper behavior. Physical Windows validation must still confirm Task Scheduler registration, the Cairo time-zone guard, execution while the application is closed, output-folder ACLs, rerun idempotency, and recovery after a missed or failed task.
