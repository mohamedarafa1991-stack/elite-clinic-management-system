import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const androidRoot = resolve(repositoryRoot, "apps/android");
const argumentsToForward = process.argv.slice(2);

if (argumentsToForward.length === 0) {
  console.error("ANDROID_GRADLE_USAGE: provide at least one Gradle task");
  process.exit(2);
}

const wrapperName = process.platform === "win32" ? "gradlew.bat" : "gradlew";
const wrapperPath = resolve(androidRoot, wrapperName);
if (!existsSync(wrapperPath)) {
  console.error(`ANDROID_GRADLE_REQUIRED: missing ${wrapperPath}`);
  process.exit(2);
}

const result = spawnSync(wrapperPath, ["--no-daemon", ...argumentsToForward], {
  cwd: androidRoot,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(`ANDROID_GRADLE_FAILED: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
