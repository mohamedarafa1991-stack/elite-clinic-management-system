import { contextBridge, ipcRenderer } from "electron";

export interface EliteSecurityStatus {
  electronVersion: string;
  chromiumVersion: string;
  nodeVersion: string;
  safeStorageAvailable: boolean;
  isPackaged: boolean;
  secureServicesReady: boolean;
  serviceError?: string;
}

export interface AuthStatus {
  configured: boolean;
  bootstrapRequired: boolean;
  hubDeviceId?: string;
}

export interface SessionSummary {
  sessionId: string;
  userId: string;
  username: string;
  role: "admin" | "doctor" | "nurse" | "receptionist";
  deviceId: string;
  capabilities: readonly string[];
  expiresAt: string;
}

export interface DeviceSummary {
  id: string;
  friendlyName: string;
  platform: "windows" | "android";
  appVersion: string;
  apiLevel?: number;
  securityPatchLevel?: string;
  ownerUserId: string;
  status: "pending" | "active" | "revoked" | "wipe-pending";
  lastSeenAt?: string;
  lastSyncAt?: string;
  createdAt: string;
}

export interface EnrollmentRequestSummary {
  requestId: string;
  device: DeviceSummary;
  requestedByUserId: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewedByUserId?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

const eliteApi = {
  app: {
    getSecurityStatus: (): Promise<EliteSecurityStatus> =>
      ipcRenderer.invoke("app:security-status") as Promise<EliteSecurityStatus>,
  },
  auth: {
    getStatus: (): Promise<AuthStatus> =>
      ipcRenderer.invoke("auth:status") as Promise<AuthStatus>,
    bootstrap: (
      input: unknown,
    ): Promise<{ adminUserIds: readonly string[]; hubDeviceId: string }> =>
      ipcRenderer.invoke("auth:bootstrap", input) as Promise<{
        adminUserIds: readonly string[];
        hubDeviceId: string;
      }>,
    login: (
      input: unknown,
    ): Promise<{ token: string; session: SessionSummary }> =>
      ipcRenderer.invoke("auth:login", input) as Promise<{
        token: string;
        session: SessionSummary;
      }>,
    getSession: (token: string): Promise<SessionSummary> =>
      ipcRenderer.invoke("auth:session", token) as Promise<SessionSummary>,
    logout: (token: string): Promise<void> =>
      ipcRenderer.invoke("auth:logout", token) as Promise<void>,
    listDevices: (token: string): Promise<readonly DeviceSummary[]> =>
      ipcRenderer.invoke("auth:devices", token) as Promise<
        readonly DeviceSummary[]
      >,
    listEnrollmentRequests: (
      token: string,
    ): Promise<readonly EnrollmentRequestSummary[]> =>
      ipcRenderer.invoke("auth:enrollment-requests", token) as Promise<
        readonly EnrollmentRequestSummary[]
      >,
    requestDevice: (
      token: string,
      input: unknown,
    ): Promise<{ requestId: string; deviceId: string; status: string }> =>
      ipcRenderer.invoke("auth:device-request", token, input) as Promise<{
        requestId: string;
        deviceId: string;
        status: string;
      }>,
    approveDevice: (token: string, requestId: string): Promise<void> =>
      ipcRenderer.invoke(
        "auth:device-approve",
        token,
        requestId,
      ) as Promise<void>,
    rejectDevice: (
      token: string,
      requestId: string,
      reason: string,
    ): Promise<void> =>
      ipcRenderer.invoke(
        "auth:device-reject",
        token,
        requestId,
        reason,
      ) as Promise<void>,
    revokeDevice: (
      token: string,
      deviceId: string,
      reason: string,
    ): Promise<void> =>
      ipcRenderer.invoke(
        "auth:device-revoke",
        token,
        deviceId,
        reason,
      ) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld("elite", eliteApi);

declare global {
  interface Window {
    elite: typeof eliteApi;
  }
}
