import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportArgument =
  process.env["ELITE_READINESS_REPORT"] ??
  "artifacts/release-readiness/local-gates.json";
const reportPath = resolve(root, reportArgument);
const failOnBlocked = process.argv.includes("--fail-on-blocked");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const results = [];
const physicalGates = [
  {
    id: "WIN-INSTALL-001",
    status: "pending",
    detail: "Requires packaged Windows 10/11 clean-install evidence.",
  },
  {
    id: "WIN-INSTALL-002",
    status: "pending",
    detail: "Requires packaged Windows upgrade and migration evidence.",
  },
  {
    id: "WIN-INSTALL-003",
    status: "pending",
    detail:
      "Requires uninstall/reinstall evidence preserving encrypted data, audit history, and native-module compatibility.",
  },
  {
    id: "WIN-DB-001",
    status: "pending",
    detail: "Requires production OS-backed key-provider behavior on Windows.",
  },
  {
    id: "WIN-SEC-001",
    status: "pending",
    detail:
      "Requires Windows security-boundary evidence for least-privilege operation, redacted logs, and protected local storage.",
  },
  {
    id: "WIN-BACKUP-001",
    status: "pending",
    detail:
      "Requires Admin-controlled encrypted removable-media backup evidence.",
  },
  {
    id: "WIN-RESTORE-001",
    status: "pending",
    detail:
      "Requires replacement-Hub restore with the approved production key.",
  },
  {
    id: "WIN-RECOVERY-001",
    status: "pending",
    detail: "Requires interrupted-upgrade rollback evidence on Windows.",
  },
  {
    id: "AND-BOOT-001",
    status: "pending",
    detail:
      "Requires Android floor/current device installation and enrollment evidence.",
  },
  {
    id: "AND-BOOT-002",
    status: "pending",
    detail:
      "Requires offline start, inactivity-lock, and no-cloud-dependency evidence.",
  },
  {
    id: "AND-BOOT-003",
    status: "pending",
    detail:
      "Requires configured thirty-day offline-access expiry and documented recovery evidence.",
  },
  {
    id: "AND-KEY-001",
    status: "pending",
    detail:
      "Requires invalid or unavailable Keystore identity-key failure-closed and recovery evidence.",
  },
  {
    id: "AND-DB-001",
    status: "pending",
    detail:
      "Requires SQLCipher Room startup and migration evidence on hardware.",
  },
  {
    id: "WIN-LAN-001",
    status: "pending",
    detail:
      "Requires Windows Hub LAN discovery, firewall, TLS endpoint, and enrolled-device connectivity evidence.",
  },
  {
    id: "AND-SYNC-001",
    status: "pending",
    detail:
      "Requires six-scope LAN synchronization with a Windows Hub and device.",
  },
  {
    id: "AND-SYNC-002",
    status: "pending",
    detail: "Requires two-device durable-claim and fairness evidence.",
  },
  {
    id: "AND-SYNC-003",
    status: "pending",
    detail:
      "Requires Android TLS failure, retry-now, and Hub restart evidence.",
  },
  {
    id: "AND-SYNC-004",
    status: "pending",
    detail: "Requires process-death recovery evidence on Android hardware.",
  },
  {
    id: "AND-DOC-001",
    status: "pending",
    detail:
      "Requires LAN document upload/view and Android persistence inventory.",
  },
  {
    id: "AND-DOC-002",
    status: "pending",
    detail:
      "Requires FLAG_SECURE, recents, recording, and viewer cleanup observation.",
  },
  {
    id: "AND-DOC-003",
    status: "pending",
    detail: "Requires picker MIME/size/camera-optional behavior on devices.",
  },
  {
    id: "AND-BILL-001",
    status: "pending",
    detail:
      "Requires Android billing-summary projection and malformed-payload evidence.",
  },
  {
    id: "AND-RELEASE-001",
    status: "pending",
    detail:
      "Requires signed APK install, upgrade, rollback, and revocation evidence.",
  },
];

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
  "The synthetic clinic-day, encrypted backup/restore, document-vault, billing, and six-scope sync rehearsal passes.",
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
  },
  overallStatus:
    failedLocal.length > 0
      ? "failed"
      : physicalGates.some((gate) => gate.status === "pending") ||
          blockedLocal.length > 0
        ? "blocked"
        : "passed",
  reportContentSha256: null,
};
summary.reportContentSha256 = hash(JSON.stringify(summary));
writeReport(summary);

if (
  failedLocal.length > 0 ||
  (failOnBlocked && (blockedLocal.length > 0 || physicalGates.length > 0))
) {
  process.exitCode = 1;
} else {
  console.log(
    `RELEASE_READINESS_OK: ${summary.counts.localPassed} local gate(s) passed; ${summary.counts.physicalPending} physical gate(s) remain pending.`,
  );
}
