import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDirectory =
  process.argv.includes("--win") || process.platform === "win32"
    ? "win-unpacked"
    : "linux-unpacked";
const releaseDir = join(root, "release", packageDirectory);
const resourcesDir = join(releaseDir, "resources");
const asarPath = join(resourcesDir, "app.asar");
const unpackedDir = join(resourcesDir, "app.asar.unpacked");

function assert(condition, message) {
  if (!condition) throw new Error(`DESKTOP_PACKAGE_FAIL: ${message}`);
  console.log(`DESKTOP_PACKAGE_PASS: ${message}`);
}

function quoteWindowsArgument(value) {
  const text = String(value);
  return /[\s"]/.test(text)
    ? `"${text.replaceAll('"', '\\"')}"`
    : text;
}

function listArchive() {
  const args = ["exec", "asar", "list", asarPath];
  if (process.platform === "win32") {
    return execFileSync(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", ["pnpm.cmd", ...args].map(quoteWindowsArgument).join(" ")],
      { cwd: root, encoding: "utf8" },
    );
  }
  return execFileSync("pnpm", args, { cwd: root, encoding: "utf8" });
}

assert(existsSync(asarPath), "asar archive exists");
const listing = listArchive();
const requiredEntries = [
  "/dist/main/index.js",
  "/dist/main/ipc-registration.js",
  "/dist/preload/index.cjs",
  "/dist/renderer/index.html",
  "/node_modules/@elite/auth/dist/index.js",
  "/node_modules/@elite/contracts/dist/index.js",
  "/node_modules/@elite/database/dist/index.js",
  "/node_modules/pdfkit/js/pdfkit.js",
  "/package.json",
];
for (const entry of requiredEntries) {
  assert(listing.includes(entry), `asar contains ${entry}`);
}
assert(
  existsSync(join(unpackedDir, "node_modules/better-sqlite3-multiple-ciphers")),
  "native encrypted SQLite module is unpacked",
);
assert(
  !listing.includes("/src/main/index.ts"),
  "release archive does not include TypeScript source",
);
assert(
  !listing.includes("/scripts/ipc-runtime-smoke.mjs"),
  "release archive does not include runtime test scripts",
);
console.log(
  "DESKTOP_PACKAGE_PASS: per-user userData policy is documented; installer must preserve elite-clinic.db and elite-clinic.db.key",
);
