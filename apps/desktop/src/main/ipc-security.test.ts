import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertTrustedIpcSender } from "./ipc-security.js";

type FakeFrame = { url: string };
type FakeWebContents = {
  mainFrame: FakeFrame;
};
type FakeWindow = {
  isDestroyed: () => boolean;
  webContents: FakeWebContents;
};

function fakeEvent(
  sender: FakeWebContents,
  senderFrame: FakeFrame | null,
): Parameters<typeof assertTrustedIpcSender>[0] {
  return { sender, senderFrame } as never;
}

function fakeWindow(
  sender: FakeWebContents,
  destroyed = false,
): Parameters<typeof assertTrustedIpcSender>[1] {
  return {
    isDestroyed: () => destroyed,
    webContents: sender,
  } as never;
}

describe("assertTrustedIpcSender", () => {
  it("accepts the trusted main frame in development", () => {
    const senderFrame = { url: "http://localhost:5173/index.html" };
    const sender = { mainFrame: senderFrame };

    expect(() =>
      assertTrustedIpcSender(
        fakeEvent(sender, senderFrame),
        fakeWindow(sender),
        {
          isPackaged: false,
          developmentRendererUrl: "http://localhost:5173",
        },
      ),
    ).not.toThrow();
  });

  it("rejects a child frame even when it shares the trusted webContents", () => {
    const mainFrame = { url: "http://localhost:5173/index.html" };
    const childFrame = { url: "http://localhost:5173/child.html" };
    const sender = { mainFrame };

    expect(() =>
      assertTrustedIpcSender(
        fakeEvent(sender, childFrame),
        fakeWindow(sender),
        {
          isPackaged: false,
          developmentRendererUrl: "http://localhost:5173",
        },
      ),
    ).toThrowError(/ELITE_IPC_UNTRUSTED_SENDER/);
  });

  it("rejects a different webContents and an unexpected development origin", () => {
    const senderFrame = { url: "http://localhost:5173/index.html" };
    const trustedSender = { mainFrame: senderFrame };
    const otherSender = { mainFrame: senderFrame };

    expect(() =>
      assertTrustedIpcSender(
        fakeEvent(otherSender, senderFrame),
        fakeWindow(trustedSender),
        {
          isPackaged: false,
          developmentRendererUrl: "http://localhost:5173",
        },
      ),
    ).toThrowError(/ELITE_IPC_UNTRUSTED_SENDER/);

    const unexpectedFrame = { url: "http://localhost:4173/index.html" };
    const unexpectedSender = { mainFrame: unexpectedFrame };
    expect(() =>
      assertTrustedIpcSender(
        fakeEvent(unexpectedSender, unexpectedFrame),
        fakeWindow(unexpectedSender),
        {
          isPackaged: false,
          developmentRendererUrl: "http://localhost:5173",
        },
      ),
    ).toThrowError(/ELITE_IPC_UNTRUSTED_SENDER/);
  });

  it("rejects a destroyed trusted window and a missing sender frame", () => {
    const senderFrame = { url: "http://localhost:5173/index.html" };
    const sender = { mainFrame: senderFrame };

    expect(() =>
      assertTrustedIpcSender(
        fakeEvent(sender, senderFrame),
        fakeWindow(sender, true),
        {
          isPackaged: false,
          developmentRendererUrl: "http://localhost:5173",
        },
      ),
    ).toThrowError(/ELITE_IPC_UNTRUSTED_SENDER/);

    expect(() =>
      assertTrustedIpcSender(fakeEvent(sender, null), fakeWindow(sender), {
        isPackaged: false,
        developmentRendererUrl: "http://localhost:5173",
      }),
    ).toThrowError(/ELITE_IPC_UNTRUSTED_SENDER/);
  });

  it("accepts a packaged file frame and rejects a remote packaged frame", () => {
    const packagedFrame = { url: "file:///app/renderer/index.html" };
    const packagedSender = { mainFrame: packagedFrame };
    expect(() =>
      assertTrustedIpcSender(
        fakeEvent(packagedSender, packagedFrame),
        fakeWindow(packagedSender),
        {
          isPackaged: true,
          developmentRendererUrl: "http://localhost:5173",
        },
      ),
    ).not.toThrow();

    const remoteFrame = { url: "https://example.invalid/index.html" };
    const remoteSender = { mainFrame: remoteFrame };
    expect(() =>
      assertTrustedIpcSender(
        fakeEvent(remoteSender, remoteFrame),
        fakeWindow(remoteSender),
        {
          isPackaged: true,
          developmentRendererUrl: "http://localhost:5173",
        },
      ),
    ).toThrowError(/ELITE_IPC_UNTRUSTED_SENDER/);
  });
});

describe("desktop IPC migration coverage", () => {
  it("registers every desktop channel through the centralized guard without unsafe casts", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const registrar = readFileSync(
      new URL("./ipc-registration.ts", import.meta.url),
      "utf8",
    );
    expect(source.match(/registerIpcHandler\(/g)).toHaveLength(136);
    expect(registrar.match(/ipcMain\.handle\(/g)).toHaveLength(1);
    expect(source).not.toMatch(/as never/);
  });
});
