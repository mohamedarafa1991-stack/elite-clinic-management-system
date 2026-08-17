import { afterEach, describe, expect, it } from "vitest";
import { LanSyncHttpServer } from "./lan-sync-server.js";
import { sanitizeLanSyncStartupError } from "./lan-sync-status.js";

const originalTlsRequired = process.env["ELITE_SYNC_TLS_REQUIRED"];
const originalCertificatePath = process.env["ELITE_SYNC_TLS_CERT_PATH"];
const originalPrivateKeyPath = process.env["ELITE_SYNC_TLS_KEY_PATH"];

function restoreTlsEnvironment(): void {
  if (originalTlsRequired === undefined) {
    delete process.env["ELITE_SYNC_TLS_REQUIRED"];
  } else {
    process.env["ELITE_SYNC_TLS_REQUIRED"] = originalTlsRequired;
  }
  if (originalCertificatePath === undefined) {
    delete process.env["ELITE_SYNC_TLS_CERT_PATH"];
  } else {
    process.env["ELITE_SYNC_TLS_CERT_PATH"] = originalCertificatePath;
  }
  if (originalPrivateKeyPath === undefined) {
    delete process.env["ELITE_SYNC_TLS_KEY_PATH"];
  } else {
    process.env["ELITE_SYNC_TLS_KEY_PATH"] = originalPrivateKeyPath;
  }
}

afterEach(restoreTlsEnvironment);

describe("LAN startup status", () => {
  it("redacts internal TLS details from administrator-facing messages", () => {
    const message = sanitizeLanSyncStartupError(
      new Error(
        "ENOENT: no such file or directory, open C:\\EliteClinic\\certs\\hub-key.pem",
      ),
    );
    expect(message).toContain("Verify the Hub TLS certificate");
    expect(message).not.toContain("hub-key.pem");
    expect(message).not.toContain("C:\\EliteClinic");
  });

  it("rejects TLS-required startup when certificate paths are absent", async () => {
    process.env["ELITE_SYNC_TLS_REQUIRED"] = "true";
    delete process.env["ELITE_SYNC_TLS_CERT_PATH"];
    delete process.env["ELITE_SYNC_TLS_KEY_PATH"];
    const server = new LanSyncHttpServer(
      { route: () => ({}) } as never,
      undefined,
      "127.0.0.1",
      0,
    );
    await expect(server.start()).rejects.toThrow("ELITE_LAN_TLS_REQUIRED");
  });

  it("rejects incomplete certificate configuration", async () => {
    delete process.env["ELITE_SYNC_TLS_REQUIRED"];
    process.env["ELITE_SYNC_TLS_CERT_PATH"] = "C:\\EliteClinic\\hub-cert.pem";
    delete process.env["ELITE_SYNC_TLS_KEY_PATH"];
    const server = new LanSyncHttpServer(
      { route: () => ({}) } as never,
      undefined,
      "127.0.0.1",
      0,
    );
    await expect(server.start()).rejects.toThrow(
      "ELITE_LAN_TLS_CERTIFICATE_CONFIGURATION_INCOMPLETE",
    );
  });
});
