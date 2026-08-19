import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { PHYSICAL_GATE_IDS } from "./physical-gate-catalog.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const recordArgumentIndex = args.indexOf("--record");
const outputArgumentIndex = args.indexOf("--output");
const recordArgument =
  recordArgumentIndex >= 0 ? args[recordArgumentIndex + 1] : undefined;
const recordPath = recordArgument ? resolve(root, recordArgument) : null;
const outputPath =
  outputArgumentIndex >= 0 && args[outputArgumentIndex + 1]
    ? resolve(root, args[outputArgumentIndex + 1])
    : null;
const allowTemplate = args.includes("--allow-template");
const errors = [];

function fail(message) {
  errors.push(message);
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isPlaceholder(value) {
  return typeof value === "string" && value.trim().startsWith("replace");
}

function requireString(value, label, { placeholderAllowed = false } = {}) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
    return;
  }
  if (!placeholderAllowed && isPlaceholder(value)) {
    fail(`${label} still contains a template placeholder`);
  }
}

if (!recordPath || !existsSync(recordPath)) {
  fail(`Record file does not exist: ${recordPath ?? "missing --record path"}`);
} else {
  let record;
  try {
    record = JSON.parse(readFileSync(recordPath, "utf8"));
  } catch (error) {
    fail(`Record JSON is invalid: ${String(error)}`);
  }

  if (record) {
    if (record.schemaVersion !== 1) {
      fail("schemaVersion must be 1");
    }
    if (record.syntheticOnly !== true) {
      fail("syntheticOnly must be true; real patient evidence is prohibited");
    }
    if (!record.run || typeof record.run !== "object") {
      fail("run metadata is required");
    } else {
      requireString(record.run.runId, "run.runId", {
        placeholderAllowed: allowTemplate,
      });
      if (!allowTemplate && !isIsoDate(record.run.generatedAt)) {
        fail("run.generatedAt must be an ISO timestamp");
      }
      requireString(record.run.gitCommit, "run.gitCommit", {
        placeholderAllowed: allowTemplate,
      });
      if (!allowTemplate && !/^[0-9a-f]{40}$/iu.test(record.run.gitCommit)) {
        fail("run.gitCommit must be a full 40-character Git commit SHA");
      }
      requireString(record.run.operatorLabel, "run.operatorLabel", {
        placeholderAllowed: allowTemplate,
      });
      requireString(record.run.clinicBranch, "run.clinicBranch", {
        placeholderAllowed: allowTemplate,
      });
    }

    if (!Array.isArray(record.scenarios)) {
      fail("scenarios must be an array");
    } else {
      const scenarioIds = record.scenarios.map((scenario) => scenario?.id);
      const expectedIds = new Set(PHYSICAL_GATE_IDS);
      const actualIds = new Set(scenarioIds);
      if (scenarioIds.length !== expectedIds.size) {
        fail(
          `scenarios must contain exactly ${expectedIds.size} entries; found ${scenarioIds.length}`,
        );
      }
      if (actualIds.size !== scenarioIds.length) {
        fail("scenario IDs must be unique");
      }
      for (const id of expectedIds) {
        if (!actualIds.has(id)) fail(`missing scenario: ${id}`);
      }
      for (const id of actualIds) {
        if (!expectedIds.has(id)) fail(`unexpected scenario: ${String(id)}`);
      }

      for (const scenario of record.scenarios) {
        if (!scenario || typeof scenario !== "object") {
          fail("every scenario must be an object");
          continue;
        }
        const id = String(scenario.id ?? "unknown");
        const allowedStatuses = new Set([
          "pending",
          "blocked",
          "failed",
          "passed",
          "not-applicable",
        ]);
        if (!allowedStatuses.has(scenario.status)) {
          fail(`${id}: invalid status ${String(scenario.status)}`);
        }
        if (!allowTemplate && scenario.status === "passed") {
          if (!isIsoDate(scenario.startedAt))
            fail(`${id}: passed scenario needs startedAt`);
          if (!isIsoDate(scenario.completedAt))
            fail(`${id}: passed scenario needs completedAt`);
          requireString(scenario.observed, `${id}.observed`);
          if (
            !Array.isArray(scenario.evidence) ||
            scenario.evidence.length < 1
          ) {
            fail(`${id}: passed scenario needs at least one evidence path`);
          }
          if (
            Array.isArray(scenario.defectIds) &&
            scenario.defectIds.length > 0
          ) {
            fail(`${id}: passed scenario cannot retain defectIds`);
          }
        }
        if (!allowTemplate && scenario.status === "failed") {
          requireString(scenario.observed, `${id}.observed`);
          if (
            !Array.isArray(scenario.defectIds) ||
            scenario.defectIds.length < 1
          ) {
            fail(`${id}: failed scenario needs at least one defect ID`);
          }
        }
        if (!allowTemplate && scenario.status === "blocked") {
          requireString(scenario.observed, `${id}.observed`);
          if (
            !Array.isArray(scenario.evidence) ||
            scenario.evidence.length < 1
          ) {
            fail(`${id}: blocked scenario needs a blocking-evidence path`);
          }
        }
        if (!allowTemplate && scenario.status === "not-applicable") {
          requireString(scenario.observed, `${id}.observed`);
          requireString(scenario.notes, `${id}.notes`);
        }
      }
    }

    if (!record.approval || typeof record.approval !== "object") {
      fail("approval metadata is required");
    } else if (!allowTemplate && record.approval.status === "approved") {
      const scenarios = Array.isArray(record.scenarios) ? record.scenarios : [];
      const incomplete = scenarios.filter(
        (scenario) =>
          scenario.status !== "passed" && scenario.status !== "not-applicable",
      );
      if (incomplete.length > 0) {
        fail(
          `approval cannot be approved while scenarios are incomplete: ${incomplete
            .map((scenario) => scenario.id)
            .join(", ")}`,
        );
      }
      if (
        !Array.isArray(record.approval.approvedByAdminLabels) ||
        record.approval.approvedByAdminLabels.length < 2
      ) {
        fail("approved record requires two Admin approval labels");
      }
      if (!isIsoDate(record.approval.approvedAt)) {
        fail("approved record requires approval timestamp");
      }
    }
  }
}

const summary = {
  schemaVersion: 1,
  recordPath: recordPath ? recordPath.replace(`${root}/`, "") : null,
  syntheticOnly: true,
  expectedScenarioCount: PHYSICAL_GATE_IDS.length,
  valid: errors.length === 0,
  errors,
};
if (outputPath) {
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}
console.log(
  `PHYSICAL_RECORD_${summary.valid ? "PASS" : "FAIL"}: ${summary.valid ? `validated ${PHYSICAL_GATE_IDS.length} scenario IDs` : errors.join(" | ")}`,
);
if (!summary.valid) process.exitCode = 1;
