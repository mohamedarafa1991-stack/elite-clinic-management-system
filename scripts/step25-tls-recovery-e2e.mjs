#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { request as httpsRequest } from "node:https";
import { setTimeout as delay } from "node:timers/promises";

const root = join(import.meta.dirname, "..");
const port = Number(process.env["ELITE_E2E_PORT"] ?? 18987);
const host = "127.0.0.1";
const certificateHost = "localhost";
const tempDir = mkdtempSync(join(tmpdir(), "elite-clinic-step25-"));
const correctCertPath = join(tempDir, "hub-cert.pem");
const correctKeyPath = join(tempDir, "hub-key.pem");
const wrongCertPath = join(tempDir, "wrong-cert.pem");
const wrongKeyPath = join(tempDir, "wrong-key.pem");

let server;
let androidProcess;

function log(message) {
  process.stdout.write(`[step25] ${message}\n`);
}

function fail(message) {
  throw new Error(`[step25] ${message}`);
}

function generateCertificate(certPath, keyPath, commonName) {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:3072",
      "-sha256",
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
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("LAN port unexpectedly accepted a connection"));
    });
    socket.once("error", () => resolve());
  });
}

function httpsProbe(caPath) {
  return new Promise((resolve, reject) => {
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
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.once("error", reject);
    request.end("{}");
  });
}

async function waitForHttps(caPath) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await httpsProbe(caPath);
    } catch {
      await delay(100);
    }
  }
  throw new Error("Timed out waiting for the recovered desktop HTTPS listener");
}

async function loadDesktopServer() {
  const { LanSyncHttpServer } = await import(
    join(root, "apps/desktop/dist/main/lan-sync-server.js")
  );
  const router = { route: () => ({}) };
  return new LanSyncHttpServer(router, undefined, host, port);
}

async function runAndroidHook() {
  const command = process.env["ELITE_ANDROID_E2E_COMMAND"];
  if (!command) {
    log(
      "Android command hook not configured; Android Gradle/device scenarios are marked pending.",
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
        "wrong-pin-correct-pin-outage-recovery-idempotent-outbox",
    },
  });
  const [code] = await onceExit(androidProcess);
  if (code !== 0) fail(`Android integration command exited with ${code}`);
}

function onceExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve([code ?? 1, signal]));
  });
}

async function main() {
  generateCertificate(correctCertPath, correctKeyPath, "Elite Clinic Hub");
  generateCertificate(wrongCertPath, wrongKeyPath, "Wrong Elite Clinic Hub");
  log(
    `Synthetic certificates generated in ${tempDir}; private keys remain temporary.`,
  );

  process.env["ELITE_SYNC_TLS_REQUIRED"] = "true";
  delete process.env["ELITE_SYNC_TLS_CERT_PATH"];
  delete process.env["ELITE_SYNC_TLS_KEY_PATH"];
  server = await loadDesktopServer();
  await server.start().then(
    () => fail("TLS-required server started without certificate paths"),
    (error) => {
      if (!String(error?.message).includes("ELITE_LAN_TLS_REQUIRED")) {
        throw error;
      }
      log("Missing certificate configuration correctly failed closed.");
    },
  );
  await assertPortClosed();

  process.env["ELITE_SYNC_TLS_CERT_PATH"] = correctCertPath;
  process.env["ELITE_SYNC_TLS_KEY_PATH"] = correctKeyPath;
  server = await loadDesktopServer();
  await server.start();
  const recoveredStatus = await waitForHttps(correctCertPath);
  if (recoveredStatus !== 503) {
    fail(
      `Recovered desktop HTTPS route returned ${recoveredStatus}, expected 503 from the probe without a session service`,
    );
  }
  log("Recovered desktop HTTPS listener accepted a certificate-trusted probe.");

  await httpsProbe(wrongCertPath).then(
    () => fail("Wrong certificate pin unexpectedly succeeded"),
    () => log("Wrong certificate trust anchor correctly failed closed."),
  );

  await server.stop();
  await httpsProbe(correctCertPath).then(
    () => fail("Stopped desktop listener unexpectedly accepted HTTPS"),
    () =>
      log("Listener outage produced a connection failure suitable for retry."),
  );

  server = await loadDesktopServer();
  await server.start();
  if ((await waitForHttps(correctCertPath)) !== 503) {
    fail("Desktop listener did not recover after restart");
  }
  log("Desktop HTTPS listener recovered after restart.");

  await runAndroidHook();
  log(
    "Desktop TLS recovery smoke matrix passed; Android hook status is reported above.",
  );
}

try {
  await main();
} finally {
  if (androidProcess && androidProcess.exitCode === null) androidProcess.kill();
  if (server) await server.stop().catch(() => undefined);
  rmSync(tempDir, { recursive: true, force: true });
}
