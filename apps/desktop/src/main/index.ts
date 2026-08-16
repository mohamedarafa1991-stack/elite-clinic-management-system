import { app, BrowserWindow, ipcMain, safeStorage, session } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFile);
let mainWindow: BrowserWindow | undefined;

function registerContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDevelopment = !app.isPackaged;
    const connectSources = isDevelopment
      ? "'self' http://localhost:5173 ws://localhost:5173"
      : "'self'";
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      `connect-src ${connectSources}`,
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: "#f7f8fa",
    webPreferences: {
      preload: join(currentDirectory, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    const allowed =
      targetUrl.startsWith("http://localhost:5173") ||
      targetUrl.startsWith("file://");
    if (!allowed) {
      event.preventDefault();
    }
  });

  return window;
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const developmentUrl =
    process.env["ELITE_RENDERER_URL"] ?? "http://localhost:5173";
  if (!app.isPackaged) {
    await window.loadURL(developmentUrl);
    return;
  }
  await window.loadFile(join(currentDirectory, "../renderer/index.html"));
}

function registerIpc(): void {
  ipcMain.handle("app:security-status", () => ({
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    isPackaged: app.isPackaged,
  }));
}

app.whenReady().then(async () => {
  registerContentSecurityPolicy();
  registerIpc();
  mainWindow = createWindow();
  await loadRenderer(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      void loadRenderer(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  mainWindow = undefined;
});
