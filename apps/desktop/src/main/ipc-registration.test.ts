import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it } from "vitest";
import { assertTrustedIpcSender } from "./ipc-security.js";
import { createIpcRegistrar, toSafeIpcError } from "./ipc-registration.js";

type FakeEvent = IpcMainInvokeEvent;

type FakeFrame = { url: string };
type FakeWebContents = { mainFrame: FakeFrame };
type FakeWindow = {
  isDestroyed: () => boolean;
  webContents: FakeWebContents;
};

type RegisteredHandler = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => unknown | Promise<unknown>;

function makeEvent(sender: FakeWebContents, senderFrame: FakeFrame): FakeEvent {
  return { sender, senderFrame } as never;
}

function makeWindow(
  sender: FakeWebContents,
): Parameters<typeof assertTrustedIpcSender>[1] {
  return {
    isDestroyed: () => false,
    webContents: sender,
  } as never;
}

describe("toSafeIpcError", () => {
  it("preserves only a stable Elite error code", () => {
    expect(
      toSafeIpcError(
        new Error(
          "ELITE_AUTH_SESSION_EXPIRED: token=secret and patient=EL-00001",
        ),
      ).message,
    ).toBe("ELITE_AUTH_SESSION_EXPIRED: request was rejected");
  });

  it("does not expose arbitrary error details", () => {
    expect(
      toSafeIpcError(new Error("database path and patient data")).message,
    ).toBe("ELITE_IPC_REQUEST_FAILED: request could not be completed");
  });
});

describe("createIpcRegistrar", () => {
  it("validates the sender and dispatches the handler", async () => {
    const mainFrame = { url: "http://localhost:5173/index.html" };
    const sender = { mainFrame };
    const trustedWindow = makeWindow(sender);
    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain: Pick<IpcMain, "handle"> = {
      handle(channel, handler) {
        handlers.set(channel, handler as RegisteredHandler);
      },
    };
    const register = createIpcRegistrar(
      ipcMain,
      () => trustedWindow,
      () => ({
        isPackaged: false,
        developmentRendererUrl: "http://localhost:5173",
      }),
    );
    register("test:echo", async (_event, value: string) => `echo:${value}`);

    await expect(
      handlers.get("test:echo")?.(makeEvent(sender, mainFrame), "ok"),
    ).resolves.toBe("echo:ok");
  });

  it("rejects an untrusted sender before the handler runs", async () => {
    const mainFrame = { url: "http://localhost:5173/index.html" };
    const otherFrame = { url: "http://localhost:5173/index.html" };
    const trustedSender = { mainFrame };
    const otherSender = { mainFrame: otherFrame };
    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain: Pick<IpcMain, "handle"> = {
      handle(channel, handler) {
        handlers.set(channel, handler as RegisteredHandler);
      },
    };
    const register = createIpcRegistrar(
      ipcMain,
      () => makeWindow(trustedSender),
      () => ({
        isPackaged: false,
        developmentRendererUrl: "http://localhost:5173",
      }),
    );
    let invoked = false;
    register("test:guard", () => {
      invoked = true;
      return "should-not-run";
    });

    await expect(
      handlers.get("test:guard")?.(makeEvent(otherSender, otherFrame)),
    ).rejects.toThrow(/ELITE_IPC_UNTRUSTED_SENDER/);
    expect(invoked).toBe(false);
  });

  it("normalizes handler failures without leaking payload details", async () => {
    const mainFrame = { url: "http://localhost:5173/index.html" };
    const sender = { mainFrame };
    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain: Pick<IpcMain, "handle"> = {
      handle(channel, handler) {
        handlers.set(channel, handler as RegisteredHandler);
      },
    };
    const register = createIpcRegistrar(
      ipcMain,
      () => makeWindow(sender),
      () => ({
        isPackaged: false,
        developmentRendererUrl: "http://localhost:5173",
      }),
    );
    register("test:error", () => {
      throw new Error("ELITE_INPUT_INVALID: secret payload details");
    });

    await expect(
      handlers.get("test:error")?.(makeEvent(sender, mainFrame)),
    ).rejects.toThrow("ELITE_INPUT_INVALID: request was rejected");
  });
});
