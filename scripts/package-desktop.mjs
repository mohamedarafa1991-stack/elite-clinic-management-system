import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staging = join(root, ".packaging", "desktop-app");
const release = join(root, "release");
const mode = process.argv.includes("--win")
  ? "win"
  : process.platform === "win32"
    ? "win-dir"
    : "dir";
if (mode === "win" && process.platform !== "win32") {
  throw new Error(
    "WINDOWS_PACKAGE_REQUIRED: run the NSIS packaging command on the supported Windows workstation after native rebuild",
  );
}

function quoteWindowsArgument(value) {
  const text = String(value);
  return /[\s"]/.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
}

function run(command, args) {
  if (process.platform === "win32") {
    const executable = command === "pnpm" ? "pnpm.cmd" : command;
    execFileSync(
      process.env.ComSpec ?? "cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        [executable, ...args].map(quoteWindowsArgument).join(" "),
      ],
      { cwd: root, stdio: "inherit" },
    );
    return;
  }
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

try {
  rmSync(staging, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  });
} catch (error) {
  throw new Error(
    `DESKTOP_PACKAGE_STAGING_LOCKED: close the Elite Clinic app and any Node/electron-builder process, then retry packaging: ${staging}`,
    { cause: error },
  );
}
mkdirSync(join(root, ".packaging"), { recursive: true });

run("pnpm", ["build:packages"]);
run("pnpm", ["desktop:build"]);
run("pnpm", [
  "deploy",
  "--legacy",
  "--filter",
  "@elite/desktop",
  "--prod",
  staging,
]);
if (mode === "win" || mode === "win-dir") {
  run("pnpm", [
    "exec",
    "electron-rebuild",
    "--force",
    "--module-dir",
    staging,
    "--version",
    "43.4.0",
  ]);
}

const builderArgs = [
  "exec",
  "electron-builder",
  "--projectDir",
  staging,
  "--config",
  join(root, "electron-builder.yml"),
  "--publish",
  "never",
];
if (mode === "win") {
  builderArgs.push("--win", "nsis", "--x64");
} else if (mode === "win-dir") {
  builderArgs.push("--win", "dir", "--x64");
} else {
  builderArgs.push("--linux", "dir");
}
run("pnpm", builderArgs);

const expectedOutput =
  mode === "dir"
    ? join(release, "linux-unpacked")
    : join(release, "win-unpacked");
if (!existsSync(expectedOutput)) {
  throw new Error(
    `Packaging completed without expected output: ${expectedOutput}`,
  );
}
console.log(`DESKTOP_PACKAGE_PASS: ${mode} output at ${expectedOutput}`);
