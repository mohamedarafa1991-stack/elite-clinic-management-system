#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpsRequest } from "node:https";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env["ELITE_E2E_PORT"] ?? 18988);
const host = process.env["ELITE_E2E_HOST"] ?? "127.0.0.1";
const certificateHost = "localhost";
const runAndroid = process.argv.includes("--run-android");
const reportPath = process.env["ELITE_STEP28_REPORT"];
const tempDir = mkdtempSync(join(tmpdir(), "elite-step28-"));
const correctCertPath = join(tempDir, "hub-correct-cert.pem");
const correctKeyPath = join(tempDir, "hub-correct-key.pem");
const wrongCertPath = join(tempDir, "hub-wrong-cert.pem");
const wrongKeyPath = join(tempDir, "hub-wrong-key.pem");
const results = [];
let server;
let androidProcess;

function log(message) {
  console.log(`[step28] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function record(id, status, detail) {
  const result = { id, status, detail };
  results.push(result);
  log(`${status.toUpperCase()} ${id}: ${detail}`);
  return result;
}

function generateCertificate(certPath, keyPath, commonName) {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      `/CN=${commonName}`,
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      keyPath,
      "-out",
      certPath,
    ],
    { cwd: root, stdio: "ignore" },
  );
}

function assertPortClosed() {
  return new Promise((resolvePromise, reject) => {
    const socket = createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("LAN port unexpectedly accepted a connection"));
    });
    socket.once("error", () => resolvePromise());
  });
}

function httpsProbe(caPath) {
  return new Promise((resolvePromise, reject) => {
    const request = httpsRequest(
      {
        host: certificateHost,
        port,
        path: "/sync/session-init",
        method: "POST",
        ca: readFileSync(caPath),
        servername: certificateHost,
        rejectUnauthorized: true,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": "2",
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolvePromise(response.statusCode ?? 0));
      },
    );
    request.once("error", reject);
    request.end("{}");
  });
}

async function waitForHttps(caPath) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await httpsProbe(caPath);
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new Error("Timed out waiting for the desktop HTTPS listener");
}

async function loadDesktopServer() {
  const desktopBuild = join(root, "apps/desktop/dist/main/lan-sync-server.js");
  if (!existsSync(desktopBuild)) {
    fail("Desktop build is missing. Run pnpm desktop:build before Step 28.");
  }
  const { LanSyncHttpServer } = await import(desktopBuild);
  const router = { route: () => ({}) };
  return new LanSyncHttpServer(router, undefined, host, port);
}

function onceExit(child) {
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolvePromise([code ?? 1, signal]));
  });
}

async function runAndroidHook() {
  const command = process.env["ELITE_ANDROID_E2E_COMMAND"];
  if (!command) {
    record(
      "android-device-command",
      "pending",
      "ELITE_ANDROID_E2E_COMMAND is not configured; physical Android execution remains pending.",
    );
    return;
  }
  androidProcess = spawn(command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      ELITE_E2E_HUB_URL: `https://${certificateHost}:${port}`,
      ELITE_E2E_HUB_CERT_PATH: correctCertPath,
      ELITE_E2E_WRONG_CERT_PATH: wrongCertPath,
      ELITE_E2E_SCENARIO:
        "enrollment-offline-write-concurrent-devices-process-death-tls-recovery-idempotent-ack",
    },
  });
  const [code, signal] = await onceExit(androidProcess);
  if (code !== 0) {
    fail(
      `Android integration command exited with ${code} (${signal ?? "no signal"})`,
    );
  }
  record(
    "android-device-command",
    "passed",
    "Android hook completed the configured physical-device scenario set.",
  );
}

async function main() {
  generateCertificate(correctCertPath, correctKeyPath, "Elite Clinic Hub");
  generateCertificate(wrongCertPath, wrongKeyPath, "Wrong Elite Clinic Hub");
  record(
    "temporary-certificates",
    "passed",
    "Generated independent synthetic correct and wrong trust anchors.",
  );

  process.env["ELITE_SYNC_TLS_REQUIRED"] = "true";
  delete process.env["ELITE_SYNC_TLS_CERT_PATH"];
  delete process.env["ELITE_SYNC_TLS_KEY_PATH"];
  server = await loadDesktopServer();
  await server.start().then(
    () => fail("TLS-required desktop server started without certificate paths"),
    (error) => {
      if (!String(error?.message).includes("ELITE_LAN_TLS_REQUIRED")) {
        throw error;
      }
      record(
        "tls-fail-closed",
        "passed",
        "TLS-required startup rejected missing certificate configuration.",
      );
    },
  );
  await assertPortClosed();
  record(
    "tls-port-closed",
    "passed",
    "No listener remained after failed startup.",
  );

  process.env["ELITE_SYNC_TLS_CERT_PATH"] = correctCertPath;
  process.env["ELITE_SYNC_TLS_KEY_PATH"] = correctKeyPath;
  server = await loadDesktopServer();
  await server.start();
  const recoveredStatus = await waitForHttps(correctCertPath);
  if (recoveredStatus !== 503) {
    fail(
      `Recovered desktop probe returned ${recoveredStatus}; expected 503 without a session service`,
    );
  }
  record(
    "tls-correct-anchor",
    "passed",
    "HTTPS listener accepted the correct synthetic trust anchor.",
  );

  await httpsProbe(wrongCertPath).then(
    () => fail("Wrong certificate trust anchor unexpectedly succeeded"),
    () =>
      record(
        "tls-wrong-anchor",
        "passed",
        "HTTPS request with the wrong synthetic trust anchor failed closed.",
      ),
  );

  await server.stop();
  await httpsProbe(correctCertPath).then(
    () => fail("Stopped desktop listener unexpectedly accepted HTTPS"),
    () =>
      record(
        "hub-outage",
        "passed",
        "Hub outage produced a connection failure suitable for retry handling.",
      ),
  );

  server = await loadDesktopServer();
  await server.start();
  if ((await waitForHttps(correctCertPath)) !== 503) {
    fail("Desktop listener did not recover after restart");
  }
  record(
    "hub-restart-recovery",
    "passed",
    "Desktop HTTPS listener recovered after restart.",
  );

  if (runAndroid) {
    await runAndroidHook();
  } else {
    record(
      "android-device-command",
      "pending",
      "Use --run-android with ELITE_ANDROID_E2E_COMMAND for physical-device execution.",
    );
  }

  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    syntheticOnly: true,
    hub: `https://${certificateHost}:${port}`,
    results,
  };
  if (reportPath) {
    writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    log(`Wrote report to ${reportPath}`);
  }
  const pending = results.filter((result) => result.status === "pending");
  if (pending.length > 0) {
    log(
      `Desktop checks passed; ${pending.length} physical-device check(s) remain pending.`,
    );
  } else {
    log("STEP28_REAL_DEVICE_SYNC_E2E_OK");
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  record("harness", "failed", message);
  process.exitCode = 1;
} finally {
  if (androidProcess && androidProcess.exitCode === null) androidProcess.kill();
  if (server) await server.stop().catch(() => undefined);
  rmSync(tempDir, { recursive: true, force: true });
}
