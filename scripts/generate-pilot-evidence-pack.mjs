import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PHYSICAL_GATE_IDS } from "./physical-gate-catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsRoot = join(root, "artifacts");
const defaultOutput = "artifacts/pilot-evidence-pack";
const outputArgument = process.env["ELITE_EVIDENCE_OUTPUT"] ?? defaultOutput;
const outputPath = resolve(root, outputArgument);
const requireArtifacts = process.argv.includes("--require-artifacts");
const cleanOutput = process.argv.includes("--clean");
const allowDevelopmentWorktree =
  process.env["ELITE_EVIDENCE_ALLOW_WORKTREE"] === "true";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const failures = [];
const physicalRecordTemplatePath = join(
  root,
  "docs/templates/physical-device-validation-record.json",
);
const validationMatrixPath = join(
  root,
  "docs/workstation-and-device-validation-matrix.md",
);

function repositoryRelative(path) {
  return relative(root, path).replaceAll("\\", "/");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${command} ${args.join(" ")}: ${message}`);
    return "unavailable";
  }
}

function check(id, passed, detail) {
  const result = { id, status: passed ? "passed" : "failed", detail };
  if (!passed) failures.push(`${id}: ${detail}`);
  return result;
}

function latestReadinessReport() {
  const reportDirectory = join(artifactsRoot, "release-readiness");
  if (!existsSync(reportDirectory)) return null;
  const candidates = readdirSync(reportDirectory)
    .filter((name) => extname(name) === ".json")
    .map((name) => join(reportDirectory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  return candidates[0] ?? null;
}

function copyApprovedFile(sourcePath, destinationName) {
  if (!existsSync(sourcePath)) return null;
  const destinationPath = join(outputPath, destinationName);
  copyFileSync(sourcePath, destinationPath);
  return repositoryRelative(destinationPath);
}

const outputWithinArtifacts =
  outputPath === artifactsRoot ||
  outputPath.startsWith(`${artifactsRoot}${sep}`);
if (!outputWithinArtifacts) {
  failures.push(
    "Evidence output must remain under the repository artifacts directory",
  );
}
if (cleanOutput && existsSync(outputPath))
  rmSync(outputPath, { recursive: true, force: true });
mkdirSync(outputPath, { recursive: true });

const commit = run("git", ["rev-parse", "HEAD"]);
const branch = run("git", ["branch", "--show-current"]);
const worktreeStatus = run("git", ["status", "--short"]);
const nodeVersion = run(process.execPath, ["--version"]);
const pnpmVersion = run(pnpmCommand, ["--version"]);

const preflight = [
  check(
    "PREFLIGHT-001",
    commit !== "unavailable",
    `Repository commit: ${commit}`,
  ),
  check(
    "PREFLIGHT-002",
    branch !== "unavailable",
    `Repository branch: ${branch}`,
  ),
  check(
    "PREFLIGHT-003",
    nodeVersion !== "unavailable",
    `Node runtime: ${nodeVersion}`,
  ),
  check(
    "PREFLIGHT-004",
    pnpmVersion !== "unavailable",
    `pnpm runtime: ${pnpmVersion}`,
  ),
  check(
    "PREFLIGHT-005",
    existsSync(physicalRecordTemplatePath),
    "Physical-device JSON evidence template is present",
  ),
  check(
    "PREFLIGHT-006",
    existsSync(
      join(root, "docs/templates/physical-device-validation-checklist.md"),
    ),
    "Physical-device operator checklist is present",
  ),
  check(
    "PREFLIGHT-007",
    existsSync(validationMatrixPath),
    "Workstation/device validation matrix is present",
  ),
  check(
    "PREFLIGHT-008",
    existsSync(join(root, "scripts/validate-release-readiness.mjs")),
    "Unified release-readiness harness is present",
  ),
  check(
    "PREFLIGHT-009",
    (() => {
      try {
        const template = JSON.parse(
          readFileSync(physicalRecordTemplatePath, "utf8"),
        );
        const ids = Array.isArray(template.scenarios)
          ? template.scenarios.map((scenario) => scenario?.id)
          : [];
        return (
          ids.length === PHYSICAL_GATE_IDS.length &&
          ids.every((id, index) => id === PHYSICAL_GATE_IDS[index])
        );
      } catch {
        return false;
      }
    })(),
    `Physical-device record template contains all ${PHYSICAL_GATE_IDS.length} canonical scenarios`,
  ),
  check(
    "PREFLIGHT-010",
    (() => {
      try {
        const matrix = readFileSync(validationMatrixPath, "utf8");
        return PHYSICAL_GATE_IDS.every((id) => matrix.includes(`\`${id}\``));
      } catch {
        return false;
      }
    })(),
    `Validation matrix contains all ${PHYSICAL_GATE_IDS.length} canonical scenarios`,
  ),
  check(
    "PREFLIGHT-011",
    allowDevelopmentWorktree ||
      worktreeStatus
        .split("\n")
        .filter(Boolean)
        .every((line) => line.startsWith("?? .github/")),
    allowDevelopmentWorktree
      ? "Development worktree explicitly allowed for local evidence-pack verification"
      : "No unexpected source changes are present; protected local .github/ is the only allowed worktree exception",
  ),
];

const readinessReport = process.env["ELITE_READINESS_REPORT"]
  ? resolve(root, process.env["ELITE_READINESS_REPORT"])
  : latestReadinessReport();
const syntheticPilotReport = join(
  root,
  "artifacts/pilot-rehearsal/run-report.json",
);
const reportPaths = [readinessReport, syntheticPilotReport].filter(Boolean);
for (const reportPath of reportPaths) {
  if (!existsSync(reportPath)) {
    failures.push(`Missing report: ${repositoryRelative(reportPath)}`);
    continue;
  }
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    if (report.syntheticOnly !== true) {
      failures.push(
        `Report is not marked syntheticOnly: ${repositoryRelative(reportPath)}`,
      );
    }
  } catch (error) {
    failures.push(
      `Invalid JSON report ${repositoryRelative(reportPath)}: ${String(error)}`,
    );
  }
}

const packageDirectory =
  process.platform === "win32" ? "win-unpacked" : "linux-unpacked";
const artifactCandidates = [
  {
    id: "desktop-asar",
    path: join(root, "release", packageDirectory, "resources", "app.asar"),
    required: requireArtifacts,
  },
  {
    id: "android-release-apk",
    path: join(
      root,
      "apps/android/app/build/outputs/apk/release/app-release-unsigned.apk",
    ),
    required: requireArtifacts,
  },
];
const artifactEvidence = artifactCandidates.map(({ id, path, required }) => {
  const exists = existsSync(path);
  if (required && !exists)
    failures.push(`Required artifact is missing: ${repositoryRelative(path)}`);
  return {
    id,
    path: repositoryRelative(path),
    exists,
    ...(exists ? { bytes: statSync(path).size, sha256: sha256File(path) } : {}),
    required,
  };
});

const copiedFiles = [];
for (const [source, destination] of [
  [readinessReport, "readiness-report.json"],
  [syntheticPilotReport, "synthetic-pilot-report.json"],
  [
    join(root, "docs/templates/physical-device-validation-record.json"),
    "physical-device-validation-record.json",
  ],
  [
    join(root, "docs/templates/physical-device-validation-checklist.md"),
    "physical-device-validation-checklist.md",
  ],
  [validationMatrixPath, "workstation-and-device-validation-matrix.md"],
].filter(([source]) => source)) {
  const copied = copyApprovedFile(source, destination);
  if (copied) copiedFiles.push(copied);
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  syntheticOnly: true,
  repository: { commit, branch },
  runtime: {
    platform: process.platform,
    arch: process.arch,
    node: nodeVersion,
    pnpm: pnpmVersion,
  },
  worktreeStatus,
  preflight,
  reports: reportPaths.map((path) => ({
    path: repositoryRelative(path),
    sha256: sha256File(path),
  })),
  artifacts: artifactEvidence,
  copiedFiles,
  pendingHardwareSignoff: true,
};
manifest.manifestSha256 = createHash("sha256")
  .update(JSON.stringify({ ...manifest, manifestSha256: null }))
  .digest("hex");
writeFileSync(
  join(outputPath, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  join(outputPath, "README.md"),
  `# Elite Clinic Pilot Evidence Pack\n\nThis pack is synthetic-only and was generated for commit ${commit}. It records local preflight results, report hashes, available desktop/APK artifact hashes, and the operator templates required for physical sign-off. It does not constitute Windows or Android hardware approval.\n\nRun from the repository root:\n\n\`\`\`bash\npnpm pilot:evidence -- --clean --require-artifacts\n\`\`\`\n\nThe physical-device operator must complete the checklist and add the signed validation record only after executing the matrix on approved hardware.\n`,
  "utf8",
);

console.log(`PILOT_EVIDENCE_PACK: ${repositoryRelative(outputPath)}`);
console.log(
  `PILOT_EVIDENCE_SUMMARY: ${preflight.filter((item) => item.status === "passed").length} preflight checks passed; ${artifactEvidence.filter((item) => item.exists).length} artifact(s) hashed; ${failures.length} failure(s).`,
);
if (failures.length > 0) {
  for (const failure of failures)
    console.error(`PILOT_EVIDENCE_FAILURE: ${failure}`);
  process.exitCode = 1;
}
