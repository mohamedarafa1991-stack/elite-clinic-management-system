import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "install-doctor-payout-task.ps1",
);
const source = readFileSync(scriptPath, "utf8");
const requiredFragments = [
  "Egypt Standard Time",
  "--doctor-payout-report-scheduled",
  "New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1",
  "StartWhenAvailable",
  "Unregister-ScheduledTask",
  "InteractiveToken",
];
const missing = requiredFragments.filter(
  (fragment) => !source.includes(fragment),
);
if (missing.length > 0) {
  throw new Error(
    `DOCTOR_PAYOUT_TASK_VERIFY_FAILED: missing ${missing.join(", ")}`,
  );
}
console.log(
  "DOCTOR_PAYOUT_TASK_VERIFY_PASS: timezone, monthly trigger, packaged runner, recovery, and uninstall safeguards are present",
);
