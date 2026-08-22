import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PHYSICAL_GATES } from "./physical-gate-catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportArgument =
  process.env["ELITE_READINESS_REPORT"] ??
  "artifacts/release-readiness/local-gates.json";
const reportPath = resolve(root, reportArgument);
const failOnBlocked = process.argv.includes("--fail-on-blocked");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const results = [];
const physicalRecordArgument = process.env["ELITE_PHYSICAL_RECORD"];
const physicalGates = PHYSICAL_GATES.map((gate) => ({ ...gate }));

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function tail(value, limit = 1800) {
  return value
    .replaceAll(root, "<repository-root>")
    .replaceAll(/\r\n/gu, "\n")
    .slice(-limit);
}

function record(id, status, detail, command, output = "") {
  const result = {
    id,
    status,
    detail,
    ...(command ? { command } : {}),
    ...(output ? { outputTail: tail(output) } : {}),
  };
  results.push(result);
  console.log(`RELEASE_READINESS_${status.toUpperCase()}: ${id} — ${detail}`);
  return result;
}

function run(command, args, id, detail, options = {}) {
  const displayCommand = [command, ...args].join(" ");
  try {
    const output = execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout ?? 45 * 60 * 1000,
    });
    return record(id, "passed", detail, displayCommand, output);
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    const message = error instanceof Error ? error.message : String(error);
    record(
      id,
      "failed",
      `${detail} Failure: ${message}`,
      displayCommand,
      `${stdout}\n${stderr}`,
    );
    return null;
  }
}

function runPnpm(args, id, detail, options) {
  return run(pnpmCommand, args, id, detail, options);
}

function writeReport(summary) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`RELEASE_READINESS_REPORT: ${reportPath}`);
}

function applyPhysicalRecord() {
  if (!physicalRecordArgument) return;
  const physicalRecordPath = resolve(root, physicalRecordArgument);
  try {
    execFileSync(
      process.execPath,
      [
        join(root, "scripts/validate-physical-device-record.mjs"),
        "--record",
        physicalRecordPath,
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const physicalRecord = JSON.parse(readFileSync(physicalRecordPath, "utf8"));
    if (
      physicalRecord.syntheticOnly !== true ||
      !Array.isArray(physicalRecord.scenarios)
    ) {
      throw new Error("physical record must be syntheticOnly with scenarios");
    }
    const scenarios = new Map(
      physicalRecord.scenarios.map((scenario) => [scenario.id, scenario]),
    );
    for (const gate of physicalGates) {
      const scenario = scenarios.get(gate.id);
      if (!scenario) throw new Error(`missing scenario ${gate.id}`);
      gate.status = scenario.status;
      gate.detail = `${gate.detail} Observed record status: ${scenario.status}.`;
    }
    record(
      "LOCAL-PHYSICAL-RECORD-001",
      "passed",
      `Validated and applied physical record ${physicalRecordArgument}.`,
    );
  } catch (error) {
    record(
      "LOCAL-PHYSICAL-RECORD-001",
      "failed",
      `Physical record validation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const packageDirectory =
  process.platform === "win32" ? "win-unpacked" : "linux-unpacked";
const desktopArchive = join(
  root,
  "release",
  packageDirectory,
  "resources",
  "app.asar",
);

runPnpm(
  ["test"],
  "LOCAL-TS-001",
  "TypeScript contract, database, domain, and desktop tests pass.",
);
runPnpm(
  ["typecheck"],
  "LOCAL-TS-002",
  "All TypeScript workspace packages typecheck successfully.",
);
runPnpm(
  ["desktop:build"],
  "LOCAL-DESKTOP-001",
  "The desktop main process and renderer build successfully.",
);
runPnpm(
  ["desktop:ipc:smoke"],
  "LOCAL-DESKTOP-002",
  "Centralized IPC sender validation, registration, and safe-error policy tests pass.",
);
runPnpm(
  ["windows:pilot:verify"],
  "LOCAL-WINDOWS-SCRIPT-001",
  "Windows local-pilot runner safety controls and physical-scenario safeguards pass.",
);
runPnpm(
  ["windows:payout-task:verify"],
  "LOCAL-WINDOWS-PAYOUT-001",
  "Monthly doctor payout task timezone, packaged-runner, recovery, and uninstall safeguards pass.",
);
if (existsSync(desktopArchive)) {
  runPnpm(
    ["desktop:package:verify"],
    "LOCAL-DESKTOP-003",
    `The existing ${packageDirectory} archive contains required production entries and native modules.`,
  );
} else {
  record(
    "LOCAL-DESKTOP-003",
    "blocked",
    `No ${packageDirectory} archive exists; run the platform packaging command before archive inspection.`,
  );
}
runPnpm(
  ["android:release-check"],
  "LOCAL-ANDROID-001",
  "Android unit tests, lint, release assembly, static policy checks, and APK archive checks pass.",
  { timeout: 60 * 60 * 1000 },
);
runPnpm(
  ["pilot:rehearsal"],
  "LOCAL-PILOT-001",
  "The synthetic clinic-day, encrypted backup/restore, document-vault, billing, and seven-scope sync rehearsal passes, including doctor-summary.",
  { timeout: 30 * 60 * 1000 },
);
runPnpm(
  ["format:check"],
  "LOCAL-FORMAT-001",
  "Prettier formatting passes across the repository.",
);
run(
  "git",
  ["diff", "--check"],
  "LOCAL-GIT-001",
  "Git whitespace validation passes.",
);
applyPhysicalRecord();

const failedLocal = results.filter((result) => result.status === "failed");
const blockedLocal = results.filter((result) => result.status === "blocked");
const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  syntheticOnly: true,
  repositoryCommit: (() => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
    } catch {
      return "unknown";
    }
  })(),
  localGates: results,
  physicalGates,
  counts: {
    localPassed: results.filter((result) => result.status === "passed").length,
    localBlocked: blockedLocal.length,
    localFailed: failedLocal.length,
    physicalPending: physicalGates.filter((gate) => gate.status === "pending")
      .length,
    physicalBlocked: physicalGates.filter((gate) => gate.status === "blocked")
      .length,
    physicalFailed: physicalGates.filter((gate) => gate.status === "failed")
      .length,
  },
  overallStatus:
    failedLocal.length > 0
      ? "failed"
      : physicalGates.some((gate) =>
            ["pending", "blocked", "failed"].includes(gate.status),
          ) || blockedLocal.length > 0
        ? "blocked"
        : "passed",
  reportContentSha256: null,
};
summary.reportContentSha256 = hash(JSON.stringify(summary));
writeReport(summary);

if (
  failedLocal.length > 0 ||
  (failOnBlocked &&
    (blockedLocal.length > 0 ||
      physicalGates.some((gate) =>
        ["pending", "blocked", "failed"].includes(gate.status),
      )))
) {
  process.exitCode = 1;
} else {
  console.log(
    `RELEASE_READINESS_OK: ${summary.counts.localPassed} local gate(s) passed; ${summary.counts.physicalPending} physical gate(s) remain pending.`,
  );
}
