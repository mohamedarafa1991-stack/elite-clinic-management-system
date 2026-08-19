import type { BrowserWindow, IpcMainInvokeEvent } from "electron";

export interface TrustedIpcSenderOptions {
  isPackaged: boolean;
  developmentRendererUrl: string;
}

function rejectUntrustedSender(message: string): never {
  throw new Error(`ELITE_IPC_UNTRUSTED_SENDER: ${message}`);
}

export function assertTrustedIpcSender(
  event: IpcMainInvokeEvent,
  trustedWindow: BrowserWindow | undefined,
  options: TrustedIpcSenderOptions,
): void {
  const senderFrame = event.senderFrame;
  if (
    !trustedWindow ||
    trustedWindow.isDestroyed() ||
    event.sender !== trustedWindow.webContents ||
    !senderFrame ||
    senderFrame !== event.sender.mainFrame
  ) {
    rejectUntrustedSender("IPC request came from an untrusted renderer frame");
  }

  const senderUrl = senderFrame.url;
  try {
    if (options.isPackaged) {
      if (!senderUrl.startsWith("file://")) {
        rejectUntrustedSender(
          "packaged IPC requests must come from a file frame",
        );
      }
      return;
    }

    const expectedOrigin = new URL(options.developmentRendererUrl).origin;
    if (new URL(senderUrl).origin !== expectedOrigin) {
      rejectUntrustedSender(
        "IPC request came from an untrusted renderer origin",
      );
    }
  } catch {
    rejectUntrustedSender("IPC request came from an invalid renderer origin");
  }
}
