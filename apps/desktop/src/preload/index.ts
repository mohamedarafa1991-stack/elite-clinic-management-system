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
  },
};

contextBridge.exposeInMainWorld("elite", eliteApi);

declare global {
  interface Window {
    elite: typeof eliteApi;
  }
}
