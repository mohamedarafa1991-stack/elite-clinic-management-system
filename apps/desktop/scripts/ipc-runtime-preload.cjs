const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eliteRuntime", {
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
  },
});
