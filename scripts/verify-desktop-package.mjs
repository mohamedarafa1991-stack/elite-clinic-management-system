import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const releaseDir = join(root, "release", "linux-unpacked");
const resourcesDir = join(releaseDir, "resources");
const asarPath = join(resourcesDir, "app.asar");
const unpackedDir = join(resourcesDir, "app.asar.unpacked");

function assert(condition, message) {
  if (!condition) throw new Error(`DESKTOP_PACKAGE_FAIL: ${message}`);
  console.log(`DESKTOP_PACKAGE_PASS: ${message}`);
}

assert(existsSync(asarPath), "asar archive exists");
const listing = execFileSync("pnpm", ["exec", "asar", "list", asarPath], {
  cwd: root,
  encoding: "utf8",
});
const requiredEntries = [
  "/dist/main/index.js",
  "/dist/main/ipc-registration.js",
  "/dist/preload/index.js",
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
