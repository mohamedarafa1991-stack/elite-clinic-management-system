import type { LanSyncStatus } from "../preload/index.cjs";

export function sanitizeLanSyncStartupError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "ELITE_LAN_TLS_REQUIRED":
      return "LAN synchronization is unavailable because secure TLS configuration is required but not configured.";
    case "ELITE_LAN_TLS_CERTIFICATE_CONFIGURATION_INCOMPLETE":
      return "LAN synchronization is unavailable because both TLS certificate files must be configured.";
    default:
      return "LAN synchronization could not start. Verify the Hub TLS certificate and private-key configuration, then retry.";
  }
}

export function lanSyncStartingStatus(attemptAt: string): LanSyncStatus {
  return {
    state: "starting",
    message: "LAN synchronization is starting securely.",
    lastAttemptAt: attemptAt,
  };
}
