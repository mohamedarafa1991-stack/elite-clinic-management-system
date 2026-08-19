import { app, BrowserWindow, ipcMain } from "electron";
import { createIpcRegistrar } from "../dist/main/ipc-registration.js";

app.disableHardwareAcceleration();

function record(results, name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function finish(results, exitCode = 0) {
  for (const result of results) {
    console.log(
      `${result.passed ? "IPC_RUNTIME_PASS" : "IPC_RUNTIME_FAIL"}: ${result.name}${result.detail ? ` (${result.detail})` : ""}`,
    );
  }
  app.exit(exitCode);
}

app.on("ready", async () => {
  console.log("IPC_RUNTIME_STAGE: app-ready");
  const results = [];
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: new URL("./ipc-runtime-preload.cjs", import.meta.url).pathname,
    },
  });

  const fixtureUrl = new URL("./ipc-runtime-fixture.html", import.meta.url);
  const register = createIpcRegistrar(
    ipcMain,
    () => window,
    () => ({
      isPackaged: false,
      developmentRendererUrl: fixtureUrl.href,
    }),
  );

  register("runtime:echo", (_event, payload) => {
    if (typeof payload !== "object" || payload === null) {
      throw new Error("ELITE_INPUT_INVALID: payload must be an object");
    }
    return { accepted: true };
  });
  register("runtime:unknown-error", () => {
    throw new Error("secret database path and patient EL-00001");
  });

  try {
    console.log("IPC_RUNTIME_STAGE: loading-fixture");
    await window.loadFile(fixtureUrl.pathname);
    const rendererResult = await window.webContents.executeJavaScript(
      "window.result",
      true,
    );
    record(
      results,
      "context isolation",
      rendererResult === "isolated",
      String(rendererResult),
    );

    const echoResult = await window.webContents.executeJavaScript(
      "window.eliteRuntime.invoke('runtime:echo', { kind: 'valid' })",
      true,
    );
    record(
      results,
      "trusted renderer invoke",
      echoResult?.accepted === true,
      JSON.stringify(echoResult),
    );

    let malformedError = "";
    try {
      await window.webContents.executeJavaScript(
        "window.eliteRuntime.invoke('runtime:echo', 'malformed')",
        true,
      );
    } catch (error) {
      malformedError = String(error);
    }
    record(
      results,
      "malformed payload rejected",
      malformedError.includes("ELITE_INPUT_INVALID"),
      malformedError,
    );

    let unknownError = "";
    try {
      await window.webContents.executeJavaScript(
        "window.eliteRuntime.invoke('runtime:unknown-error')",
        true,
      );
    } catch (error) {
      unknownError = String(error);
    }
    record(
      results,
      "unknown handler error redacted",
      unknownError.includes("ELITE_IPC_REQUEST_FAILED") &&
        !unknownError.includes("EL-00001") &&
        !unknownError.includes("database path"),
      unknownError,
    );
  } catch (error) {
    record(results, "runtime fixture completed", false, String(error));
  } finally {
    window.destroy();
    ipcMain.removeHandler("runtime:echo");
    ipcMain.removeHandler("runtime:unknown-error");
  }

  finish(results, results.some((result) => !result.passed) ? 1 : 0);
});

setTimeout(() => {
  console.error("IPC_RUNTIME_FAIL: Electron runtime fixture timed out");
  app.exit(2);
}, 15_000);
