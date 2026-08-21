import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staging = join(root, ".packaging", "desktop-app");
const release = join(root, "release");
const mode = process.argv.includes("--win") ? "win" : "dir";
if (mode === "win" && process.platform !== "win32") {
  throw new Error(
    "WINDOWS_PACKAGE_REQUIRED: run the NSIS packaging command on the supported Windows workstation after native rebuild",
  );
}

function run(command, args) {
  const executable =
    process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
  execFileSync(executable, args, { cwd: root, stdio: "inherit" });
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(join(root, ".packaging"), { recursive: true });

run("pnpm", ["build:packages"]);
run("pnpm", ["desktop:build"]);
if (mode === "win") {
  run("pnpm", ["desktop:native-rebuild"]);
}
run("pnpm", [
  "deploy",
  "--legacy",
  "--filter",
  "@elite/desktop",
  "--prod",
  staging,
]);

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
} else {
  builderArgs.push("--linux", "dir");
}
run("pnpm", builderArgs);

const expectedOutput =
  mode === "win"
    ? join(release, "win-unpacked")
    : join(release, "linux-unpacked");
if (!existsSync(expectedOutput)) {
  throw new Error(
    `Packaging completed without expected output: ${expectedOutput}`,
  );
}
console.log(`DESKTOP_PACKAGE_PASS: ${mode} output at ${expectedOutput}`);
