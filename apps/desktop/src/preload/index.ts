import { contextBridge, ipcRenderer } from "electron";

export interface EliteSecurityStatus {
  electronVersion: string;
  chromiumVersion: string;
  nodeVersion: string;
  safeStorageAvailable: boolean;
  isPackaged: boolean;
}

const eliteApi = {
  app: {
    getSecurityStatus: (): Promise<EliteSecurityStatus> =>
      ipcRenderer.invoke("app:security-status") as Promise<EliteSecurityStatus>,
  },
};

contextBridge.exposeInMainWorld("elite", eliteApi);

declare global {
  interface Window {
    elite: typeof eliteApi;
  }
}
