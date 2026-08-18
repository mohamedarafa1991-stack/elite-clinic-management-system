#!/usr/bin/env node

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const androidRoot = join(root, "apps", "android");
const appRoot = join(androidRoot, "app");
const runBuild = process.argv.includes("--run");

function commandExists(command) {
  const result = spawnSync(
    process.platform === "win32" ? "where" : "which",
    [command],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  return result.status === 0;
}

function report(name, available, detail) {
  const marker = available ? "OK" : "MISSING";
  console.log(`${marker.padEnd(7)} ${name}${detail ? ` — ${detail}` : ""}`);
  return available;
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: androidRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Elite Clinic Step 27 Android build gate");
console.log(`Repository: ${root}`);
console.log(`Android project: ${androidRoot}`);

const javaAvailable = report(
  "Java",
  commandExists("java"),
  "JDK 17 is required by the project",
);
const androidSdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
const sdkAvailable = report(
  "Android SDK",
  Boolean(androidSdk && existsSync(androidSdk)),
  androidSdk || "Set ANDROID_SDK_ROOT or ANDROID_HOME",
);

const wrapper =
  process.platform === "win32"
    ? join(androidRoot, "gradlew.bat")
    : join(androidRoot, "gradlew");
const wrapperAvailable = report("Gradle wrapper", existsSync(wrapper), wrapper);
const systemGradle = commandExists("gradle");
const gradleAvailable = report(
  "Gradle runner",
  wrapperAvailable || systemGradle,
  wrapperAvailable
    ? wrapper
    : systemGradle
      ? "system gradle"
      : "Add the Gradle wrapper or install Gradle",
);
const projectFiles = report(
  "Android project",
  existsSync(join(androidRoot, "settings.gradle.kts")) &&
    existsSync(join(appRoot, "build.gradle.kts")),
  "settings.gradle.kts and app/build.gradle.kts",
);
const schemaExport = report(
  "Room schema export",
  existsSync(join(appRoot, "build.gradle.kts")),
  "KSP schemaLocation is configured in app/build.gradle.kts",
);

if (
  !javaAvailable ||
  !sdkAvailable ||
  !gradleAvailable ||
  !projectFiles ||
  !schemaExport
) {
  console.error(
    "\nStep 27 cannot run in this environment until all MISSING prerequisites are installed.",
  );
  process.exit(2);
}

if (!runBuild) {
  console.log(
    "\nToolchain is ready. Re-run with --run to execute the Android verification commands.",
  );
  process.exit(0);
}

const gradleCommand = wrapperAvailable ? wrapper : "gradle";
const gradlePrefix = wrapperAvailable ? [] : ["--no-daemon"];
run(gradleCommand, [
  ...gradlePrefix,
  "testDebugUnitTest",
  "lintDebug",
  "assembleDebug",
]);
const schemaV5 = join(appRoot, "schemas", "5.json");
if (!report("Room schema v5", existsSync(schemaV5), schemaV5)) {
  console.error(
    "\nThe Android build completed but did not export the expected Room schema version 5.",
  );
  process.exit(3);
}
console.log("\nSTEP27_ANDROID_BUILD_GATE_OK");
