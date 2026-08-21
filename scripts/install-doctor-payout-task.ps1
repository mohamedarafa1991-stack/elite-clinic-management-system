[CmdletBinding()]
param(
  [string]$ExecutablePath = "",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$TaskName = "Elite Clinic - Monthly Doctor Payout Report"

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "DOCTOR_PAYOUT_TASK_REMOVED: $TaskName"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ExecutablePath)) {
  $candidatePaths = @(
    (Join-Path ${env:LOCALAPPDATA} "Programs\Elite Clinic Management System\Elite Clinic Management System.exe"),
    (Join-Path ${env:ProgramFiles} "Elite Clinic Management System\Elite Clinic Management System.exe")
  )
  $ExecutablePath = $candidatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($ExecutablePath) -or -not (Test-Path $ExecutablePath)) {
  throw "Packaged Elite Clinic executable was not found. Pass -ExecutablePath with the full path to Elite Clinic Management System.exe."
}

$timeZoneId = [TimeZoneInfo]::Local.Id
if ($timeZoneId -ne "Egypt Standard Time") {
  throw "The Windows Hub time zone is '$timeZoneId'. Set it to 'Egypt Standard Time' before installing the Cairo 07:00 payout task."
}

$ExecutablePath = [IO.Path]::GetFullPath($ExecutablePath)
$WorkingDirectory = Split-Path -Parent $ExecutablePath
$action = New-ScheduledTaskAction `
  -Execute $ExecutablePath `
  -Argument "--doctor-payout-report-scheduled" `
  -WorkingDirectory $WorkingDirectory
$scheduleAt = Get-Date -Hour 7 -Minute 0 -Second 0
$trigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At $scheduleAt
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType InteractiveToken `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Exports the previous Cairo calendar month doctor payout CSV from collected payments and refunds." `
  -Force | Out-Null

Write-Output "DOCTOR_PAYOUT_TASK_INSTALLED: $TaskName"
Write-Output "DOCTOR_PAYOUT_TASK_EXECUTABLE: $ExecutablePath"
Write-Output "DOCTOR_PAYOUT_TASK_SCHEDULE: day 1 at 07:00 Africa/Cairo-equivalent local Windows time"
