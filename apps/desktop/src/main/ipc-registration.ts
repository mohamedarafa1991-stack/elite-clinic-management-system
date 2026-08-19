import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import {
  assertTrustedIpcSender,
  type TrustedIpcSenderOptions,
} from "./ipc-security.js";

export type IpcHandler<Args extends unknown[] = unknown[]> = (
  event: IpcMainInvokeEvent,
  ...args: Args
) => unknown | Promise<unknown>;

export function toSafeIpcError(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  const code = message.match(/^ELITE_[A-Z0-9_]+/)?.[0];
  if (code) {
    return new Error(`${code}: request was rejected`);
  }
  return new Error("ELITE_IPC_REQUEST_FAILED: request could not be completed");
}

export function createIpcRegistrar(
  ipcMain: Pick<IpcMain, "handle">,
  getTrustedWindow: () => BrowserWindow | undefined,
  getSenderOptions: () => TrustedIpcSenderOptions,
): <Args extends unknown[]>(
  channel: string,
  handler: IpcHandler<Args>,
) => void {
  return function registerIpcHandler<Args extends unknown[]>(
    channel: string,
    handler: IpcHandler<Args>,
  ): void {
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrustedIpcSender(event, getTrustedWindow(), getSenderOptions());
      try {
        return await handler(event, ...(args as Args));
      } catch (error) {
        throw toSafeIpcError(error);
      }
    });
  };
}
