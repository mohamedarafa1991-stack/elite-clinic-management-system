import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(root, "scripts/run-windows-local-pilot.ps1");
const source = readFileSync(scriptPath, "utf8");
const failures = [];

function assertContains(id, fragment, detail) {
  if (!source.includes(fragment)) failures.push(`${id}: ${detail}`);
}

assertContains(
  "WIN-SCRIPT-001",
  "Set-StrictMode -Version Latest",
  "PowerShell strict mode is enabled.",
);
assertContains(
  "WIN-SCRIPT-002",
  '$ErrorActionPreference = "Stop"',
  "PowerShell stops on command errors.",
);
assertContains(
  "WIN-SCRIPT-003",
  "syntheticOnly = $true",
  "The generated report is marked synthetic-only.",
);
assertContains(
  "WIN-SCRIPT-004",
  "-AllowDirtyWorktree",
  "Dirty-worktree execution requires an explicit switch.",
);
assertContains("WIN-SCRIPT-005", "-WhatIf", "A dry-run mode is exposed.");
assertContains(
  "WIN-SCRIPT-006",
  "-SkipWindowsPackage",
  "Packaging can be skipped only explicitly.",
);
assertContains(
  "WIN-SCRIPT-007",
  "WIN-INSTALL-001",
  "The Windows install scenario is represented as pending.",
);
assertContains(
  "WIN-SCRIPT-008",
  "WIN-INSTALL-002",
  "The Windows upgrade scenario is represented as pending.",
);
assertContains(
  "WIN-SCRIPT-009",
  "WIN-INSTALL-003",
  "The Windows uninstall/reinstall scenario is represented as pending.",
);
assertContains(
  "WIN-SCRIPT-010",
  "WIN-RESTORE-001",
  "The replacement-Hub restore scenario is represented as pending.",
);
assertContains(
  "WIN-SCRIPT-011",
  "WIN-RECOVERY-001",
  "The rollback scenario is represented as pending.",
);
assertContains(
  "WIN-SCRIPT-012",
  "does not install or uninstall over a user-approved data directory",
  "The runner documents that destructive install/uninstall over user data is not automated.",
);
assertContains(
  "WIN-SCRIPT-013",
  "physical Windows scenarios remain pending human evidence",
  "The runner does not falsely mark physical scenarios passed.",
);

if (failures.length > 0) {
  console.error(`WINDOWS_PILOT_SCRIPT_FAIL: ${failures.join(" | ")}`);
  process.exitCode = 1;
} else {
  console.log(
    "WINDOWS_PILOT_SCRIPT_PASS: safety controls and Windows scenario safeguards are present",
  );
}
